"""Compatibility tables: script claims + a project's vocabulary → page tables."""

from __future__ import annotations

from pathlib import Path

import pytest
from docsnip import compat

_MATRIX = """\
spec: ucSpec
interfaces:
  spark: {label: Spark, pin: pyspark, package: pyspark, model: apacheSpark}
  duckdb: {label: DuckDB, package: duckdb}
journeys:
  table.read: Read
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
    assert compat.fix(root) == [root / "content/proj/reference/002-matrix/index.md"]
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
    assert len(errors) == 1 and "is stale" in errors[0]


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
            "  table.read: Read\n", "  table.read: Read\n  x: X\n"
        )
    )
    errors, _ = compat.check(root)
    assert any("journeys.x is on no table" in e for e in errors), errors


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
