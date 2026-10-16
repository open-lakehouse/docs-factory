"""The Trestle catalog ↔ model join: module refs, the role map, the context artifact."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from docsnip import trestle

REV = "1406bec5f0ce484ce2c5157c87f8a24cdb71bc9a"

_MODEL = {
    "elements": {
        "lakehouse.catalog": {"kind": "capability", "title": "Catalog"},
        "lakehouse.objectStorage": {"kind": "capability", "title": "Object storage"},
        "lakehouse.governance": {"kind": "concern", "title": "Governance"},
        "lakehouse.governance.authorization": {"kind": "concern", "title": "Authz"},
        "lakehouse.observability": {"kind": "concern", "title": "Observability"},
        "ucSpec": {"kind": "openSpecification", "title": "Unity Catalog API"},
        "s3Api": {"kind": "openSpecification", "title": "S3 API"},
        "unityCatalogOSS": {
            "kind": "implementation",
            "title": "Unity Catalog (OSS)",
            "description": {"txt": "The reference server."},
            "links": [{"url": "https://unitycatalog.io"}],
        },
        "rustfs": {"kind": "implementation", "title": "RustFS"},
        "openPolicyAgent": {"kind": "implementation", "title": "OPA"},
        "jaeger": {"kind": "implementation", "title": "Jaeger"},
        "omnigent": {"kind": "implementation", "title": "Omnigent"},
        "postgresql": {"kind": "implementation", "title": "PostgreSQL"},
        "internalThing": {
            "kind": "implementation",
            "title": "X",
            "tags": ["generated"],
        },
    },
    "relations": {
        "r1": {
            "kind": "implements",
            "source": {"model": "unityCatalogOSS"},
            "target": {"model": "ucSpec"},
        },
        "r2": {
            "kind": "specifies",
            "source": {"model": "ucSpec"},
            "target": {"model": "lakehouse.catalog"},
        },
        "r3": {
            "kind": "implements",
            "source": {"model": "rustfs"},
            "target": {"model": "s3Api"},
        },
        "r4": {
            "kind": "specifies",
            "source": {"model": "s3Api"},
            "target": {"model": "lakehouse.objectStorage"},
        },
        "r5": {
            "kind": "realizes",
            "tags": ["partial"],
            "source": {"model": "openPolicyAgent"},
            "target": {"model": "lakehouse.governance.authorization"},
        },
        "r6": {
            "kind": "realizes",
            "source": {"model": "jaeger"},
            "target": {"model": "lakehouse.observability"},
        },
    },
}


def _module(mid: str, model: str | None, role: str | None, **extra) -> dict:
    return {
        "id": mid,
        "model": model,
        "provider_of": role,
        "display_name": mid.title(),
        **extra,
    }


_MODULES = [
    _module("unity-catalog", "unityCatalogOSS", "data_catalog"),
    _module("rustfs", "rustfs", "object_store"),
    _module("postgres", "postgresql", "relational_db"),
    # hosted and self-run modules may package the same implementation
    _module(
        "hosted-postgres", "postgresql", "relational_db", hosted={"kind": "postgres"}
    ),
    _module("opa", "openPolicyAgent", "policy"),
    _module("jaeger", "jaeger", "tracing"),
    # one module, two services: identity is per module, so one ref covers both
    _module("omnigent", "omnigent", "agent_platform"),
]

_MAP = """\
version: 1
catalog: olai-stack-topology
roles:
  data_catalog: { target: lakehouse.catalog, scope: full }
  object_store: { target: lakehouse.objectStorage, scope: full }
  policy: { target: lakehouse.governance.authorization, scope: partial }
  tracing: { target: lakehouse.observability, scope: partial }
  relational_db: { unmapped: infrastructure }
  agent_platform: { unmapped: infrastructure }
