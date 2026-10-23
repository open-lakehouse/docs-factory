"""Compatibility tables: script claims + a project's vocabulary → page tables."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from docsnip import compat

_MATRIX = """\
spec: unityCatalogSpec
interfaces:
  spark: {label: Spark, pin: pyspark, package: pyspark, model: apacheSpark}
  duckdb: {label: DuckDB, package: duckdb}
journeys:
  table.read: {title: Read, summary: Read rows}
  table.write: {title: Write, summary: Append rows}
tables:
  ops:
    columns: [spark, duckdb]
    rows: [table.read, table.write]
evidence:
  - interfaces: [duckdb]
    journeys: [table.write]
    outcome: fails
    why: "Not implemented"
    source: how-to/engine#read-it
"""

_SCRIPT = """\
# /// script
# dependencies = ["pyspark==4.1.0"]
#
# [tool.docs-factory]
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
status: {status}
---

## Read it

```python file=./snippets/{script} start=start:read end=end:read
```
"""

_EMBED = """\
---
title: Matrix
diataxis: reference
project: proj
status: ready
---

Intro.

<!-- compat:ops -->
<!-- /compat:ops -->

After.
"""


def _repo(tmp_path: Path, claims: str, *, status: str = "ready") -> Path:
    project = tmp_path / "content" / "proj"
    page = project / "how-to" / "001-engine"
    (page / "snippets").mkdir(parents=True)
    (page / "index.md").write_text(_PAGE.format(status=status, script="x.py"))
    (page / "snippets" / "x.py").write_text(_SCRIPT.format(claims=claims))
    (project / "compatibility.yml").write_text(_MATRIX)
    (project / "release.yml").write_text("release: 0.6.0\npins:\n  pyspark: 4.1.0\n")
    ref = project / "reference" / "002-matrix"
    ref.mkdir(parents=True)
    (ref / "index.md").write_text(_EMBED)
    return tmp_path


def _claims(*lines: str) -> str:
    return "".join(f"# {line}\n" for line in lines)


def _table(root: Path) -> list[str]:
    text = (root / "content/proj/reference/002-matrix/index.md").read_text()
    return [line for line in text.splitlines() if line.startswith("|")]


def test_fix_renders_claims_evidence_and_unknowns(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    assert compat.fix(root) == [
        root / "content/proj/reference/002-matrix/index.md",
        root / "content/proj/compatibility.json",
    ]
    assert _table(root) == [
        "| Operation | [Spark 4.1](model:apacheSpark) | DuckDB |",
        "| --- | --- | --- |",
        "| Read | [✓](../../how-to/engine/index.md#read-it) | — |",
        "| Write | — | ✗ |",
    ]
    assert compat.check(root)[0] == []
    assert compat.fix(root) == []  # idempotent


def test_a_hand_edit_is_stale(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    compat.fix(root)
    page = root / "content/proj/reference/002-matrix/index.md"
    page.write_text(page.read_text().replace("| Write | — |", "| Write | ✓ |"))
    errors, _ = compat.check(root)
    assert len(errors) == 1 and "table is stale" in errors[0]


def test_the_artifact_resolves_cells_and_goes_stale(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    compat.fix(root)
    path = root / "content/proj/compatibility.json"
    data = json.loads(path.read_text())
    read, write = data["journeys"]
    assert read["cells"]["spark"]["status"] == "tested"
    assert read["cells"]["spark"]["proofs"][0]["page"] == {
        "project": "proj",
        "bucket": "how-to",
        "slug": "engine",
    }
    assert write["summary"] == "Append rows"
    assert write["cells"]["duckdb"]["evidence"][0]["page"]["slug"] == "engine"
    assert data["interfaces"][0]["version"] == "4.1.0"
    path.write_text("{}")
    errors, _ = compat.check(root)
    assert any("compatibility.json is stale" in e for e in errors), errors


def test_a_draft_page_claim_is_pending(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
        status="draft",
    )
    compat.fix(root)
    assert _table(root)[2] == "| Read | — | — |"
    _, warnings = compat.check(root)
    assert any("renders once 001-engine is ready" in w for w in warnings)


def test_an_asserted_failure_links_its_anchor_and_note(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims(
            "claims.duckdb = [",
            '  { journey = "table.read", fails = "boom", anchor = "read-it", note = "on S3" },',
            "]",
        ),
    )
    script = root / "content/proj/how-to/001-engine/snippets/x.py"
    script.write_text(script.read_text() + 'assert "boom" in str(error)\n')
    compat.fix(root)
    assert (
        _table(root)[2]
        == "| Read | — | [✗](../../how-to/engine/index.md#read-it) on S3 |"
    )


@pytest.mark.parametrize(
    ("claims", "message"),
    [
        (
            'claims.spark = [{ journey = "table.drop", region = "read" }]',
            "not a journey",
        ),
        (
            'claims.trino = [{ journey = "table.read", region = "read" }]',
            "not an interface",
        ),
        (
            'claims.spark = [{ journey = "table.read", region = "nope" }]',
            "no region 'nope'",
        ),
        (
            'claims.spark = [{ journey = "table.read", region = "read", anchor = "x" }]',
            "no heading '#x'",
        ),
        (
            'claims.spark = [{ journey = "table.read", fails = "oops" }]',
            "doesn't assert",
        ),
        (
            'claims.duckdb = [{ journey = "table.write", region = "read" }]',
            "proves otherwise",
        ),
    ],
)
def test_bad_claims_are_errors(tmp_path, claims: str, message: str) -> None:
    root = _repo(tmp_path, _claims(claims))
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors
    with pytest.raises(ValueError):
        compat.fix(root)


def test_a_region_the_page_doesnt_show_is_an_error(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    page = root / "content/proj/how-to/001-engine/index.md"
    page.write_text(page.read_text().split("```python")[0])
    errors, _ = compat.check(root)
    assert any("shows no region 'read'" in e for e in errors), errors


def test_a_journey_on_no_table_is_an_error(tmp_path) -> None:
    root = _repo(tmp_path, "")
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace(
            "  table.write:", "  x: {title: X, summary: Do X}\n  table.write:"
        )
    )
    errors, _ = compat.check(root)
    assert any("journeys.x is on no table" in e for e in errors), errors


def test_a_journey_needs_a_title_and_a_summary(tmp_path) -> None:
    root = _repo(tmp_path, "")
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace(
            "  table.read: {title: Read, summary: Read rows}\n", "  table.read: Read\n"
        )
    )
    errors, _ = compat.check(root)
    assert any(
        "journeys.table.read needs a title and a summary" in e for e in errors
    ), errors


def test_documented_evidence_shows_only_where_the_table_asks(tmp_path) -> None:
    root = _repo(tmp_path, "")
    matrix = root / "content/proj/compatibility.yml"
    text = matrix.read_text() + (
        "  - interfaces: [spark]\n"
        "    journeys: [table.read]\n"
        "    outcome: works\n"
        "    why: The docs say so\n"
        "    source: https://example.com/read\n"
        "    api: {spark: spark.read}\n"
    )
    matrix.write_text(text)
    compat.fix(root)
    assert _table(root)[2] == "| Read | — | — |"
    matrix.write_text(text.replace("rows: [", "documented: true\n    rows: ["))
    compat.fix(root)
    assert _table(root)[2] == "| Read | [docs](https://example.com/read) | — |"


def test_only_a_private_page_links_private_evidence(tmp_path) -> None:
    root = _repo(tmp_path, "", status="private")
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace("rows: [", "documented: true\n    rows: [")
        + (
            "  - interfaces: [spark]\n"
            "    journeys: [table.read]\n"
            "    outcome: works\n"
            "    why: The docs say so\n"
            "    source: how-to/engine#read-it\n"
        )
    )
    compat.fix(root)
    assert _table(root)[2] == "| Read | docs | — |"
    embed = root / "content/proj/reference/002-matrix/index.md"
    embed.write_text(embed.read_text().replace("status: ready", "status: private"))
    compat.fix(root)
    assert _table(root)[2].startswith(
        "| Read (`table.read`) | [docs](../../how-to/engine/index.md#read-it)"
    )


def test_a_private_page_shows_draft_claims_and_apis(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims(
            'claims.spark = [{ journey = "table.read", region = "read", api = "spark.read" }]'
        ),
        status="draft",
    )
    page = root / "content/proj/reference/002-matrix/index.md"
    page.write_text(page.read_text().replace("status: ready", "status: private"))
    compat.fix(root)
    assert _table(root)[2:] == [
        "| Read (`table.read`) | [✓](../../how-to/engine/index.md#read-it) "
        "`spark.read` (draft) | — |",
        "| Write (`table.write`) | — | [✗](../../how-to/engine/index.md#read-it) |",
    ]


def test_another_projects_scripts_pin_their_own_versions(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    other = root / "content/other/how-to/001-engine"
    (other / "snippets").mkdir(parents=True)
    (other / "index.md").write_text(_PAGE.format(status="ready", script="x.py"))
    (other / "snippets" / "x.py").write_text(
        _SCRIPT.format(
            claims=_claims(
                'claims."proj:spark" = [{ journey = "table.read", region = "read" }]'
            )
        ).replace("4.1.0", "4.2.0")
    )
    errors, _ = compat.check(root)
    assert not any("different" in e for e in errors), errors


def test_scripts_that_disagree_are_an_error(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    other = root / "content/proj/how-to/001-engine/snippets/y.py"
    other.write_text(
        _SCRIPT.format(
            claims=_claims('claims.spark = [{ journey = "table.read", fails = true }]')
        )
    )
    errors, _ = compat.check(root)
    assert any("disagree" in e for e in errors), errors


def test_the_repo_tables_are_current() -> None:
    root = Path(__file__).resolve().parents[3]
    errors, _ = compat.check(root)
    assert errors == [], "\n".join(errors)


def test_evidence_can_cite_another_projects_page(tmp_path) -> None:
    root = _repo(tmp_path, "")
    other = root / "content/other/how-to/001-limits"
    other.mkdir(parents=True)
    (other / "index.md").write_text(_PAGE.format(status="ready", script="x.py"))
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace(
            "source: how-to/engine#read-it", "source: other:how-to/limits#read-it"
        )
    )
    compat.fix(root)
    assert compat.check(root)[0] == []
    matrix.write_text(
        matrix.read_text().replace("other:how-to/limits", "other:how-to/nope")
    )
    errors, _ = compat.check(root)
    assert any("no such page" in e for e in errors), errors


# --- journeys joined to the estate model ---------------------------------------

_MODEL = {
    "elements": {
        "unityCatalogSpec": {"kind": "openSpecification", "title": "Unity Catalog"},
        "icebergRestSpec": {"kind": "openSpecification", "title": "Iceberg REST"},
        "apacheSpark": {"kind": "implementation", "title": "Apache Spark"},
        "lakehouse.catalog": {"kind": "capability", "title": "Catalog"},
        "lakehouse.table": {"kind": "asset", "title": "Table"},
        "lakehouse.volume": {"kind": "asset", "title": "Volume"},
    },
    "relations": {
        "r1": {
            "kind": "consumes",
            "source": {"model": "apacheSpark"},
            "target": {"model": "unityCatalogSpec"},
        },
        "r2": {
            "kind": "governs",
            "source": {"model": "unityCatalogSpec"},
            "target": {"model": "lakehouse.table"},
        },
        "r3": {
            "kind": "governs",
            "source": {"model": "unityCatalogSpec"},
            "target": {"model": "lakehouse.volume"},
        },
        "r4": {
            "kind": "operatesOn",
            "source": {"model": "apacheSpark"},
            "target": {"model": "lakehouse.table"},
        },
        "r5": {
            "kind": "operatesOn",
            "source": {"model": "apacheSpark"},
            "target": {"model": "lakehouse.volume"},
        },
    },
}

_FAMILIES = """\
families:
  table:
    asset: lakehouse.table
    requires:
      client: { consumes: [unityCatalogSpec] }
      catalog: { implements: [unityCatalogSpec] }
