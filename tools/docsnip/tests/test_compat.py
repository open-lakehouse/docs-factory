"""Compatibility tables: script claims + a project's vocabulary → page tables."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from docsnip import compat

_CATALOG = "architecture/journeys"

_PATHS = """\
uc:
  roles:
    client: { consumes: [unityCatalogSpec] }
    catalog: { implements: [unityCatalogSpec] }
"""

_INTERFACES = """\
spark: {label: Spark, pin: pyspark, package: pyspark, model: apacheSpark}
duckdb: {label: DuckDB, package: duckdb}
"""

_JOURNEYS = """\
table.read: {title: Read, summary: Read rows, asset: lakehouse.table, path: uc}
table.write: {title: Write, summary: Append rows, asset: lakehouse.table, path: uc}
"""

_EVIDENCE = """\
- interfaces: [duckdb]
  journeys: [table.write]
  outcome: fails
  why: "Not implemented"
  source: proj:how-to/engine#read-it
"""

_MATRIX = """\
spec: unityCatalogSpec
interfaces: [spark, duckdb]
tables:
  ops:
    columns: [spark, duckdb]
    rows: [table.read, table.write]
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
    catalog = tmp_path / _CATALOG
    (catalog / "journeys").mkdir(parents=True)
    (catalog / "paths.yml").write_text(_PATHS)
    (catalog / "interfaces.yml").write_text(_INTERFACES)
    (catalog / "journeys" / "table.yml").write_text(_JOURNEYS)
    (catalog / "evidence.yml").write_text(_EVIDENCE)
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


def _edit(root: Path, rel: str, old: str, new: str) -> Path:
    """Replace ``old`` (which must be there) in the file at ``rel``."""
    path = root / rel
    text = path.read_text()
    assert old in text, (rel, old)
    path.write_text(text.replace(old, new, 1))
    return path


def _append(root: Path, rel: str, text: str) -> Path:
    path = root / rel
    path.write_text(path.read_text() + text)
    return path


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
    _append(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "x: {title: X, summary: Do X, asset: lakehouse.table, path: uc}\n",
    )
    errors, _ = compat.check(root)
    assert any("x is on no project's table" in e for e in errors), errors


@pytest.mark.parametrize(
    ("journey", "message"),
    [
        ("table.read: Read", "table.read needs a title and a summary"),
        (
            "table.read: {title: Read, summary: Read rows, asset: lakehouse.table}",
            "table.read needs a path",
        ),
        (
            "table.read: {title: Read, summary: Read rows, path: uc}",
            "table.read needs an asset",
        ),
        (
            "table.read: {title: R, summary: S, asset: lakehouse.table, path: nope}",
            "table.read.path 'nope' is not in paths.yml",
        ),
        (
            "table.read: {title: R, summary: S, asset: lakehouse.table, path: uc,"
            " family: table}",
            "unknown key 'family'",
        ),
    ],
)
def test_a_journey_needs_a_title_summary_asset_and_path(
    tmp_path, journey: str, message: str
) -> None:
    root = _repo(tmp_path, "")
    _edit(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "table.read: {title: Read, summary: Read rows, asset: lakehouse.table, path: uc}",
        journey,
    )
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_a_journey_is_defined_once_across_files(tmp_path) -> None:
    root = _repo(tmp_path, "")
    (root / _CATALOG / "journeys" / "more.yml").write_text(
        "table.read: {title: Again, summary: Again, asset: lakehouse.table, path: uc}\n"
    )
    errors, _ = compat.check(root)
    assert any("table.read is already a journey in" in e for e in errors), errors


def test_a_projection_lists_catalog_interfaces_its_release_pins(tmp_path) -> None:
    root = _repo(tmp_path, "")
    _edit(
        root, "content/proj/compatibility.yml", "[spark, duckdb]\n", "[spark, trino]\n"
    )
    errors, _ = compat.check(root)
    assert any("interface 'trino' is not in" in e for e in errors), errors
    root = _repo(tmp_path / "pins", "")
    (root / "content/proj/release.yml").write_text("release: 0.6.0\n")
    errors, _ = compat.check(root)
    assert any("spark.pin 'pyspark' is not in release.yml" in e for e in errors), errors


