# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "duckdb==1.5.6", "deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# verifies = "write_duckdb.sql"
# ///
"""Run write_duckdb.sql against a table deltalake wrote, read DuckDB's commit
back with deltalake, then pin what DuckDB can't write."""

from pathlib import Path

import duckdb
import write
from deltalake import DeltaTable
from docsnip.sqlregions import run

SQL = Path(__file__).with_name("write_duckdb.sql")


def fails_with(con, statement: str, message: str) -> None:
    try:
        con.execute(statement)
    except duckdb.Error as exc:
        assert message in str(exc), exc
    else:
        raise AssertionError(f"DuckDB accepted: {statement}")


if __name__ == "__main__":
    write.build_orders()
    con = duckdb.connect()
    run(SQL, "setup", lambda s: con.execute(s).fetchall())
    run(SQL, "append", lambda s: con.execute(s).fetchall())

    assert con.execute("SELECT count(*) FROM orders").fetchone() == (6,)
    dt = DeltaTable("/tmp/delta/orders")
    assert dt.version() == 3, dt.version()
    assert sorted(dt.to_pandas()["order_id"]) == [1, 2, 3, 4, 5, 6]
    [latest] = dt.history(limit=1)
    assert latest["operation"] == "UNKNOWN", latest

    # Appends are the only writes the delta extension makes.
    fails_with(con, "DELETE FROM orders", "Can only delete from base table")
    fails_with(
        con, "UPDATE orders SET status = 'shipped'", "Can only update base table"
    )
    con.execute("ATTACH '/tmp/delta/new-table' AS fresh (TYPE delta)")
    fails_with(
        con,
        "CREATE TABLE fresh.t (a INT)",
        "Delta tables do not support creating tables",
    )
