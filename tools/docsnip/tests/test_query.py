"""docsnip query over a small fixture repo: evidence states, partial edges, roll-up."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from docsnip import cli, compat, query

_MODEL = {
    "elements": {
        "lakehouse.catalog": {"kind": "capability", "tags": ["public"]},
        "lakehouse.credential": {"kind": "assetKind"},
        "gov": {"kind": "concern"},
        "gov.authn": {"kind": "concern"},
        "gov.authz": {"kind": "concern"},
        "unityCatalogSpec": {"kind": "openSpecification"},
        "uc": {"kind": "implementation", "tags": ["public"]},
        "idp": {"kind": "implementation"},
        "orphan": {"kind": "implementation"},
    },
    "relations": {
        "r1": {
            "kind": "specifies",
            "source": {"model": "unityCatalogSpec"},
            "target": {"model": "lakehouse.catalog"},
        },
        "r2": {
            "kind": "implements",
            "source": {"model": "uc"},
            "target": {"model": "unityCatalogSpec"},
        },
        "r3": {
            "kind": "realizes",
            "source": {"model": "uc"},
            "target": {"model": "gov.authz"},
        },
        "r4": {
            "kind": "realizes",
            "source": {"model": "uc"},
            "target": {"model": "gov.authn"},
            "tags": ["partial"],
        },
        "r5": {
            "kind": "realizes",
            "source": {"model": "idp"},
            "target": {"model": "gov.authn"},
        },
    },
    "views": {
        "explain_gov": {"nodes": [{"modelRef": "gov"}, {"modelRef": "uc"}]},
        "localDeploy": {"nodes": [{"modelRef": "uc"}]},
    },
}

_PLAN = {
    "format": "trestle-plan",
    "version": 1,
    "generator": {"revision": "x"},
    "catalog": {"digest": "d"},
    "graph": {
        "nodes": [
            {"id": "@clients", "kind": "clients"},
            {
                "id": "unity-catalog",
                "kind": "component",
                "role": "data_catalog",
                "model": "uc",
            },
        ],
        "edges": [],
    },
    "services": {},
    "gateway": {},
    "client": {},
}

_SCRIPT = """\
# /// script
# requires-python = ">=3.11"
# dependencies = []
#
# [tool.docs-factory]
# compose = "../../../../../envs/local/compose.yaml"
# claims.sdk = [
#   { journey = "credential.create", region = "create" },
# ]
# ///
"""


def _artifact(ready: bool) -> dict:
    proof = {
        "script": "content/p/how-to/creds/snippets/creds.py",
        "ready": ready,
        "works": True,
    }
    return {
        "version": 2,
        "project": "p",
        "interfaces": [{"key": "sdk", "model": None}],
        "journeys": [
            {
                "id": "credential.create",
                "asset": "lakehouse.credential",
                "requires": {"catalog": {"implements": ["unityCatalogSpec"]}},
                "cells": {"sdk": {"status": "tested", "proofs": [proof]}},
            }
        ],
    }


def _repo(tmp_path: Path, *, ready: bool = True) -> Path:
    dist = tmp_path / "architecture" / "dist"
    dist.mkdir(parents=True)
    (dist / "model.json").write_text(json.dumps(_MODEL))
    env = tmp_path / "envs" / "local"
    env.mkdir(parents=True)
    (env / "env.toml").write_text("")
    (env / "compose.yaml").write_text("services: {}\n")
    (env / "plan.json").write_text(json.dumps(_PLAN))
    (tmp_path / "envs" / "environments.yml").write_text(
        "environments:\n  local/compose.yaml:\n    title: Local\n    generated: local\n"
    )
    (tmp_path / "envs" / "environments.generated.json").write_text(
        json.dumps(
            {
                "version": 1,
                "environments": {
                    "local": {
                        "ports": [8080],
                        "client-env": {},
                        "services": [
                            {
                                "node": "unity-catalog",
                                "element": "uc",
                                "role": "data_catalog",
                                "url": None,
                            }
                        ],
                        "files": ["compose.yaml"],
                    }
                },
            }
        )
    )
    page = tmp_path / "content" / "p" / "how-to" / "creds"
    (page / "snippets").mkdir(parents=True)
    status = "ready" if ready else "draft"
    (page / "index.md").write_text(
        f"---\ntitle: Creds\ndiataxis: how-to\nproject: p\nstatus: {status}\n"
        "references: [gov]\n---\nUses [UC](model:uc).\n"
    )
    (page / "snippets" / "creds.py").write_text(_SCRIPT)
    (tmp_path / "content" / "p" / "compatibility.json").write_text(
        json.dumps(_artifact(ready))
    )
    return tmp_path


def _ask(root: Path, kind: str, ident: str) -> dict:
    envelope = query.run(query.load(root), kind, ident)
    assert (envelope["format"], envelope["version"], envelope["query"]) == (
        "docsnip-query",
        1,
        kind,
    )
    return envelope["answer"]


def test_a_partial_edge_never_satisfies_and_the_parent_needs_every_facet(tmp_path):
    answer = _ask(_repo(tmp_path), "explain", "gov")
    assert answer["facets"] == ["gov.authn", "gov.authz"]
    local = answer["holds"]["local"]
    # uc realizes authn only #partial; idp would, but local doesn't run it.
    assert local["holds"] is False
    assert (local["status"], local["partial"], local["missing"]) == (
        "partial",
        ["gov.authn"],
        [],
    )
    assert answer["evidence"] == ["configured", "documented"]


def test_evidence_states_per_element(tmp_path):
    root = _repo(tmp_path)
    assert _ask(root, "explain", "lakehouse.credential")["evidence"] == ["tested"]
    assert _ask(root, "explain", "uc")["evidence"] == ["configured", "documented"]
    assert _ask(root, "explain", "orphan")["evidence"] == ["unknown"]


def test_a_draft_proof_is_not_tested(tmp_path):
    root = _repo(tmp_path, ready=False)
    assert _ask(root, "explain", "lakehouse.credential")["evidence"] == ["unknown"]


def test_stale_compat_withholds_tested(tmp_path, monkeypatch):
    root = _repo(tmp_path)
    monkeypatch.setattr(
        compat, "stale", lambda _root: [root / "content/p/compatibility.json"]
    )
    answer = _ask(root, "explain", "lakehouse.credential")
    assert answer["evidence"] == ["unknown"]
    assert answer["compat"] == "stale"


def test_examples_environment_and_selection(tmp_path):
    root = _repo(tmp_path)
    script = "content/p/how-to/creds/snippets/creds.py"
    [example] = _ask(root, "examples-for", "lakehouse.credential")["examples"]
    assert (example["script"], example["journey"], example["via"]) == (
        script,
        "p/credential.create",
        ["asset"],
    )
    assert example["evidence"] == ["configured", "documented", "tested"]

    [env] = _ask(root, "environment-for", "p/credential.create")["environments"]
    assert (env["key"], env["generated"], env["regenerate"]) == (
        "local/compose.yaml",
        "local",
        "just env-render local",
    )
    assert [s["script"] for s in env["scripts"]] == [script]

    selection = _ask(root, "explain-selection", "local/compose.yaml")
    assert {c["id"]: c["status"] for c in selection["concepts"]} == {
        "gov": "partial",
        "gov.authn": "partial",
        "gov.authz": "full",
        "lakehouse.catalog": "full",
    }


def test_impact_of_an_element_and_a_module(tmp_path):
    root = _repo(tmp_path)
    answer = _ask(root, "impact", "uc")
    assert answer["environments"] == ["local"]
    assert answer["scripts"] == ["content/p/how-to/creds/snippets/creds.py"]
    assert answer["claims"] == [
        {
            "journey": "p/credential.create",
            "interface": "sdk",
            "script": answer["scripts"][0],
        }
    ]
    assert answer["citingPages"] == ["content/p/how-to/creds/index.md"]
    assert answer["views"] == ["explain_gov", "localDeploy"]
    assert _ask(root, "impact", "module:unity-catalog")["environments"] == ["local"]


@pytest.mark.parametrize(
    ("kind", "ident"),
    [
        ("explain", "nope"),
        ("impact", "module:nope"),
        ("impact", "pin:nope/release"),
        ("environment-for", "p/nope"),
        ("explain-selection", "nope"),
    ],
)
def test_an_unknown_id_exits_2(tmp_path, capsys, kind, ident):
    root = _repo(tmp_path)
    assert cli.main(["--root", str(root), "query", kind, ident]) == 2
    assert "docsnip query" in capsys.readouterr().err
