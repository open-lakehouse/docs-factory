"""Generated environments: plan.json → deployment fragment, registry facts, and fit."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from docsnip import envgen, environments
from test_trestle import _MODEL, REV
from test_trestle import _repo as _trestle_repo

_PLAN: dict[str, Any] = {
    "format": "trestle-plan",
    "version": 1,
    "state": "planned",
    "generator": {"name": "trestle", "version": "0.0.9", "revision": REV},
    "catalog": {
        "baseline": "olai-stack-topology@0.0.5",
        "manifests": [],
        "digest": "sha256:ab",
    },
    "recipe": {"digest": "sha256:cd"},
    "context": {"env_name": "uc-docs"},
    "graph": {
        "nodes": [
            {"id": "@clients", "model": None, "kind": "clients"},
            {"id": "envoy", "model": "envoy", "kind": "gateway", "role": "gateway"},
            {"id": "postgres", "model": "postgresql", "role": "relational_db"},
            {
                "id": "rustfs",
                "model": "rustfs",
                "role": "object_store",
                "summary": "S3.",
            },
            {"id": "unity-catalog", "model": "unityCatalogOSS", "role": "data_catalog"},
        ],
        "edges": [
            {
                "kind": "access",
                "key": "access:@clients→envoy:8080",
                "from": "@clients",
                "to": "envoy",
            },
            {
                "kind": "route",
                "key": "route:envoy→unity-catalog:8080",
                "from": "envoy",
                "to": "unity-catalog",
                "host_port": 8080,
            },
            {
                "kind": "uses",
                "key": "uses:unity-catalog→postgres:relational_db",
                "from": "unity-catalog",
                "to": "postgres",
                "role": "relational_db",
                "protocol": "PostgreSQL",
            },
            {
                "kind": "uses",
                "key": "uses:unity-catalog→rustfs:object_store",
                "from": "unity-catalog",
                "to": "rustfs",
                "role": "object_store",
                "protocol": "S3",
            },
        ],
    },
    "services": {
        "envoy": [{"name": "envoy", "placement": {"kind": "container"}}],
        "postgres": [{"name": "db", "placement": {"kind": "container"}}],
        "rustfs": [{"name": "rustfs", "placement": {"kind": "container"}}],
        "unity-catalog": [{"name": "unitycatalog", "placement": {"kind": "container"}}],
    },
    "gateway": {
        "listeners": [
            {
                "host_port": 8080,
                "routes": [
                    {"prefix": "/api/2.1/unity-catalog", "cluster": "unitycatalog"},
                    {"prefix": "/unity-catalog", "cluster": "unitycatalog"},
                ],
            },
            {"host_port": 9000, "routes": [{"prefix": "/", "cluster": "rustfs"}]},
        ]
    },
    "client": {
        "host": {
            "AWS_ENDPOINT_URL": "http://localhost:9000",
            "UNITY_CATALOG_URL": "http://localhost:8080/api/2.1/unity-catalog",
        },
        "container": {},
    },
    "files": [],
}

_MODEL_ENV: dict[str, Any] = copy.deepcopy(_MODEL)
_MODEL_ENV["elements"].update(
    {
        "envoy": {"kind": "implementation", "title": "Envoy"},
        "icebergRestSpec": {"kind": "openSpecification", "title": "Iceberg REST"},
        "lakehouse.table": {"kind": "asset", "title": "Table"},
        "otherCatalog": {"kind": "implementation", "title": "Other catalog"},
    }
)

_REGISTRY = """\
environments:
  unitycatalog/compose.yaml:
    title: UC
    ports: [8080]
  uc-aws/compose.yaml:
    title: UC with S3
    generated: uc-aws