"""


def _modeled(root: Path, journeys: str = "", families: str = _FAMILIES) -> Path:
    """Give the repo an exported model and journeys with families."""
    dist = root / "architecture" / "dist"
    dist.mkdir(parents=True, exist_ok=True)
    (dist / "model.json").write_text(json.dumps(_MODEL))
    matrix = root / "content/proj/compatibility.yml"
    text = matrix.read_text().replace(
        "  table.read: {title: Read, summary: Read rows}",
        journeys or "  table.read: {title: Read, summary: Read rows, family: table}",
    )
    matrix.write_text(text.replace("interfaces:\n", families + "interfaces:\n", 1))
    return root


_SPARK_READS = _claims('claims.spark = [{ journey = "table.read", region = "read" }]')


def _artifact(root: Path) -> dict:
    compat.fix(root)
    return json.loads((root / "content/proj/compatibility.json").read_text())


def test_a_journey_inherits_its_family_and_can_override_it(tmp_path) -> None:
    root = _modeled(
        _repo(tmp_path, _SPARK_READS),
        "  table.read:\n"
        "    {title: Read, summary: Read rows, family: table,\n"
        "     requires: {client: {consumes: [icebergRestSpec]}}}",
    )
    data = _artifact(root)
    assert data["version"] == compat.ARTIFACT_VERSION
    read, write = data["journeys"]
    assert read["family"] == "table"
    assert read["asset"] == "lakehouse.table"  # inherited
    assert read["requires"] == {"client": {"consumes": ["icebergRestSpec"]}}
    assert write["asset"] is None
    assert {"kind": "unmigrated", "journeys": ["table.write"]} in data["diagnostics"]


@pytest.mark.parametrize(
    ("journey", "message"),
    [
        ("{title: R, summary: S, asset: apacheSpark}", "is of kind implementation"),
        ("{title: R, summary: S, family: nope}", "is not a family"),
        (
            "{title: R, summary: S, requires: {client: {consumes: [lakehouse.catalog]}}}",
            "expected openSpecification",
        ),
        (
            "{title: R, summary: S, requires: {client: {uses: [unityCatalogSpec]}}}",
            "unknown",
        ),
        ("{title: R, summary: S, asset: lakehouse.nope}", "not in the estate model"),
    ],
)
def test_bad_journey_references_are_errors(
    tmp_path, journey: str, message: str
) -> None:
    root = _modeled(_repo(tmp_path, ""), f"  table.read: {journey}")
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_a_journey_names_the_spec_feature_it_exercises(tmp_path) -> None:
    root = _modeled(
        _repo(tmp_path, _SPARK_READS),
        "  table.read:\n"
        "    {title: Read, summary: Read rows, family: table,\n"
        "     feature: {spec: icebergRestSpec, name: loadTable, since: v1}}",
    )
    read, write = _artifact(root)["journeys"]
    assert read["feature"] == {
        "spec": "icebergRestSpec",
        "name": "loadTable",
        "since": "v1",
    }
    assert write["feature"] is None


@pytest.mark.parametrize(
    ("feature", "message"),
    [
        ("{spec: icebergRestSpec, name: nope}", "is not a icebergRestSpec feature"),
        ("{spec: apacheSpark, name: loadTable}", "expected openSpecification"),
        ("{spec: unityCatalogSpec, name: loadTable}", "has no specFeatures"),
        (
            "{spec: icebergRestSpec, name: loadTable, version: 3}",
            "unknown key 'version'",
        ),
    ],
)
def test_bad_journey_features_are_errors(tmp_path, feature: str, message: str) -> None:
    root = _modeled(
        _repo(tmp_path, ""),
        f"  table.read: {{title: R, summary: S, family: table, feature: {feature}}}",
    )
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_a_verified_journey_records_the_edge_it_exercises(tmp_path) -> None:
    data = _artifact(_modeled(_repo(tmp_path, _SPARK_READS)))
    assert data["verifiedEdges"] == [
        {
            "source": "apacheSpark",
            "kind": "consumes",
            "target": "unityCatalogSpec",
            "interfaces": ["spark"],
            "journeys": ["table.read"],
        },
        {
            "source": "apacheSpark",
            "kind": "operatesOn",
            "target": "lakehouse.table",
            "interfaces": ["spark"],
            "journeys": ["table.read"],
        },
    ]
    kinds = [d["kind"] for d in data["diagnostics"]]
    assert "missing-edge" not in kinds
    # unityCatalogSpec governs volumes too, and no verified journey acts on one.
    assert {"kind": "unverified-asset", "asset": "lakehouse.volume"} in data[
        "diagnostics"
    ]


def _with_integration(root: Path, *, integrated: bool = True) -> Path:
    """Move Spark's unityCatalogSpec edge onto an integration the interface names."""
    model = json.loads(json.dumps(_MODEL))
    model["elements"]["ucSpark"] = {"kind": "implementation", "title": "UC Spark"}
    model["relations"]["r1"]["source"] = {"model": "ucSpark"}
    if integrated:
        model["relations"]["r6"] = {
            "kind": "integrates",
            "source": {"model": "apacheSpark"},
            "target": {"model": "ucSpark"},
        }
    (root / "architecture/dist/model.json").write_text(json.dumps(model))
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace(
            "model: apacheSpark}", "model: apacheSpark, integrations: [ucSpark]}"
        )
    )
    return root