def test_a_claim_counts_in_every_project_that_shows_it(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    other = root / "content/other"
    (other / "reference" / "002-matrix").mkdir(parents=True)
    (other / "compatibility.yml").write_text(_MATRIX)
    (other / "release.yml").write_text("pins:\n  pyspark: 4.2.0\n")
    (other / "reference" / "002-matrix" / "index.md").write_text(
        _EMBED.replace("project: proj", "project: other")
    )
    compat.fix(root)
    assert compat.check(root)[0] == []
    text = (other / "reference" / "002-matrix" / "index.md").read_text()
    # The other project's header shows its own pin.
    assert "| Read | [✓](../../../proj/how-to/engine/index.md#read-it) | — |" in text, (
        text
    )
    assert "[Spark 4.2](model:apacheSpark)" in text


def test_a_project_prefixed_interface_is_an_error(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims."proj:spark" = [{ journey = "table.read", region = "read" }]'),
    )
    errors, _ = compat.check(root)
    assert any("interfaces are estate-wide; claim 'spark'" in e for e in errors), errors


def test_an_alias_resolves_a_renamed_journey(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.get", region = "read" }]'),
    )
    (root / _CATALOG / "aliases.yml").write_text("table.get: table.read\n")
    compat.fix(root)
    errors, warnings = compat.check(root)
    assert errors == []
    assert any("renamed to 'table.read'" in w for w in warnings), warnings
    assert _table(root)[2] == "| Read | [✓](../../how-to/engine/index.md#read-it) | — |"
    _edit(
        root,
        "content/proj/compatibility.yml",
        "rows: [table.read,",
        "rows: [table.get,",
    )
    errors, _ = compat.check(root)
    assert any("row 'table.get' is now 'table.read'" in e for e in errors), errors


@pytest.mark.parametrize(
    ("aliases", "message"),
    [
        ("table.read: table.write\n", "table.read is still a journey"),
        ("table.get: table.nope\n", "which is not a journey"),
    ],
)
def test_bad_aliases_are_errors(tmp_path, aliases: str, message: str) -> None:
    root = _repo(tmp_path, "")
    (root / _CATALOG / "aliases.yml").write_text(aliases)
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_documented_evidence_shows_only_where_the_table_asks(tmp_path) -> None:
    root = _repo(tmp_path, "")
    _append(
        root,
        f"{_CATALOG}/evidence.yml",
        "- interfaces: [spark]\n"
        "  journeys: [table.read]\n"
        "  outcome: works\n"
        "  why: The docs say so\n"
        "  source: https://example.com/read\n"
        "  api: {spark: spark.read}\n",
    )
    compat.fix(root)
    assert _table(root)[2] == "| Read | — | — |"
    _edit(
        root,
        "content/proj/compatibility.yml",
        "rows: [",
        "documented: true\n    rows: [",
    )
    compat.fix(root)
    assert _table(root)[2] == "| Read | [docs](https://example.com/read) | — |"


def test_only_a_private_page_links_private_evidence(tmp_path) -> None:
    root = _repo(tmp_path, "", status="private")
    _edit(
        root,
        "content/proj/compatibility.yml",
        "rows: [",
        "documented: true\n    rows: [",
    )
    _append(
        root,
        f"{_CATALOG}/evidence.yml",
        "- interfaces: [spark]\n"
        "  journeys: [table.read]\n"
        "  outcome: works\n"
        "  why: The docs say so\n"
        "  source: proj:how-to/engine#read-it\n",
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
                'claims.spark = [{ journey = "table.read", region = "read" }]'
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
    evidence = f"{_CATALOG}/evidence.yml"
    _edit(root, evidence, "proj:how-to/engine#read-it", "other:how-to/limits#read-it")
    compat.fix(root)
    assert compat.check(root)[0] == []
    _edit(root, evidence, "other:how-to/limits", "other:how-to/nope")
    errors, _ = compat.check(root)
    assert any("no such page" in e for e in errors), errors
    _edit(root, evidence, "other:how-to/nope", "how-to/engine")
    errors, _ = compat.check(root)
    assert any("names no project" in e for e in errors), errors


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

_READ = "table.read: {title: Read, summary: Read rows, asset: lakehouse.table, path: uc"


def _read(*fields: str) -> str:
    """The table.read journey with more ``key: value`` fields."""
    return _READ + "".join(f", {f}" for f in fields) + "}"


def _modeled(root: Path, journey: str = "") -> Path:
    """Give the repo an exported model, and table.read the definition ``journey``."""
    dist = root / "architecture" / "dist"
    dist.mkdir(parents=True, exist_ok=True)
    (dist / "model.json").write_text(json.dumps(_MODEL))
    if journey:
        _edit(root, f"{_CATALOG}/journeys/table.yml", _read(), journey)
    return root


_SPARK_READS = _claims('claims.spark = [{ journey = "table.read", region = "read" }]')


def _artifact(root: Path) -> dict:
    compat.fix(root)
    return json.loads((root / "content/proj/compatibility.json").read_text())


def test_a_journeys_roles_add_to_its_paths(tmp_path) -> None:
    root = _modeled(
        _repo(tmp_path, _SPARK_READS),
        _read(
            "roles: {client: {consumes: [icebergRestSpec]},"
            " storage: {realizes: [lakehouse.catalog]}}"
        ),
    )
    data = _artifact(root)
    assert data["version"] == compat.ARTIFACT_VERSION
    read, write = data["journeys"]
    assert (read["path"], read["asset"]) == ("uc", "lakehouse.table")
    assert read["requires"] == {
        "client": {"consumes": ["unityCatalogSpec", "icebergRestSpec"]},
        "catalog": {"implements": ["unityCatalogSpec"]},
        "storage": {"realizes": ["lakehouse.catalog"]},
    }
    assert write["requires"] == {
        "client": {"consumes": ["unityCatalogSpec"]},
        "catalog": {"implements": ["unityCatalogSpec"]},
    }


@pytest.mark.parametrize(
    ("journey", "message"),
    [
        (
            "{title: R, summary: S, asset: apacheSpark, path: uc}",
            "is of kind implementation",
        ),
        (
            "{title: R, summary: S, asset: lakehouse.table, path: uc,"
            " roles: {client: {consumes: [lakehouse.catalog]}}}",
            "expected openSpecification",
        ),
        (
            "{title: R, summary: S, asset: lakehouse.table, path: uc,"
            " roles: {client: {uses: [unityCatalogSpec]}}}",
            "unknown",
        ),
        (
            "{title: R, summary: S, asset: lakehouse.nope, path: uc}",
            "not in the estate model",
        ),
    ],
)
def test_bad_journey_references_are_errors(
    tmp_path, journey: str, message: str
) -> None:
    root = _modeled(_repo(tmp_path, ""), f"table.read: {journey}")
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


_OBLIGATIONS = """\
spec: icebergRestSpec
source: https://example.com/spec
roles: [reader, writer]
obligations:
  loadTable: { roles: [reader], since: v1 }
  commitTable: {}
"""


def _obligations(
    root: Path, text: str = _OBLIGATIONS, spec: str = "icebergRestSpec"
) -> Path:
    path = root / _CATALOG / "obligations" / f"{spec}.yml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return root


def test_a_journey_names_the_obligations_it_covers(tmp_path) -> None:
    root = _obligations(
        _modeled(
            _repo(tmp_path, _SPARK_READS),
            _read(
                "covers: [icebergRestSpec:loadTable, icebergRestSpec:commitTable:writer]"
            ),
        )
    )
    read, write = _artifact(root)["journeys"]
    assert read["covers"] == [
        {"spec": "icebergRestSpec", "name": "loadTable", "role": "reader"},
        {"spec": "icebergRestSpec", "name": "commitTable", "role": "writer"},
    ]
    # The review app groups rows by the first obligation and its spec version.
    assert read["feature"] == {
        "spec": "icebergRestSpec",
        "name": "loadTable",
        "since": "v1",
    }
    assert (write["covers"], write["feature"]) == ([], None)


@pytest.mark.parametrize(
    ("covers", "message"),
    [
        ("[icebergRestSpec:nope]", "'nope' is not a icebergRestSpec obligation"),
        ("[unityCatalogSpec:getTable]", "'unityCatalogSpec' has no obligations file"),
        ("[icebergRestSpec:commitTable]", "binds reader, writer; name the role"),
        ("[icebergRestSpec:loadTable:writer]", "doesn't bind the writer role"),
        ("icebergRestSpec:loadTable", "lists <spec>:<obligation>[:<role>] entries"),
    ],
)
def test_bad_covers_are_errors(tmp_path, covers: str, message: str) -> None:
    root = _obligations(_modeled(_repo(tmp_path, ""), _read(f"covers: {covers}")))
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (
            _OBLIGATIONS.replace("roles: [reader, writer]\n", ""),
            "roles lists the roles",
        ),
        (
            _OBLIGATIONS.replace(
                "{ roles: [reader], since: v1 }", "{ roles: [server] }"
            ),
            "role 'server' is not one of",
        ),
        (
            _OBLIGATIONS.replace("spec: icebergRestSpec", "spec: apacheSpark"),
            "expected openSpecification",
        ),
        (
            _OBLIGATIONS.replace("commitTable: {}", "commitTable: { level: required }"),
            "unknown key 'level'",
        ),
    ],
)
def test_bad_obligation_files_are_errors(tmp_path, text: str, message: str) -> None:
    root = _obligations(_modeled(_repo(tmp_path, "")), text)
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_an_obligations_file_is_named_after_its_spec(tmp_path) -> None:
    root = _obligations(_modeled(_repo(tmp_path, "")), spec="iceberg")
    errors, _ = compat.check(root)
    assert any(
        "name the file after its spec (icebergRestSpec.yml)" in e for e in errors
    )


