"""Read a Delta table from local storage using Polars.

Demonstrates both the lazy (scan_delta) and eager (read_delta) APIs,
schema inspection, predicate pushdown, and column projection.

Polars uses the `deltalake` Python library as its Delta backend.
Install both: pip install polars deltalake

Usage
-----
Run directly::

    python examples/read-delta-table-local/polars.py

Or via the Makefile::

    make run EXAMPLE=read-delta-table-local ENGINE=polars
"""

from __future__ import annotations

import importlib
import pathlib
import sys

# Default fixture path — relative to the docs-factory repo root.
_FIXTURE_DEFAULT = pathlib.Path(__file__).parents[2] / "fixtures" / "read-delta-table-local"


def _import_polars():
    """Import the real polars package, bypassing any self-shadowing.

    When this file is run as a script, Python inserts the script's directory
    at the front of sys.path, which would make ``import polars`` resolve to
    this file instead of the installed package. We remove the shadowing entry
    temporarily so the correct package is loaded.
    """
    script_dir = str(pathlib.Path(__file__).parent)
    # Remove the script directory from sys.path while importing polars
    filtered = [p for p in sys.path if p != script_dir]
    original_path = sys.path[:]
    sys.path[:] = filtered
    try:
        pl = importlib.import_module("polars")
    finally:
        sys.path[:] = original_path
    return pl


def run(table_path: str | pathlib.Path | None = None) -> None:
    """Read a Delta table from a local path with Polars and print diagnostics.

    Parameters
    ----------
    table_path:
        Absolute or relative path to the root of a Delta table directory.
        Falls back to the bundled test fixture when ``None``.
    """
    pl = _import_polars()

    path = pathlib.Path(table_path) if table_path is not None else _FIXTURE_DEFAULT

    if not path.exists():
        raise FileNotFoundError(
            f"Delta table not found at {path!r}. "
            "Create the test fixture first, or pass an explicit `table_path`."
        )

    table_uri = str(path)

    # ------------------------------------------------------------------
    # 1. Lazy read with scan_delta — returns a LazyFrame.
    #    Polars defers I/O and can push predicates and projections down
    #    into the Parquet reader automatically.
    # ------------------------------------------------------------------
    lazy = pl.scan_delta(table_uri)

    # Inspect the schema without triggering full I/O
    print("Schema (from LazyFrame):")
    print(lazy.collect_schema())
    print()

    # Apply a filter and column projection lazily, then collect
    result = (
        lazy
        .filter(pl.col("value") > 15.0)
        .select(["id", "name", "value", "category"])
        .collect()
    )

    print(f"Rows with value > 15.0 (lazy path): {len(result)}")
    print(result)
    print()

    # ------------------------------------------------------------------
    # 2. Eager read with read_delta — returns a DataFrame immediately.
    #    Use this when you need the full table in memory at once, or when
    #    composing with non-lazy operations.
    # ------------------------------------------------------------------
    df = pl.read_delta(table_uri)

    print(f"Full table shape: {df.shape}")
    print(f"Columns: {df.columns}")
    print()

    # Schema inspection on a DataFrame
    print("Schema (from DataFrame):")
    for col_name, dtype in zip(df.columns, df.dtypes):
        print(f"  {col_name}: {dtype}")
    print()

    # Demonstrate a basic aggregation
    summary = df.group_by("category").agg(
        pl.col("value").mean().alias("avg_value"),
        pl.len().alias("count"),
    ).sort("category")

    print("Aggregation by category:")
    print(summary)

    # ------------------------------------------------------------------
    # 3. Read a specific Delta version (time-travel).
    #    version=0 is the initial snapshot; bump to test later versions.
    # ------------------------------------------------------------------
    df_v0 = pl.read_delta(table_uri, version=0)
    print(f"\nVersion 0 row count: {len(df_v0)}")

    print("\nDone.")


if __name__ == "__main__":
    run()