def test_an_integration_provides_its_engines_spec_edge(tmp_path) -> None:
    data = _artifact(_with_integration(_modeled(_repo(tmp_path, _SPARK_READS))))
    assert data["interfaces"][0]["integrations"] == ["ucSpark"]
    edges = {(e["source"], e["kind"], e["target"]) for e in data["verifiedEdges"]}
    assert ("ucSpark", "consumes", "unityCatalogSpec") in edges
    assert "missing-edge" not in [d["kind"] for d in data["diagnostics"]]


def test_the_engines_own_spec_edge_wins_over_an_integrations(tmp_path) -> None:
    root = _with_integration(_modeled(_repo(tmp_path, _SPARK_READS)))
    path = root / "architecture/dist/model.json"
    model = json.loads(path.read_text())
    model["relations"]["r7"] = {
        "kind": "consumes",
        "source": {"model": "apacheSpark"},
        "target": {"model": "unityCatalogSpec"},
    }
    path.write_text(json.dumps(model))
    edges = {(e["source"], e["kind"]) for e in _artifact(root)["verifiedEdges"]}
    assert ("apacheSpark", "consumes") in edges
    assert ("ucSpark", "consumes") not in edges


def test_an_integration_must_be_integrated_by_the_interface_model(tmp_path) -> None:
    root = _with_integration(_modeled(_repo(tmp_path, "")), integrated=False)
    errors, _ = compat.check(root)
    assert any("'apacheSpark' doesn't integrate 'ucSpark'" in e for e in errors), errors