def test_coverage_counts_a_specs_obligations_per_role(tmp_path) -> None:
    root = _obligations(
        _modeled(_repo(tmp_path, _SPARK_READS), _read("covers: [ucApi:getTable]")),
        "spec: unityCatalogSpec\nsource: https://example.com/uc\nroles: [client]\n"
        "obligations:\n  getTable: {}\n  listTables: {}\n  listVolumes: {}\n",
        spec="unityCatalogSpec",
    )
    _edit(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "covers: [ucApi:getTable]",
        "covers: [unityCatalogSpec:getTable]",
    )
    _edit(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "summary: Append rows, asset: lakehouse.table, path: uc",
        "summary: Append rows, asset: lakehouse.table, path: uc,"
        " covers: [unityCatalogSpec:listTables]",
    )
    data = _artifact(root)
    # Spark consumes unityCatalogSpec; DuckDB has no model element, so no entry.
    (entry,) = data["coverage"]
    assert (entry["interface"], entry["spec"]) == ("spark", "unityCatalogSpec")
    assert entry["roles"]["client"] == {
        "tested": 1,
        "documented": 0,
        "fails": 0,
        "missing": 0,
        "blocked": 0,
        "unknown": 1,
        "untracked": 1,
    }
    assert entry["obligations"][0] == {
        "obligation": "getTable",
        "role": "client",
        "status": "tested",
        "journeys": ["table.read"],
    }
    assert compat.coverage_lines(root) == [
        "proj spark unityCatalogSpec client: 1/3 answered "
        "(✓ 1, docs 0, ✗ 0, blocked 0, — 1, untracked 1)"
    ]


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
    _edit(
        root,
        f"{_CATALOG}/interfaces.yml",
        "model: apacheSpark}",
        "model: apacheSpark, integrations: [ucSpark]}",
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
        _read("roles: {client: {consumes: [icebergRestSpec]}}"),
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
        _read("roles: {client: {consumes: [icebergRestSpec]}}"),
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
    _edit(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "summary: Append rows, asset: lakehouse.table",
        "summary: Append rows, asset: lakehouse.volume",
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


def test_a_path_with_no_roles_is_an_error(tmp_path) -> None:
    root = _repo(tmp_path, "")
    _append(root, f"{_CATALOG}/paths.yml", "bare: {roles: {}}\nnone: {}\n")
    errors, _ = compat.check(root)
    assert any("bare.roles maps participant roles" in e for e in errors), errors
    assert any("none needs roles" in e for e in errors), errors


def test_unmodeled_clients_and_local_participants_are_valid(tmp_path) -> None:
    # DuckDB has no model element, and a client-only journey needs no environment.
    root = _modeled(
        _repo(
            tmp_path,
            _claims('claims.duckdb = [{ journey = "table.read", region = "read" }]'),
        ),
        _read().replace("path: uc", "path: local"),
    )
    _append(
        root,
        f"{_CATALOG}/paths.yml",
        "local:\n  roles:\n    client: { consumes: [unityCatalogSpec] }\n",
    )
    data = _artifact(root)
    assert compat.check(root)[0] == []
    assert all(j["asset"] == "lakehouse.table" for j in data["journeys"])
    assert {"kind": "unmodeled", "interface": "duckdb"} in data["diagnostics"]


def test_an_asset_rollup_renders_its_journeys(tmp_path) -> None:
    root = _modeled(_repo(tmp_path, _SPARK_READS))
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
    _append(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "table.tried: {title: Untried, summary: Nobody yet, asset: lakehouse.table,"
        " path: uc}\n",
    )
    _edit(
        root,
        "content/proj/compatibility.yml",
        "rows: [table.read, table.write]",
        "rows: [table.read, table.tried, table.write]",
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
    _edit(
        root,
        f"{_CATALOG}/interfaces.yml",
        "duckdb: {label: DuckDB, package: duckdb}",
        "duckdb: {label: DuckDB, package: duckdb, via: deltalake}",
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
        _repo(tmp_path, _SPARK_READS), _read().replace("path: uc", "path: format")
    )
    _append(
        root,
        f"{_CATALOG}/paths.yml",
        "format:\n  roles:\n    client: { implements: [unityCatalogSpec] }\n",
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
        _read("roles: {client: {implements: [icebergRestSpec]}}"),
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


# --- facts about one implementation ---------------------------------------------

_UC_OBLIGATIONS = (
    "spec: unityCatalogSpec\nsource: https://example.com/uc\nroles: [client]\n"
    "obligations:\n  getTable: {}\n  listTables: {}\n"
)

_FACT = """\
- implementation: ucServer
  obligations: [unityCatalogSpec:listTables]
  outcome: missing
  why: The server has no listTables endpoint.
  source: proj:how-to/engine#read-it
"""


def _served(tmp_path: Path, claims: str = "", *, providers: bool = True) -> Path:
    """table.write covers listTables, which the bound catalog server lacks."""
    root = _obligations(
        _modeled(_repo(tmp_path, claims)), _UC_OBLIGATIONS, spec="unityCatalogSpec"
    )
    model_path = root / "architecture/dist/model.json"
    model = json.loads(model_path.read_text())
    model["elements"]["ucServer"] = {"kind": "implementation", "title": "UC server"}
    model_path.write_text(json.dumps(model))
    _edit(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "summary: Append rows, asset: lakehouse.table, path: uc",
        "summary: Append rows, asset: lakehouse.table, path: uc,"
        " covers: [unityCatalogSpec:listTables]",
    )
    _append(root, f"{_CATALOG}/evidence.yml", _FACT)
    if providers:
        _append(
            root, "content/proj/compatibility.yml", "providers:\n  catalog: ucServer\n"
        )
    return root


def test_a_server_fact_blocks_the_journeys_that_need_it(tmp_path) -> None:
    data = _artifact(_served(tmp_path, _SPARK_READS))
    read, write = data["journeys"]
    # Spark consumes unityCatalogSpec; DuckDB reaches no spec, so its cell is
    # the plain evidence it already had.
    cell = write["cells"]["spark"]
    assert cell["status"] == "missing"
    assert cell["evidence"][0]["implementation"] == "ucServer"
    assert write["cells"]["duckdb"]["evidence"][0]["implementation"] is None
    assert "spark" in read["cells"] and read["cells"]["spark"]["status"] == "tested"
    (entry,) = data["coverage"]
    assert entry["roles"]["client"]["blocked"] == 1
    assert {e["obligation"]: e["status"] for e in entry["obligations"]} == {
        "getTable": "untracked",
        "listTables": "blocked",
    }


def test_a_fact_no_project_binds_is_an_error(tmp_path) -> None:
    root = _served(tmp_path, providers=False)
    errors, _ = compat.check(root)
    assert any("the facts about ucServer block no journey" in e for e in errors), errors


def test_a_claim_that_works_contradicts_a_server_fact(tmp_path) -> None:
    root = _served(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.write", region = "read" }]'),
    )
    errors, _ = compat.check(root)
    assert any("evidence says spark table.write missing" in e for e in errors), errors


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        (
            "outcome: missing\n  why: The server",
            "outcome: works\n  why: The server",
            "a server fact's outcome is fails or missing",
        ),
        (
            "[unityCatalogSpec:listTables]",
            "[unityCatalogSpec:nope]",
            "'unityCatalogSpec:nope' is not an obligation",
        ),
        (
            "implementation: ucServer",
            "implementation: apacheSparkX",
            "not in the estate model",
        ),
        (
            "  why: The server has no listTables endpoint.\n",
            "  why: The server has no listTables endpoint.\n  interfaces: [spark]\n",
            "unknown key 'interfaces'",
        ),
    ],
)
def test_bad_server_facts_are_errors(
    tmp_path, old: str, new: str, message: str
) -> None:
    root = _served(tmp_path)
    _edit(root, f"{_CATALOG}/evidence.yml", old, new)
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


# --- rollup interfaces and selected rows -----------------------------------------


def _rolled(tmp_path: Path, claims: str) -> Path:
    """`spark` rolls up Spark's SQL and Python interfaces."""
    root = _repo(tmp_path, claims)
    _edit(
        root,
        f"{_CATALOG}/interfaces.yml",
        "model: apacheSpark}",
        "model: apacheSpark, rollup: [spark-sql, spark-python]}",
    )
    _append(
        root,
        f"{_CATALOG}/interfaces.yml",
        "spark-sql: {label: Spark · SQL, pin: pyspark, package: pyspark, model: apacheSpark}\n"
        "spark-python: {label: Spark · Python, pin: pyspark, package: pyspark,"
        " model: apacheSpark}\n",
    )
    return root


def test_a_rollup_column_shows_its_languages_claims(tmp_path) -> None:
    root = _rolled(
        tmp_path,
        _claims('claims.spark-sql = [{ journey = "table.read", region = "read" }]'),
    )
    compat.fix(root)
    assert compat.check(root)[0] == []
    assert _table(root)[2] == "| Read | [✓](../../how-to/engine/index.md#read-it) | — |"


def test_a_rollup_shows_the_best_of_its_languages(tmp_path) -> None:
    root = _rolled(
        tmp_path,
        _claims(
            'claims.spark-sql = [{ journey = "table.read", region = "read" }]',
            'claims.spark-python = [{ journey = "table.read", fails = true }]',
        ),
    )
    # Python failing where SQL works is no disagreement for the Spark column.
    compat.fix(root)
    assert compat.check(root)[0] == []
    assert _table(root)[2] == "| Read | [✓](../../how-to/engine/index.md#read-it) | — |"


def test_a_rollup_interface_takes_no_claims(tmp_path) -> None:
    root = _rolled(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    errors, _ = compat.check(root)
    assert any(
        "claim the interface the page shows (spark-sql or spark-python)" in e
        for e in errors
    ), errors


@pytest.mark.parametrize(
    ("rollup", "message"),
    [
        ("[spark-sql, trino]", "'trino' is not an interface"),
        ("[spark-sql, duckdb]", "'duckdb' is bound to None, not apacheSpark"),
    ],
)
def test_bad_rollups_are_errors(tmp_path, rollup: str, message: str) -> None:
    root = _rolled(tmp_path, "")
    _edit(root, f"{_CATALOG}/interfaces.yml", "[spark-sql, spark-python]", rollup)
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_a_table_can_select_its_rows(tmp_path) -> None:
    root = _repo(
        tmp_path,
        _claims('claims.spark = [{ journey = "table.read", region = "read" }]'),
    )
    _append(
        root,
        f"{_CATALOG}/paths.yml",
        "local:\n  roles:\n    client: { consumes: [unityCatalogSpec] }\n",
    )
    _append(
        root,
        f"{_CATALOG}/journeys/table.yml",
        "table.local: {title: Local, summary: Locally, asset: lakehouse.table,"
        " path: local}\n",
    )
    _edit(
        root,
        "content/proj/compatibility.yml",
        "    rows: [table.read, table.write]\n",
        "    rows: [table.read, table.write]\n"
        "  by-catalog:\n"
        "    columns: [spark]\n"
        "    select: { asset: lakehouse.table, paths: [uc] }\n"
        "  local:\n"
        "    columns: [spark]\n"
        "    select: { paths: [local] }\n",
    )
    data = _artifact(root)
    tables = {t["id"]: t["rows"] for t in data["tables"]}
    assert tables["by-catalog"] == ["table.read", "table.write"]
    assert tables["local"] == ["table.local"]


@pytest.mark.parametrize(
    ("select", "message"),
    [
        ("{ paths: [nope] }", "'nope' is not in paths.yml"),
        ("{ asset: lakehouse.volume }", "matches no journey"),
        ("{ asset: lakehouse.table, owner: me }", "unknown key 'owner'"),
    ],
)
def test_bad_selects_are_errors(tmp_path, select: str, message: str) -> None:
    root = _repo(tmp_path, "")
    _edit(
        root,
        "content/proj/compatibility.yml",
        "    rows: [table.read, table.write]\n",
        f"    rows: [table.read, table.write]\n  more:\n    columns: [spark]\n"
        f"    select: {select}\n",
    )
    errors, _ = compat.check(root)
    assert any(message in e for e in errors), errors


def test_a_table_lists_or_selects_its_rows_not_both(tmp_path) -> None:
    root = _repo(tmp_path, "")
    _edit(
        root,
        "content/proj/compatibility.yml",
        "    rows: [table.read, table.write]\n",
        "    rows: [table.read, table.write]\n    select: { paths: [uc] }\n",
    )
    errors, _ = compat.check(root)
    assert any("lists rows or selects them, not both" in e for e in errors), errors
