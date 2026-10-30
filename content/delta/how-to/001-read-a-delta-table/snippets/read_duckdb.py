# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==2.0.0", "deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.docs-factory]
# claims.duckdb-python = [
#   { journey = "read.scan", region = "read", api = "con.sql(\"FROM delta_scan(…)\")" },
# ]
# ///
"""Read a Delta table with DuckDB's Python API.

It reads the whole table, then selected columns and rows, as DuckDB relations.
DuckDB's `delta` extension doesn't create tables, so it first writes the sample
`orders` table to /tmp/delta/orders with the deltalake package, replacing any
table there. The asserts at the end check the result, so a run that finishes
means the example works.
"""

import shutil

# The tutorials' two commits after the table is created: versions 1 and 2.
BATCHES = (
    [
        (1, 101, "widget", 2, 19.98, "placed"),
        (2, 102, "gadget", 1, 24.50, "placed"),
        (3, 101, "gizmo", 5, 12.25, "shipped"),
    ],
    [(4, 103, "widget", 1, 9.99, "placed"), (5, 102, "sprocket", 3, 30.00, "placed")],
)


def build_orders(path: str = "/tmp/delta/orders") -> None:
    """Write the `orders` table the tutorials build, in the same three versions."""
    import pyarrow as pa
    from deltalake import DeltaTable, write_deltalake

    shutil.rmtree(path, ignore_errors=True)
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
    DeltaTable.create(path, schema=schema)
    for batch in BATCHES:
        rows = [dict(zip(schema.names, row, strict=True)) for row in batch]
        write_deltalake(path, pa.Table.from_pylist(rows, schema=schema), mode="append")


def main():
    build_orders()

    # --8<-- [start:session]
    import duckdb

    con = duckdb.connect()
    con.install_extension("delta")
    con.load_extension("delta")
    # --8<-- [end:session]

    # --8<-- [start:read]
    orders = con.sql("FROM delta_scan('/tmp/delta/orders')")
    orders.order("order_id").show()
    # --8<-- [end:read]
    everything = [r[0] for r in orders.order("order_id").fetchall()]

    # --8<-- [start:filter]
    placed = orders.filter("status = 'placed' AND amount > 15").select(
        "order_id", "product", "amount"
    )
    placed.order("order_id").show()
    # --8<-- [end:filter]
    return everything, placed.columns, placed.order("order_id").fetchall()


if __name__ == "__main__":
    everything, columns, rows = main()
    assert everything == [1, 2, 3, 4, 5], everything
    assert columns == ["order_id", "product", "amount"], columns
    assert rows == [(1, "widget", 19.98), (2, "gadget", 24.5), (5, "sprocket", 30.0)], (
        rows
    )