def test_a_missing_client_edge_is_reported_not_failed(tmp_path) -> None:
    root = _modeled(
        _repo(tmp_path, _SPARK_READS),
        "  table.read: {title: Read, summary: Read rows, family: table,"
        " requires: {client: {consumes: [icebergRestSpec]}}}",
    )
    assert compat.fix(root)
    assert compat.check(root)[0] == []
    gaps = compat.model_gaps(root)
    assert any("spark: proves table.read against icebergRestSpec" in g for g in gaps), (
        gaps
    )


def test_a_negative_claim_needs_no_edge(tmp_path) -> None:
    root = _modeled(
        _repo(
            tmp_path,
            _claims('claims.spark = [{ journey = "table.read", fails = true }]'),
        ),
        "  table.read: {title: Read, summary: Read rows, family: table,"
        " requires: {client: {consumes: [icebergRestSpec]}}}",
    )
    data = _artifact(root)
    assert not [d for d in data["diagnostics"] if d["kind"] == "missing-edge"]
    assert data["verifiedEdges"] == []


def test_a_missing_asset_edge_is_reported_not_failed(tmp_path) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS))
    model = root / "architecture/dist/model.json"
    bare = dict(
        _MODEL,
        relations={
            key: value
            for key, value in _MODEL["relations"].items()
            if value["kind"] != "operatesOn"
        },
    )
    model.write_text(json.dumps(bare))
    assert compat.fix(root)
    assert compat.check(root)[0] == []
    data = json.loads((root / "content/proj/compatibility.json").read_text())
    assert {
        "kind": "missing-asset-edge",
        "interface": "spark",
        "source": "apacheSpark",
        "asset": "lakehouse.table",
        "journeys": ["table.read"],
    } in data["diagnostics"]
    assert not [e for e in data["verifiedEdges"] if e["kind"] == "operatesOn"]


