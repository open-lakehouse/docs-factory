# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "duckdb==2.0.0", "deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# verifies = "read_duckdb.sql"
# claims.duckdb-sql = [
#   { journey = "read.scan", region = "read", api = "delta_scan()" },
# ]
# ///
"""Run read_duckdb.sql region by region against a table deltalake wrote, then
once through the DuckDB CLI the page starts."""

from pathlib import Path

import duckdb
import read
from docsnip import shellregions, sqlregions

HERE = Path(__file__).parent
SQL = HERE / "read_duckdb.sql"

if __name__ == "__main__":
    read.build_orders()
    con = duckdb.connect()
    sqlregions.run(SQL, "setup", lambda s: con.execute(s).fetchall())

    [rows] = sqlregions.run(SQL, "read", lambda s: con.execute(s).fetchall())
    assert [r[0] for r in rows] == [1, 2, 3, 4, 5], rows

    [rows] = sqlregions.run(SQL, "filter", lambda s: con.execute(s).fetchall())
    assert rows == [(1, "widget", 19.98), (2, "gadget", 24.5), (5, "sprocket", 30.0)], (
        rows
    )

    out = shellregions.run(
        HERE / "duckdb.sh", "launch", input=sqlregions.text(SQL, "setup", "read")
    )
    assert "sprocket" in out and "gizmo" in out, out
