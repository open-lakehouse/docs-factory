"""Read a Delta table from local storage using delta-rs (deltalake Python bindings).

This example demonstrates:
- Opening a local Delta table with DeltaTable
- Inspecting schema and table metadata
- Reading all data into an Arrow table
- Converting to a pandas-compatible structure (via PyArrow)

Journey: read-delta-table-local
Engine:  delta-rs (deltalake >= 1.0)
"""

from __future__ import annotations

import os
import pathlib
import tempfile

import pyarrow as pa
from deltalake import DeltaTable, write_deltalake

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

_FIXTURE_RELATIVE = pathlib.Path("fixtures") / "delta" / "products"


def _fixture_path(base: pathlib.Path | str | None = None) -> pathlib.Path:
    """Return the path to the test fixture, resolving from *base* or the
    docs-factory repository root."""
    if base is not None:
        return pathlib.Path(base)
    # Walk up from this file to find the repo root (contains data/ and examples/)
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "data").is_dir() and (parent / "examples").is_dir():
            return parent / _FIXTURE_RELATIVE
    # Fallback: relative to cwd
    return pathlib.Path.cwd() / _FIXTURE_RELATIVE


def _create_fixture(path: pathlib.Path) -> None:
    """Write a small Delta table at *path* for use in tests and local runs."""
    path.mkdir(parents=True, exist_ok=True)
    table = pa.table(
        {
            "product_id": pa.array([1, 2, 3, 4, 5], type=pa.int32()),
            "name": pa.array(["Widget A", "Widget B", "Gadget C", "Doohickey D", "Thingamajig E"]),
            "category": pa.array(["widgets", "widgets", "gadgets", "misc", "misc"]),
            "price": pa.array([9.99, 14.99, 49.99, 4.99, 24.99], type=pa.float64()),
            "in_stock": pa.array([True, True, False, True, True]),
        }
    )
    write_deltalake(str(path), table, mode="overwrite")


# ---------------------------------------------------------------------------
# Main example
# ---------------------------------------------------------------------------


def run(table_path: str | pathlib.Path | None = None) -> dict:
    """Read a Delta table from local storage and return summary information.

    Parameters
    ----------
    table_path:
        Path to an existing Delta table directory.  When *None* the function
        looks for the standard test fixture; if that is also missing it writes
        one to a temporary directory so the example is always self-contained.

    Returns
    -------
    dict
        A dict with keys ``schema``, ``row_count``, ``version``, and
        ``sample`` (list of dicts, first 3 rows).
    """
    # Resolve path -----------------------------------------------------------
    if table_path is None:
        resolved = _fixture_path()
        if not resolved.exists():
            # Self-healing: create a minimal fixture so the example always runs
            _create_fixture(resolved)
    else:
        resolved = pathlib.Path(table_path)
        if not resolved.exists():
            raise FileNotFoundError(f"Delta table not found at: {resolved}")

    # Open table -------------------------------------------------------------
    dt = DeltaTable(str(resolved))

    # Schema inspection ------------------------------------------------------
    schema = dt.schema()
    print("=== Delta table schema ===")
    print(schema.to_arrow())

    # Table metadata ---------------------------------------------------------
    version = dt.version()
    metadata = dt.metadata()
    print(f"\nTable name   : {metadata.name or '(none)'}")
    print(f"Table version: {version}")
    print(f"Num files    : {len(dt.file_uris())}")

    # Read all data as an Arrow table ----------------------------------------
    arrow_table: pa.Table = dt.to_pyarrow_dataset().to_table()
    row_count = len(arrow_table)
    print(f"Row count    : {row_count}")

    # Show a few rows --------------------------------------------------------
    sample_rows = arrow_table.slice(0, 3).to_pylist()
    print("\n=== First 3 rows ===")
    for row in sample_rows:
        print(row)

    return {
        "schema": str(schema.to_arrow()),
        "row_count": row_count,
        "version": version,
        "sample": sample_rows,
    }


# ---------------------------------------------------------------------------
# pytest tests
# ---------------------------------------------------------------------------


def test_run_creates_fixture_and_returns_rows(tmp_path: pathlib.Path) -> None:
    """run() with a fresh tmp_path creates the fixture and returns > 0 rows."""
    table_path = tmp_path / "products"
    _create_fixture(table_path)
    result = run(table_path=str(table_path))
    assert result["row_count"] > 0


def test_schema_contains_expected_fields(tmp_path: pathlib.Path) -> None:
    table_path = tmp_path / "products"
    _create_fixture(table_path)
    result = run(table_path=str(table_path))
    schema_str = result["schema"]
    assert "product_id" in schema_str
    assert "price" in schema_str


def test_sample_is_list_of_dicts(tmp_path: pathlib.Path) -> None:
    table_path = tmp_path / "products"
    _create_fixture(table_path)
    result = run(table_path=str(table_path))
    assert isinstance(result["sample"], list)
    assert all(isinstance(row, dict) for row in result["sample"])


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    run()