def test_an_operates_on_edge_for_an_unproven_matrix_asset_is_reported(
    tmp_path,
) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS))
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text()
        .replace(
            "families:\n",
            "families:\n"
            "  volume:\n"
            "    asset: lakehouse.volume\n"
            "    requires: {client: {consumes: [unityCatalogSpec]}}\n",
            1,
        )
        .replace(
            "  table.write: {title: Write, summary: Append rows}",
            "  table.write: {title: Write, summary: Append rows, family: volume}",
        )
    )
    data = _artifact(root)
    assert {
        "kind": "unverified-asset-edge",
        "source": "apacheSpark",
        "asset": "lakehouse.volume",
    } in data["diagnostics"]


def test_interface_summary_separates_modeled_breadth_from_verified_journeys(
    tmp_path,
) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS))
    result = compat.resolve(root)
    matrix = result.matrices["proj"]
    embed = root / "content/proj/reference/002-matrix/index.md"
    lines = compat.render_interfaces(result, matrix, embed, root / "content")
    spark = next(line for line in lines if line.startswith("| Spark 4.1.0 |"))
    assert "[Apache Spark](model:apacheSpark)" in spark
    assert "[Unity Catalog](model:unityCatalogSpec)" in spark
    assert "[Table](model:lakehouse.table), [Volume](model:lakehouse.volume)" in spark
    assert "[Table: 1 journey](../../how-to/engine/index.md#read-it)" in spark
    assert "Volume:" not in spark


