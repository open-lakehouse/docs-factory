"""The agent task set: docsnip query against this repo's committed artifacts.

Expected IDs are exact, so a content, model, or environment change that moves
an answer fails here and gets re-read by hand."""

from __future__ import annotations

from pathlib import Path

import pytest
from docsnip import query

ROOT = Path(__file__).resolve().parents[3]
AWS_STORAGE = (
    "content/unitycatalog/how-to/009-configure-aws-storage/snippets/aws_storage.py"
)


@pytest.fixture(scope="module")
def idx() -> query.Index:
    return query.load(ROOT)


def _ask(idx: query.Index, kind: str, ident: str) -> dict:
    return query.run(idx, kind, ident)["answer"]


def test_find_a_vended_credential_example(idx):
    examples = _ask(idx, "examples-for", "lakehouse.credential")["examples"]
    vended = {
        (e["script"], e["journey"])
        for e in examples
        if e["journey"].startswith("unitycatalog/credentials.vend-")
        and "tested" in e["evidence"]
    }
    assert vended == {
        (AWS_STORAGE, "unitycatalog/credentials.vend-path"),
        (
            "content/unitycatalog/how-to/010-managed-storage-s3/snippets/managed_storage.py",
            "unitycatalog/credentials.vend-volume",
        ),
        (
            "content/unitycatalog/tutorials/006-read-volume-files/snippets/volume_files.py",
            "unitycatalog/credentials.vend-volume",
        ),
    }


def test_explain_its_components(idx):
    answer = _ask(idx, "explain-selection", "uc-aws")
    assert {s["node"]: (s["element"], s["target"]) for s in answer["services"]} == {
        "envoy": ("envoy", None),
        "postgres": ("postgresql", None),
        "rustfs": ("rustfs", "lakehouse.objectStorage"),
        "unity-catalog": ("unityCatalogOSS", "lakehouse.catalog"),
    }
    assert {c["id"]: c["status"] for c in answer["concepts"]} == {
        "lakehouse.catalog": "full",
        "lakehouse.metadataStore": "full",
        "lakehouse.objectStorage": "full",
        "lakehouse.governance": "partial",
        "lakehouse.governance.authentication": "partial",
        "lakehouse.governance.authorization": "full",
        "lakehouse.governance.fineGrainedAccess": "missing",
    }


def test_regenerate_its_stack(idx):
    [env] = _ask(idx, "environment-for", AWS_STORAGE)["environments"]
    assert (env["key"], env["generated"], env["recipe"], env["regenerate"]) == (
        "uc-aws/compose.yaml",
        "uc-aws",
        "envs/uc-aws/env.toml",
        "just env-render uc-aws",
    )
    assert env["trestle"] == idx.pin.rev


def test_explain_why_full_governance_lacks_evidence(idx):
    answer = _ask(idx, "explain", "lakehouse.governance")
    for name in ("unitycatalog", "uc-aws"):
        held = answer["holds"][name]
        assert held["holds"] is False
        assert held["missing"] == ["lakehouse.governance.fineGrainedAccess"]
        assert held["partial"] == ["lakehouse.governance.authentication"]
        assert held["facets"]["lakehouse.governance.authentication"]["by"] == {
            "unityCatalogOSS": "partial"
        }


def test_pages_affected_by_a_uc_release_change(idx):
    answer = _ask(idx, "impact", "pin:unitycatalog/release")
    assert answer["environments"] == ["uc-aws", "uc-hybrid", "uc-local", "unitycatalog"]
    uc = "content/unitycatalog/"
    assert answer["pages"] == [
        uc + p + "/index.md"
        for p in (
            "explanation/004-external-and-managed-tables",
            "explanation/005-deployment-patterns",
            "how-to/001-table-storage-formats",
            "how-to/002-configure-backend-db",
            "how-to/003-seed-tpch-data",
            "how-to/004-manage-catalogs-and-schemas",
            "how-to/005-register-external-table",
            "how-to/006-manage-volumes",
            "how-to/007-configure-spark",
            "how-to/008-duckdb",
            "how-to/009-configure-aws-storage",
            "how-to/009-python-dataframes",
            "how-to/010-managed-storage-s3",
            "how-to/012-iceberg-rest",
            "how-to/013-metric-views",
            "reference/001-features-and-limitations",
            "reference/002-clients-and-engines",
            "tutorials/001-getting-started",
            "tutorials/002-python-client",
            "tutorials/005-first-python-function",
            "tutorials/006-read-volume-files",
            "tutorials/007-managed-delta-table",
            "tutorials/008-first-metric-view",
        )
    ]
