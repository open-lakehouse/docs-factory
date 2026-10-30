# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "duckdb==2.0.0", "deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# verifies = "write_duckdb.sql"
# claims.duckdb-sql = [
#   { journey = "write.append", region = "append", api = "INSERT INTO" },
#   { journey = "write.overwrite", fails = "Can only delete from base table", anchor = "overwrite-a-table", note = "appends only" },
#   { journey = "dml.delete", fails = "Can only delete from base table", anchor = "overwrite-a-table" },
#   { journey = "dml.update", fails = "Can only update base table", anchor = "overwrite-a-table" },
#   { journey = "create.table", fails = true, anchor = "append-rows", note = "accepted, but writes no files" },
# ]
# ///
"""Run write_duckdb.sql against a table deltalake wrote, read DuckDB's commit
back with deltalake, then pin what DuckDB can't write."""

import shutil
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

    assert con.execute("SELECT count(*) FROM orders").fetchall() == [(6,)]
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
    # On a path with no table, CREATE TABLE and INSERT succeed but write nothing.
    shutil.rmtree("/tmp/delta/new-table", ignore_errors=True)
    con.execute("ATTACH '/tmp/delta/new-table' AS fresh (TYPE delta)")
    con.execute("CREATE TABLE fresh (a INT)")
    con.execute("INSERT INTO fresh VALUES (1)")
    con.execute("DETACH fresh")
    assert not Path("/tmp/delta/new-table").exists(), "DuckDB creates Delta tables now"