def test_an_unannotated_journey_falls_back_to_the_matrix_spec(tmp_path) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS), families="")
    model = root / "architecture/dist/model.json"
    bare = dict(_MODEL, relations={})  # Spark no longer consumes unityCatalogSpec
    model.write_text(json.dumps(bare))
    root_matrix = root / "content/proj/compatibility.yml"
    root_matrix.write_text(root_matrix.read_text().replace(", family: table", ""))
    gaps = compat.model_gaps(root)
    assert any(
        "spark: proves table.read against unityCatalogSpec" in g for g in gaps
    ), gaps
    assert any("2 journey(s) with no asset" in g for g in gaps), gaps


def test_unmodeled_clients_and_local_participants_are_valid(tmp_path) -> None:
    # DuckDB has no model element, and a client-only journey needs no environment.
    root = _modeled(
        _repo(
            tmp_path,
            _claims('claims.duckdb = [{ journey = "table.read", region = "read" }]'),
        ),
        families="defaults:\n  asset: lakehouse.table\n"
        "  requires: { client: { consumes: [unityCatalogSpec] } }\n",
    )
    root_matrix = root / "content/proj/compatibility.yml"
    root_matrix.write_text(root_matrix.read_text().replace(", family: table", ""))
    data = _artifact(root)
    assert compat.check(root)[0] == []
    assert all(j["asset"] == "lakehouse.table" for j in data["journeys"])
    assert {"kind": "unmodeled", "interface": "duckdb"} in data["diagnostics"]


def test_an_asset_rollup_renders_its_journeys(tmp_path) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS))
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace(
            "summary: Append rows}", "summary: Append rows, family: table}"
        )
    )
    embed = root / "content/proj/reference/002-matrix/index.md"
    embed.write_text(
        embed.read_text().replace(
            "<!-- compat:ops -->\n<!-- /compat:ops -->",
            "<!-- compat:ops -->\n<!-- /compat:ops -->\n\n"
            "<!-- compat:asset:lakehouse.table -->\n"
            "<!-- /compat:asset:lakehouse.table -->",
        )
    )
    compat.fix(root)
    lines = _table(root)
    rollup = lines[len(lines) // 2 :]
    assert rollup == [
        "| Operation | [Spark 4.1](model:apacheSpark) | DuckDB |",
        "| --- | --- | --- |",
        "| Read | [✓](../../how-to/engine/index.md#read-it) | — |",
        "| Write | — | ✗ |",
    ]
    assert compat.check(root)[0] == []
    embed.write_text(
        embed.read_text().replace("asset:lakehouse.table", "asset:lakehouse.volume")
    )
    errors, _ = compat.check(root)
    assert any("acts on lakehouse.volume" in e for e in errors), errors


def test_an_asset_rollup_drops_journeys_nothing_answers(tmp_path) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS))
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text()
        .replace("summary: Append rows}", "summary: Append rows, family: table}")
        .replace(
            "  table.write:",
            "  table.tried: {title: Untried, summary: Nobody yet, family: table}\n"
            "  table.write:",
        )
        .replace(
            "rows: [table.read, table.write]",
            "rows: [table.read, table.tried, table.write]",
        )
    )
    embed = root / "content/proj/reference/002-matrix/index.md"
    embed.write_text(
        embed.read_text().replace(
            "<!-- compat:ops -->\n<!-- /compat:ops -->",
            "<!-- compat:asset:lakehouse.table -->\n"
            "<!-- /compat:asset:lakehouse.table -->",
        )
    )
    compat.fix(root)
    assert [line.split(" |")[0] for line in _table(root)[2:]] == ["| Read", "| Write"]


