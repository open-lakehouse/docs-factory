"""Read a Delta table from local storage using DuckDB.

DuckDB reads Delta tables natively via its ``delta`` extension, which is
bundled with DuckDB 1.1+. No external catalog or Spark session is required —
point it at a local directory that contains a ``_delta_log/`` folder and
DuckDB handles the rest.

Example usage
-------------
Run directly::

    python duckdb.py

Or import and call from a test::

    from examples.read_delta_table_local import duckdb as duckdb_example
    result = duckdb_example.run()
"""

from __future__ import annotations

import pathlib


# ---------------------------------------------------------------------------
# Resolve the default fixture path relative to this file.
# The fixture is a small Delta table committed to docs-factory/fixtures/.
# ---------------------------------------------------------------------------
_FIXTURE_PATH = (
    pathlib.Path(__file__).parent.parent.parent / "fixtures" / "sample-table"
)


def run(table_path: str | pathlib.Path | None = None) -> list[tuple]:
    """Read a local Delta table with DuckDB and return all rows.

    Parameters
    ----------
    table_path:
        Absolute or relative path to a Delta table directory (must contain a
        ``_delta_log/`` sub-directory). Defaults to the bundled sample fixture.

    Returns
    -------
    list[tuple]
        All rows from the table as a list of tuples.

    Raises
    ------
    FileNotFoundError
        If *table_path* does not exist or does not look like a Delta table.
    """
    import sys
    import importlib

    # This file is named duckdb.py which shadows the installed duckdb package.
    # Load the installed package by temporarily removing the directory containing
    # this file from sys.path, then restoring it afterwards.
    _this_dir = str(pathlib.Path(__file__).parent)
    _saved = [p for p in sys.path if pathlib.Path(p).resolve() == pathlib.Path(_this_dir).resolve()]
    for _p in _saved:
        sys.path.remove(_p)
    try:
        duckdb = importlib.import_module("duckdb")
    finally:
        sys.path.extend(_saved)

    # ------------------------------------------------------------------
    # Resolve path
    # ------------------------------------------------------------------
    if table_path is None:
        table_path = _FIXTURE_PATH

    path = pathlib.Path(table_path).resolve()

    if not path.exists():
        raise FileNotFoundError(
            f"Delta table path does not exist: {path}\n"
            "Create the fixture first:\n"
            "  python -c \"from fixtures import create; create()\"\n"
            "or pass an explicit table_path argument."
        )

    delta_log = path / "_delta_log"
    if not delta_log.exists():
        raise FileNotFoundError(
            f"No _delta_log/ found under {path}. "
            "Is this a valid Delta table directory?"
        )

    # ------------------------------------------------------------------
    # Install and load the delta extension (no-op if already loaded)
    # ------------------------------------------------------------------
    con = duckdb.connect()
    con.execute("INSTALL delta")
    con.execute("LOAD delta")

    # ------------------------------------------------------------------
    # Read the Delta table using delta_scan() — DuckDB's native Delta reader.
    # delta_scan() understands Delta protocol including deletion vectors and
    # column mapping.
    # ------------------------------------------------------------------
    table_uri = path.as_uri()  # file:///absolute/path/to/table

    # Full table scan
    result = con.execute(
        f"SELECT * FROM delta_scan('{table_uri}') ORDER BY id"
    ).fetchall()

    # Example: predicate pushdown — DuckDB pushes the WHERE clause into the
    # Delta scan, reading only matching row groups.
    active_rows = con.execute(
        f"SELECT id, name, score FROM delta_scan('{table_uri}') WHERE active = true ORDER BY score DESC"
    ).fetchall()

    # Example: aggregate query
    stats = con.execute(
        f"""
        SELECT
            COUNT(*)           AS total_rows,
            AVG(score)         AS avg_score,
            MAX(score)         AS max_score,
            SUM(CASE WHEN active THEN 1 ELSE 0 END) AS active_count
        FROM delta_scan('{table_uri}')
        """
    ).fetchone()

    con.close()

    print(f"Table path : {path}")
    print(f"All rows   : {len(result)}")
    print(f"Active rows: {len(active_rows)}")
    if stats:
        total, avg_score, max_score, active_count = stats
        print(f"Stats      : total={total}, avg_score={avg_score:.2f}, "
              f"max_score={max_score}, active={active_count}")

    return result


# ---------------------------------------------------------------------------
# Allow running directly: python duckdb.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    rows = run()
    print("\nAll rows:")
    for row in rows:
        print(" ", row)