"""


def _repo(tmp_path: Path, plan: dict | None = None, registry: str = _REGISTRY) -> Path:
    root = _trestle_repo(tmp_path, model=_MODEL_ENV)
    env = root / "envs" / "uc-aws"
    env.mkdir(parents=True)
    (env / "env.toml").write_text("version = 3\n")
    (env / "plan.json").write_text(json.dumps(plan or _PLAN))
    (root / "envs" / "environments.yml").write_text(registry)
    return root


def _fixed(tmp_path: Path, **kw) -> Path:
    root = _repo(tmp_path, **kw)
    envgen.fix(root)
    return root


def _fragment(root: Path) -> str:
    return (root / envgen.FRAGMENTS / "uc-aws.likec4").read_text()


def test_fix_projects_nodes_edges_and_facts(tmp_path):
    root = _fixed(tmp_path)
    text = _fragment(root)
    assert 'environment ucAws "uc-aws (generated)" {' in text
    assert 'unityCatalog = service "unitycatalog" {' in text
    assert 'postgres = datastore "db" {' in text
    assert 'rustfs = datastore "rustfs" {' in text
    assert "instanceOf unityCatalogOSS" in text
    # every edge but `access`, each traced to its plan key
    assert (
        'ucAws.envoy -[flows]-> ucAws.unityCatalog ":8080 /api/2.1/unity-catalog, /unity-catalog"'
        in text
    )
    assert 'trestleEdge "route:envoy→unity-catalog:8080"' in text
    # S3 is a spec-backed capability; the relational store is infrastructure
    assert 'ucAws.unityCatalog -[consumes]-> ucAws.rustfs "S3"' in text
    assert 'ucAws.unityCatalog -[dependsOn]-> ucAws.postgres "PostgreSQL"' in text
    assert "@clients" not in text and "access:" not in text
    facts = json.loads((root / envgen.FACTS).read_text())
    assert facts["environments"]["uc-aws"] == {
        "ports": [8080, 9000],
        "client-env": _PLAN["client"]["host"],
        "services": [
            {"node": "envoy", "element": "envoy", "role": "gateway", "url": None},
            {
                "node": "postgres",
                "element": "postgresql",
                "role": "relational_db",
                "url": None,
            },
            {
                "node": "rustfs",
                "element": "rustfs",
                "role": "object_store",
                "url": "http://localhost:9000",
            },
            {
                "node": "unity-catalog",
                "element": "unityCatalogOSS",
                "role": "data_catalog",
                "url": "http://localhost:8080/api/2.1/unity-catalog",
            },
        ],
        "files": [],
    }
    assert envgen.check(root) == []
    assert envgen.fix(root) == []  # idempotent


def test_files_are_the_render_and_its_build_contexts(tmp_path):
    plan = copy.deepcopy(_PLAN)
    plan["files"] = [
        {"path": "compose.yaml", "sensitive": False},
        {"path": "modules/rustfs/.env/rustfs.env", "sensitive": False},
    ]
    root = _repo(tmp_path, plan=plan)
    env = root / "envs" / "uc-aws"
    (env / "env.toml").write_text(
        'version = 3\n[selection.knob_overrides.unity-catalog]\nbuild = "image"\n'
    )
    (env / "image" / "bin").mkdir(parents=True)
    (env / "image" / "Dockerfile").write_text("FROM x\n")
    (env / "image" / "bin" / "uc").write_text("#!/bin/sh\n")
    (env / "notes.txt").write_text("not rendered\n")
    envgen.fix(root)
    facts = json.loads((root / envgen.FACTS).read_text())
    assert facts["environments"]["uc-aws"]["files"] == [
        "compose.yaml",
        "image/Dockerfile",
        "image/bin/uc",
        "modules/rustfs/.env/rustfs.env",
    ]


def test_a_missing_build_context_fails(tmp_path):
    root = _repo(tmp_path)
    (root / "envs" / "uc-aws" / "env.toml").write_text(
        'version = 3\n[selection.knob_overrides.unity-catalog]\nbuild = "image"\n'
    )
    assert any("build context image/ is missing" in e for e in envgen.check(root))


def test_registry_merges_derived_facts(tmp_path):
    root = _fixed(tmp_path)
    env = environments.load(root)["uc-aws/compose.yaml"]
    assert env.ports == [8080, 9000]
    assert env.client_env["UNITY_CATALOG_URL"].endswith("/api/2.1/unity-catalog")


def test_a_generated_entry_cant_author_derived_facts(tmp_path):
    registry = _REGISTRY.replace(
        "generated: uc-aws", "generated: uc-aws\n    ports: [1]"
    )
    root = _fixed(tmp_path, registry=registry)
    with pytest.raises(
        ValueError, match="takes ports, client-env, services, and files"
    ):
        environments.load(root)


def test_a_generated_entry_cant_author_services(tmp_path):
    registry = _REGISTRY.replace(
        "generated: uc-aws", "generated: uc-aws\n    services: []"
    )
    root = _fixed(tmp_path, registry=registry)
    with pytest.raises(ValueError, match="services"):
        environments.load(root)


def test_a_hand_edit_is_stale(tmp_path):
    root = _fixed(tmp_path)
    path = root / envgen.FRAGMENTS / "uc-aws.likec4"
    path.write_text(path.read_text().replace("db", "database"))
    assert envgen.check(root) == [
        f"{envgen.FRAGMENTS / 'uc-aws.likec4'} is stale; run `uv run docsnip envs --fix`"
    ]


def test_an_orphan_fragment_is_stale_and_fix_removes_it(tmp_path):
    root = _fixed(tmp_path)
    orphan = root / envgen.FRAGMENTS / "gone.likec4"
    orphan.write_text("deployment {}\n")
    assert any("gone.likec4 is stale" in e for e in envgen.check(root))
    envgen.fix(root)
    assert not orphan.exists()


def test_wrong_revision_and_catalog_digest_fail(tmp_path):
    plan = copy.deepcopy(_PLAN)
    plan["generator"]["revision"] = "0" * 40
    plan["catalog"]["digest"] = "sha256:other"
    errors = "\n".join(envgen.check(_repo(tmp_path, plan=plan)))
    assert f"rendered by Trestle {'0' * 40}, but envs/trestle.toml pins {REV}" in errors
    assert "planned against catalog sha256:other" in errors


def test_unknown_format_fails(tmp_path):
    plan = {**_PLAN, "format": "something-else"}
    assert "format 'something-else' is not trestle-plan" in "\n".join(
        envgen.check(_repo(tmp_path, plan=plan))
    )


def test_a_node_without_a_model_or_with_a_wrong_kind_fails(tmp_path):
    plan = copy.deepcopy(_PLAN)
    plan["graph"]["nodes"][2]["model"] = None
    plan["graph"]["nodes"][3]["model"] = "lakehouse.objectStorage"
    errors = "\n".join(envgen.check(_repo(tmp_path, plan=plan)))
    assert "node postgres has no model ref" in errors
    assert (
        "'lakehouse.objectStorage' is of kind capability; expected implementation"
        in errors
    )


def test_an_unknown_edge_kind_fails(tmp_path):
    plan = copy.deepcopy(_PLAN)
    plan["graph"]["edges"].append(
        {"kind": "teleports", "key": "t", "from": "envoy", "to": "rustfs"}
    )
    assert "unknown kind 'teleports'" in "\n".join(
        envgen.check(_repo(tmp_path, plan=plan))
    )


def test_an_environment_without_a_registry_entry_fails(tmp_path):
    registry = "environments:\n  unitycatalog/compose.yaml:\n    title: UC\n"
    root = _fixed(tmp_path, registry=registry)
    assert envgen.check(root) == [
        "envs/uc-aws: no envs/environments.yml entry says `generated: uc-aws`"
    ]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("unity-catalog", "unityCatalog"),
        ("uc-aws", "ucAws"),
        ("2fa", "n2fa"),
        ("db", "db"),
    ],
)
def test_ident_escapes_deterministically(value, expected):
    assert envgen.ident(value) == expected


# --- environment fit ------------------------------------------------------------

_MATRIX = """\
interfaces:
  spark: {label: Spark}