def _engine_pages(root: Path) -> Path:
    """An engine page for Spark and a hub beside the matrix page."""
    ref = root / "content/proj/reference"
    for folder, marker in (("003-spark", "engine:apacheSpark"), ("004-hub", "engines")):
        (ref / folder).mkdir()
        (ref / folder / "index.md").write_text(
            _EMBED.replace("compat:ops", f"compat:{marker}")
        )
    return ref


def _lines(page: Path) -> list[str]:
    text = page.read_text()
    return [line for line in text.splitlines() if line.startswith(("|", "Verified"))]


def test_an_engine_report_lists_what_works_and_what_doesnt(tmp_path) -> None:
    root = _repo(tmp_path, _SPARK_READS)
    ref = _engine_pages(root)
    compat.fix(root)
    assert _lines(ref / "003-spark/index.md") == [
        "Verified here: 1 of 2 journeys.",
        "| Journeys | Verified here | Doesn't work | Upstream docs only "
        "| Not verified here |",
        "| --- | --- | --- | --- | --- |",
        "| ops (1 of 2) | [Read](../../how-to/engine/index.md#read-it) | — | — "
        "| Write |",
    ]
    # DuckDB has no model element: its interface key is its engine id.
    assert _lines(ref / "004-hub/index.md") == [
        "| Engine | Interfaces | Verified journeys |",
        "| --- | --- | --- |",
        "| [Spark](../spark/index.md) | Spark 4.1.0 | 1 of 2 |",
        "| DuckDB | DuckDB | 0 of 2 |",
    ]
    assert compat.check(root)[0] == []


def test_the_artifact_records_each_engines_journeys_and_page(tmp_path) -> None:
    root = _repo(tmp_path, _SPARK_READS)
    _engine_pages(root)
    data = _artifact(root)
    assert data["engines"] == [
        {
            "id": "apacheSpark",
            "title": "Spark",
            "interfaces": ["spark"],
            "page": {"project": "proj", "bucket": "reference", "slug": "spark"},
            "anchor": None,
            "heading": None,
            "groups": [
                {
                    "table": "ops",
                    "columns": ["spark"],
                    "rows": ["table.read", "table.write"],
                }
            ],
        },
        {
            "id": "duckdb",
            "title": "DuckDB",
            "interfaces": ["duckdb"],
            "page": None,
            "anchor": None,
            "heading": None,
            "groups": [
                {
                    "table": "ops",
                    "columns": ["duckdb"],
                    "rows": ["table.read", "table.write"],
                }
            ],
        },
    ]


def test_an_engine_report_keeps_each_claims_qualifier(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims(
            'claims.duckdb = [{ journey = "table.read", region = "read", note = "by path" }]'
        ),
    )
    ref = root / "content/proj/reference"
    (ref / "003-duckdb").mkdir()
    (ref / "003-duckdb/index.md").write_text(
        _EMBED.replace("compat:ops", "compat:engine:duckdb")
    )
    compat.fix(root)
    assert (
        "| ops (1 of 2) | [Read](../../how-to/engine/index.md#read-it) (by path) "
        "| [Write](../../how-to/engine/index.md#read-it) | — | — |"
    ) in _lines(ref / "003-duckdb/index.md")


def test_an_interface_names_the_package_it_goes_through(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.duckdb = [{ journey = "table.read", region = "read" }]'),
    )
    matrix = root / "content/proj/compatibility.yml"
    matrix.write_text(
        matrix.read_text().replace(
            "duckdb: {label: DuckDB, package: duckdb}",
            "duckdb: {label: DuckDB, package: duckdb, via: deltalake}",
        )
    )
    script = root / "content/proj/how-to/001-engine/snippets/x.py"
    script.write_text(
        script.read_text().replace(
            '["pyspark==4.1.0"]', '["duckdb==1.5.4", "deltalake==1.6.6"]'
        )
    )
    _engine_pages(root)
    data = _artifact(root)
    duckdb = data["interfaces"][1]
    assert (duckdb["via"], duckdb["viaVersion"]) == ("deltalake", "1.6.6")
    assert "| DuckDB | DuckDB 1.5.4 with `deltalake` 1.6.6 | 1 of 2 |" in _lines(
        root / "content/proj/reference/004-hub/index.md"
    )


