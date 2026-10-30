# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "deltalake==1.6.6", "duckdb==2.0.0"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# lane = "spark"
# verifies = "first_table.sql"
# claims.spark-sql = [
#   { journey = "create.table", region = "create", api = "CREATE TABLE delta.`<path>`" },
#   { journey = "write.append", region = "insert-first", api = "INSERT INTO" },
#   { journey = "read.scan", region = "select", api = "SELECT" },
#   { journey = "history.list", region = "history", api = "DESCRIBE HISTORY" },
#   { journey = "read.version", region = "time-travel", api = "VERSION AS OF" },
# ]
# ///
"""Enter first_table.sql in the spark-sql shell the tutorial starts, then read
the table it leaves with deltalake and DuckDB."""

import shutil
import tempfile
from pathlib import Path

import duckdb
from deltalake import DeltaTable
from docsnip import shellregions, sqlregions

HERE = Path(__file__).parent
SQL = HERE / "first_table.sql"
SHELL = HERE / "spark_sql.sh"
TABLE = "/tmp/delta/orders"
STEPS = ("create", "insert-first", "select", "insert-second", "history", "time-travel")
FIRST_ROW = "1\t101\twidget\t2\t19.98\tplaced"

if __name__ == "__main__":
    shutil.rmtree(TABLE, ignore_errors=True)
    # spark-sql writes metastore_db/ and derby.log where it starts; keep them out
    # of the repo.
    with tempfile.TemporaryDirectory() as cwd:
        out = shellregions.run(
            SHELL, "launch", cwd=Path(cwd), input=sqlregions.text(SQL, *STEPS)
        )

    # The query after the first insert and the read of version 1 print the same
    # three rows; the rows from the second insert are in neither.
    assert out.count(FIRST_ROW) == 2, out
    assert "3\t101\tgizmo\t5\t12.25\tshipped" in out, out
    assert "4\t103\twidget" not in out, out

    dt = DeltaTable(TABLE)
    assert dt.version() == 2, dt.version()
    history = dt.history()
    assert [h["operation"] for h in history] == ["WRITE", "WRITE", "CREATE TABLE"], (
        history
    )

    # Spark's table reads the same in DuckDB, latest and as of version 1.
    con = duckdb.connect()
    con.execute("INSTALL delta")
    con.execute("LOAD delta")
    assert con.execute(f"SELECT count(*) FROM delta_scan('{TABLE}')").fetchall() == [
        (5,)
    ]
    con.execute(f"ATTACH '{TABLE}' AS orders (TYPE delta)")
    assert con.execute("SELECT count(*) FROM orders AT (VERSION => 1)").fetchall() == [
        (3,)
    ]

    log = shellregions.run(SHELL, "log")
    for version in range(3):
        assert f"{version:020d}.json" in log, log