journeys:
  table.read:
    title: Read
    summary: Read rows
    asset: lakehouse.table
    requires:
      client: { consumes: [ucSpec] }
      catalog: { implements: [ucSpec] }
      storage: { implements: [s3Api] }
  iceberg.read:
    title: Read Iceberg
    summary: Read an Iceberg table
    asset: lakehouse.table
    requires:
      client: { consumes: [icebergRestSpec] }
      catalog: { implements: [icebergRestSpec] }
tables:
  ops:
    columns: [spark]
    rows: [table.read, iceberg.read]
"""

_SCRIPT = """\
# /// script
# dependencies = []
#
# [tool.docs-factory]
# compose = "../../../../../envs/{compose}"
{claims}# ///
# --8<-- [start:read]
print("read")
# --8<-- [end:read]
"""

_PAGE = """\
---
title: Engine
diataxis: how-to
project: proj
status: ready
---

## Read it

```python file=./snippets/x.py start=start:read end=end:read
```
"""


def _with_claims(
    root: Path, *claims: str, compose: str = "uc-aws/compose.yaml"
) -> Path:
    page = root / "content" / "proj" / "how-to" / "001-engine"
    (page / "snippets").mkdir(parents=True)
    (page / "index.md").write_text(_PAGE)
    lines = "".join(f"# {c}\n" for c in claims)
    (page / "snippets" / "x.py").write_text(
        _SCRIPT.format(compose=compose, claims=lines)
    )
    (root / "content" / "proj" / "compatibility.yml").write_text(_MATRIX)
    return root


_READ = 'claims.spark = [{ journey = "table.read", region = "read" }]'
_ICEBERG = 'claims.spark = [{ journey = "iceberg.read", region = "read" }]'
_ICEBERG_FAILS = 'claims.spark = [{ journey = "iceberg.read", fails = true }]'


def test_fit_holds_when_the_environment_runs_every_provider(tmp_path):
    fit = envgen.fit(_with_claims(_fixed(tmp_path), _READ))
    assert fit.errors == [] and fit.reports == []


def test_fit_fails_when_no_implementation_provides_a_requirement(tmp_path):
    # the environment's catalog implements ucSpec but not Iceberg REST
    fit = envgen.fit(_with_claims(_fixed(tmp_path), _ICEBERG))
    assert len(fit.errors) == 1
    assert (
        "iceberg.read on uc-aws: no implementation in the environment implements icebergRestSpec (the journey's catalog)"
        in fit.errors[0]
    )


def test_a_negative_claim_is_exempt(tmp_path):
    fit = envgen.fit(_with_claims(_fixed(tmp_path), _ICEBERG_FAILS))
    assert fit.errors == []


def test_several_candidates_are_reported_not_failed(tmp_path):
    plan = copy.deepcopy(_PLAN)
    plan["graph"]["nodes"].append(
        {"id": "other", "model": "otherCatalog", "role": "data_catalog"}
    )
    model = copy.deepcopy(_MODEL_ENV)
    model["relations"]["r9"] = {
        "kind": "implements",
        "source": {"model": "otherCatalog"},
        "target": {"model": "ucSpec"},
    }
    root = _repo(tmp_path, plan=plan)
    (root / "architecture" / "dist" / "model.json").write_text(json.dumps(model))
    envgen.fix(root)
    fit = envgen.fit(_with_claims(root, _READ))
    assert fit.errors == []
    assert len(fit.reports) == 1
    assert (
        "catalog implements ucSpec is ambiguous (otherCatalog, unityCatalogOSS)"
        in fit.reports[0]
    )


def test_a_hand_written_environment_isnt_checked(tmp_path):
    root = _with_claims(_fixed(tmp_path), _ICEBERG, compose="unitycatalog/compose.yaml")
    assert envgen.fit(root).errors == []