def test_an_engine_draft_claim_shows_only_on_a_private_page(tmp_path) -> None:
    root = _repo(tmp_path, _SPARK_READS, status="draft")
    ref = _engine_pages(root)
    compat.fix(root)
    assert "| ops (0 of 2) | — | — | — | Read, Write |" in _lines(
        ref / "003-spark/index.md"
    )
    page = ref / "003-spark/index.md"
    page.write_text(page.read_text().replace("status: ready", "status: private"))
    compat.fix(root)
    assert (
        "| ops (0 of 2) | [Read (draft)](../../how-to/engine/index.md#read-it) | — "
        "| — | Write |" in _lines(page)
    )


def test_an_unknown_engine_is_an_error(tmp_path) -> None:
    root = _repo(tmp_path, _SPARK_READS)
    page = _engine_pages(root) / "003-spark/index.md"
    page.write_text(page.read_text().replace("engine:apacheSpark", "engine:flink"))
    errors, _ = compat.check(root)
    assert any("no interface" in e and "has model flink" in e for e in errors), errors


def test_a_hub_links_reports_on_its_own_page_by_heading(tmp_path) -> None:
    root = _repo(tmp_path, _SPARK_READS)
    page = root / "content/proj/reference/002-matrix/index.md"
    page.write_text(
        page.read_text().replace(
            "<!-- compat:ops -->\n<!-- /compat:ops -->",
            "<!-- compat:ops -->\n<!-- /compat:ops -->\n\n"
            "<!-- compat:engines -->\n<!-- /compat:engines -->\n\n"
            "## Apache Spark\n\n"
            "<!-- compat:engine:apacheSpark -->\n<!-- /compat:engine:apacheSpark -->",
        )
    )
    data = _artifact(root)
    assert "| [Apache Spark](#apache-spark) | Spark 4.1.0 | 1 of 2 |" in _table(root)
    assert data["engines"][0]["anchor"] == "apache-spark"
    assert data["engines"][0]["heading"] == "Apache Spark"
    assert compat.check(root)[0] == []


def test_a_client_edge_must_have_the_verb_the_journey_names(tmp_path) -> None:
    # Spark consumes unityCatalogSpec; implementing it is a different claim.
    root = _modeled(
        _repo(tmp_path, _SPARK_READS),
        "  table.read: {title: Read, summary: Read rows, family: table,"
        " requires: {client: {implements: [unityCatalogSpec]}}}",
    )
    data = _artifact(root)
    assert {
        "kind": "missing-edge",
        "interface": "spark",
        "source": "apacheSpark",
        "edge": "implements",
        "target": "unityCatalogSpec",
        "journeys": ["table.read"],
    } in data["diagnostics"]
    assert ("apacheSpark", "consumes", "unityCatalogSpec") not in {
        (e["source"], e["kind"], e["target"]) for e in data["verifiedEdges"]
    }
    gaps = compat.model_gaps(root)
    assert any("apacheSpark has no implements edge" in g for g in gaps), gaps


def test_a_client_can_implement_a_format_and_consume_an_api(tmp_path) -> None:
    root = _modeled(
        _repo(tmp_path, _SPARK_READS),
        "  table.read: {title: Read, summary: Read rows, family: table,"
        " requires: {client: {consumes: [unityCatalogSpec],"
        " implements: [icebergRestSpec]}}}",
    )
    path = root / "architecture/dist/model.json"
    model = json.loads(path.read_text())
    model["relations"]["r8"] = {
        "kind": "implements",
        "source": {"model": "apacheSpark"},
        "target": {"model": "icebergRestSpec"},
    }
    path.write_text(json.dumps(model))
    data = _artifact(root)
    edges = {(e["source"], e["kind"], e["target"]) for e in data["verifiedEdges"]}
    assert ("apacheSpark", "consumes", "unityCatalogSpec") in edges
    assert ("apacheSpark", "implements", "icebergRestSpec") in edges
    assert "missing-edge" not in [d["kind"] for d in data["diagnostics"]]