aliases: {}
"""


def _catalog(modules: list[dict], **envelope) -> dict:
    return {
        **envelope,
        "catalog": {
            "baseline": "olai-stack-topology@0.0.5",
            "manifests": [],
            "digest": "sha256:ab",
        },
        "modules": modules,
        "default_selection": {},
        "targets": [],
    }


def _repo(
    tmp_path: Path,
    *,
    modules: list[dict] | None = None,
    role_map: str = _MAP,
    model: dict | None = _MODEL,
    envelope: dict | None = None,
    fixed: bool = True,
) -> Path:
    (tmp_path / "envs").mkdir()
    (tmp_path / trestle.PIN).write_text(
        f'[trestle]\ngit = "https://example.test/trestle"\nrev = "{REV}"\npackage = "olai-trestle"\n'
    )
    dist = tmp_path / "architecture" / "dist"
    dist.mkdir(parents=True)
    (tmp_path / "architecture" / "integrations").mkdir()
    (tmp_path / trestle.MAP).write_text(role_map)
    catalog = _catalog(_MODULES if modules is None else modules, **(envelope or {}))
    (tmp_path / trestle.CATALOG).write_text(json.dumps(catalog))
    if model is not None:
        (dist / "model.json").write_text(json.dumps(model))
    if fixed:
        trestle.fix(tmp_path)
    return tmp_path


def test_clean_join_has_no_errors_or_gaps(tmp_path):
    report = trestle.check(_repo(tmp_path))
    assert report.errors == []
    assert report.gaps == []


def test_dangling_and_wrong_kind_refs_fail(tmp_path):
    modules = [
        _module("unity-catalog", "unityCatalog", "data_catalog"),
        _module("rustfs", "lakehouse.objectStorage", "object_store"),
    ]
    role_map = _MAP.replace("lakehouse.catalog", "lakehouse.katalog").replace(
        "target: lakehouse.objectStorage", "target: s3Api"
    )
    report = trestle.check(
        _repo(tmp_path, modules=modules, role_map=role_map, fixed=False)
    )
    text = "\n".join(report.errors)
    assert "model ref 'unityCatalog' is not in the estate model" in text
    assert (
        "model ref 'lakehouse.objectStorage' is of kind capability; expected implementation"
        in text
    )
    assert "target 'lakehouse.katalog' is not in the estate model" in text
    assert "target 's3Api' is of kind openSpecification" in text


def test_coverage_gaps_are_reported_not_failed(tmp_path):
    modules = [
        _module("unity-catalog", "unityCatalogOSS", "data_catalog"),
        _module("mystery", None, "notebooks"),
    ]
    report = trestle.check(_repo(tmp_path, modules=modules))
    assert report.errors == []
    gaps = "\n".join(report.gaps)
    assert "module mystery has no model ref" in gaps
    assert "role notebooks (module mystery) has no entry" in gaps
    assert "maps role object_store, which no catalog module provides" in gaps


def test_contribution_without_a_model_path_is_reported(tmp_path):
    # OPA realizes authorization, never the catalog
    modules = [_module("opa", "openPolicyAgent", "data_catalog")]
    report = trestle.check(_repo(tmp_path, modules=modules))
    assert any(
        "openPolicyAgent has no realizes/implements path" in g for g in report.gaps
    )


def test_a_facet_counts_toward_its_parent(tmp_path):
    role_map = _MAP.replace(
        "target: lakehouse.governance.authorization, scope: partial",
        "target: lakehouse.governance, scope: partial",
    )
    report = trestle.check(
        _repo(
            tmp_path,
            modules=[_module("opa", "openPolicyAgent", "policy")],
            role_map=role_map,
        )
    )
    assert not any("no realizes/implements path" in g for g in report.gaps)


def test_full_scope_over_a_partial_edge_is_reported(tmp_path):
    role_map = _MAP.replace(
        "authorization, scope: partial", "authorization, scope: full"
    )
    report = trestle.check(_repo(tmp_path, role_map=role_map))
    assert any("maps policy fully" in g and "#partial" in g for g in report.gaps)
    # a partial role over a full edge is fine: the role is narrower than the implementation
    assert not any("tracing" in g for g in report.gaps)


def test_aliases_resolve_a_renamed_role(tmp_path):
    modules = [_module("jaeger", "jaeger", "traces")]
    role_map = _MAP.replace("aliases: {}", "aliases: { traces: tracing }")
    report = trestle.check(_repo(tmp_path, modules=modules, role_map=role_map))
    assert not any("traces" in g for g in report.gaps)


@pytest.mark.parametrize(
    ("role_map", "message"),
    [
        (
            _MAP.replace("aliases: {}", "aliases: { tracing: policy }"),
            "also has its own entry",
        ),
        (
            _MAP.replace("aliases: {}", "aliases: { a: b, b: tracing }"),
            "is itself an alias",
        ),
        (_MAP.replace("aliases: {}", "aliases: { a: nowhere }"), "has no entry"),
        # a role listed twice must not silently keep the last entry
        (
            _MAP.replace(
                "  relational_db:", "  tracing: { unmapped: x }\n  relational_db:"
            ),
            "duplicate key 'tracing'",
        ),
        (
            _MAP.replace(
                "relational_db: { unmapped: infrastructure }",
                "relational_db: { unmapped: x, target: lakehouse.catalog }",
            ),
            "exactly one of target and unmapped",
        ),
        (
            _MAP.replace(
                "tracing: { target: lakehouse.observability, scope: partial }",
                "tracing: { target: lakehouse.observability, scope: most }",
            ),
            "scope must be one of",
        ),
        (_MAP.replace("version: 1", "version: 2"), "version must be 1"),
    ],
)
def test_malformed_maps_fail(tmp_path, role_map, message):
    report = trestle.check(_repo(tmp_path, role_map=role_map, fixed=False))
    assert any(message in e for e in report.errors), report.errors


def test_map_must_interpret_the_snapshot_catalog(tmp_path):
    role_map = _MAP.replace("catalog: olai-stack-topology", "catalog: someone-else")
    report = trestle.check(_repo(tmp_path, role_map=role_map))
    assert any("interprets catalog 'someone-else'" in e for e in report.errors)


def test_versioned_envelope_checks_the_pin(tmp_path):
    envelope = {
        "format": "trestle-catalog",
        "version": 1,
        "generator": {"name": "trestle", "version": "0.0.0", "revision": "0" * 40},
    }
    report = trestle.check(_repo(tmp_path, envelope=envelope, fixed=False))
    assert any("pins " + REV in e for e in report.errors)


def test_matching_revision_passes(tmp_path):
    envelope = {
        "format": "trestle-catalog",
        "version": 1,
        "generator": {"revision": REV},
    }
    assert trestle.check(_repo(tmp_path, envelope=envelope)).errors == []


@pytest.mark.parametrize(
    "envelope",
    [
        {"format": "trestle-catalog", "version": 7},
        {"format": "something-else", "version": 1},
    ],
)
def test_unknown_envelopes_fail(tmp_path, envelope):
    report = trestle.check(_repo(tmp_path, envelope=envelope, fixed=False))
    assert report.errors and report.errors[0].startswith(trestle.CATALOG)


def test_no_model_export_checks_nothing_against_it(tmp_path):
    report = trestle.check(_repo(tmp_path, model=None))
    assert report.errors == []


def test_no_role_map_means_nothing_to_check(tmp_path):
    assert trestle.check(tmp_path) == trestle.Report([], [])


def test_stale_context_fails_and_fix_is_stable(tmp_path):
    root = _repo(tmp_path)
    assert trestle.fix(root) is False
    (root / trestle.CONTEXT).write_text("{}\n")
    assert any("is stale" in e for e in trestle.check(root).errors)
    assert trestle.fix(root) is True
    assert trestle.check(root).errors == []


def test_context_carries_model_facts_only(tmp_path):
    modules = [*_MODULES, _module("internal", "internalThing", None)]
    root = _repo(tmp_path, modules=modules)
    context = json.loads((root / trestle.CONTEXT).read_text())
    assert context["format"] == "docs-factory-trestle-context"
    uc = context["modules"]["unity-catalog"]
    assert uc == {
        "title": "Unity-Catalog",
        "role": "data_catalog",
        "model": "unityCatalogOSS",
        "implements": ["ucSpec"],
    }
    assert context["concepts"]["unityCatalogOSS"]["links"] == [
        "https://unitycatalog.io"
    ]
    assert context["roles"]["relational_db"] == {"unmapped": "infrastructure"}
    assert context["roles"]["policy"] == {
        "target": "lakehouse.governance.authorization",
        "scope": "partial",
    }
    # generated elements and repo paths never leak into the artifact
    assert "internalThing" not in context["concepts"]
    assert "content/" not in (root / trestle.CONTEXT).read_text()


def test_committed_join_is_clean():
    root = Path(__file__).resolve().parents[3]
    if not (root / trestle.CATALOG).is_file():
        pytest.skip("no committed Trestle catalog snapshot")
    assert trestle.check(root).errors == []
