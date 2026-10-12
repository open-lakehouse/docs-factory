# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake[pandas,pyarrow]==1.6.6", "duckdb==1.5.6"]
# ///
"""Build a Delta table with the deltalake package, then query it with DuckDB.

The steps match the tutorial: create an empty `orders` table at
/tmp/delta/orders, append rows in two commits, list the history, then read the
table with DuckDB, latest and as of version 1. It replaces any table already at
that path. The asserts at the end check the result, so a run that finishes
means the example works.
"""

import shutil


def main():
    # Start from an empty path, so the versions below match the tutorial.
    shutil.rmtree("/tmp/delta/orders", ignore_errors=True)

    # --8<-- [start:create]
    import pyarrow as pa
    from deltalake import DeltaTable, write_deltalake

    schema = pa.schema(
        [
            ("order_id", pa.int64()),
            ("customer_id", pa.int64()),
            ("product", pa.string()),
            ("quantity", pa.int64()),
            ("amount", pa.float64()),
            ("status", pa.string()),
        ]
    )
    DeltaTable.create("/tmp/delta/orders", schema=schema)
    # --8<-- [end:create]

    # --8<-- [start:append-first]
    first = pa.table(
        {
            "order_id": [1, 2, 3],
            "customer_id": [101, 102, 101],
            "product": ["widget", "gadget", "gizmo"],
            "quantity": [2, 1, 5],
            "amount": [19.98, 24.50, 12.25],
            "status": ["placed", "placed", "shipped"],
        },
        schema=schema,
    )
    write_deltalake("/tmp/delta/orders", first, mode="append")
    # --8<-- [end:append-first]

    # --8<-- [start:read]
    dt = DeltaTable("/tmp/delta/orders")
    print(dt.version())
    print(dt.to_pandas().sort_values("order_id"))
    # --8<-- [end:read]
    version_after_first = dt.version()
    rows_after_first = dt.to_pyarrow_table().num_rows

    # --8<-- [start:append-second]
    second = pa.table(
        {
            "order_id": [4, 5],
            "customer_id": [103, 102],
            "product": ["widget", "sprocket"],
            "quantity": [1, 3],
            "amount": [9.99, 30.00],
            "status": ["placed", "placed"],
        },
        schema=schema,
    )
    write_deltalake("/tmp/delta/orders", second, mode="append")
    # --8<-- [end:append-second]

    # --8<-- [start:history]
    for commit in DeltaTable("/tmp/delta/orders").history():
        print(commit["version"], commit["operation"])
    # --8<-- [end:history]
    operations = [c["operation"] for c in DeltaTable("/tmp/delta/orders").history()]

    # --8<-- [start:duckdb-open]
    import duckdb

    con = duckdb.connect()
    con.sql("INSTALL delta")
    con.sql("LOAD delta")
    # --8<-- [end:duckdb-open]

    # --8<-- [start:duckdb-scan]
    con.sql("""
        SELECT product, sum(quantity) AS units
        FROM delta_scan('/tmp/delta/orders')
        GROUP BY product
        ORDER BY product
    """).show()
    # --8<-- [end:duckdb-scan]
    units = con.execute(
        "SELECT product, sum(quantity) FROM delta_scan('/tmp/delta/orders') "
        "GROUP BY product ORDER BY product"
    ).fetchall()

    # --8<-- [start:duckdb-version]
    con.sql("ATTACH '/tmp/delta/orders' AS orders (TYPE delta)")
    con.sql("SELECT count(*) AS orders FROM orders AT (VERSION => 1)").show()
    # --8<-- [end:duckdb-version]
    at_v1 = con.execute("SELECT count(*) FROM orders AT (VERSION => 1)").fetchone()
    latest = con.execute("SELECT count(*) FROM orders").fetchone()

    return version_after_first, rows_after_first, operations, units, at_v1, latest


if __name__ == "__main__":
    version_after_first, rows_after_first, operations, units, at_v1, latest = main()
    assert (version_after_first, rows_after_first) == (1, 3)
    assert operations == ["WRITE", "WRITE", "CREATE TABLE"], operations
    assert units == [("gadget", 1), ("gizmo", 5), ("sprocket", 3), ("widget", 3)], units
    assert at_v1 == (3,) and latest == (5,), (at_v1, latest)
