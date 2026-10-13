# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "duckdb==1.5.6", "deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# verifies = "time_travel_duckdb.sql"
# claims.duckdb-sql = [
#   { journey = "read.version", region = "version", api = "AT (VERSION => n)" },
#   { journey = "read.past-retention", region = "version", anchor = "retention-limits-time-travel", note = "while its files exist" },
#   { journey = "read.timestamp", fails = "only support at_clause with unit 'version'", anchor = "query-a-timestamp" },
# ]
# ///
"""Run time_travel_duckdb.sql region by region against a table deltalake wrote,
then pin that DuckDB travels by version only."""

from pathlib import Path

import duckdb
import time_travel
from docsnip.sqlregions import run

SQL = Path(__file__).with_name("time_travel_duckdb.sql")

if __name__ == "__main__":
    time_travel.build_orders()
    con = duckdb.connect()
    run(SQL, "setup", lambda s: con.execute(s).fetchall())

    _, rows = run(SQL, "version", lambda s: con.execute(s).fetchall())
    assert [r[0] for r in rows] == [1, 2, 3], rows

    # Attaching at a version pins every query on that name to it.
    con.execute("ATTACH '/tmp/delta/orders' AS orders_v1 (TYPE delta, VERSION 1)")
    assert con.execute("SELECT count(*) FROM orders_v1").fetchone() == (3,)

    # Unlike Spark, DuckDB reads a version older than the retention period.
    assert con.execute("SELECT count(*) FROM orders AT (VERSION => 0)").fetchone() == (
        0,
    )
    try:
        con.execute("SELECT * FROM orders AT (TIMESTAMP => now() - INTERVAL 1 DAY)")
    except duckdb.Error as exc:
        assert "only support at_clause with unit 'version'" in str(exc), exc
    else:
        raise AssertionError("DuckDB accepted a timestamp")
