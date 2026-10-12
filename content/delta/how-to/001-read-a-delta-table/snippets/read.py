# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.docs-factory]
# claims.deltalake = [
#   { journey = "read.scan", region = "read", api = "DeltaTable(path).to_pandas()" },
# ]
# ///
"""Read a Delta table with the deltalake package.

It reads the whole table, then selected columns and rows. It first writes the
sample `orders` table to /tmp/delta/orders, replacing any table there. The
asserts at the end check the result, so a run that finishes means the example
works.
"""

import shutil

COLUMNS = ("order_id", "customer_id", "product", "quantity", "amount", "status")
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
        rows = [dict(zip(COLUMNS, row, strict=True)) for row in batch]
        write_deltalake(path, pa.Table.from_pylist(rows, schema=schema), mode="append")


def main():
    build_orders()

    # --8<-- [start:read]
    from deltalake import DeltaTable

    dt = DeltaTable("/tmp/delta/orders")
    df = dt.to_pandas()
    print(df.sort_values("order_id"))
    # --8<-- [end:read]
    everything = df

    # --8<-- [start:filter]
    df = DeltaTable("/tmp/delta/orders").to_pandas(
        columns=["order_id", "product", "amount"],
        filters=[("status", "=", "placed"), ("amount", ">", 15)],
    )
    print(df.sort_values("order_id"))
    # --8<-- [end:filter]
    return everything, df


if __name__ == "__main__":
    everything, filtered = main()
    assert sorted(everything["order_id"]) == [1, 2, 3, 4, 5], everything
    assert list(filtered.columns) == ["order_id", "product", "amount"], filtered
    assert sorted(filtered["order_id"]) == [1, 2, 5], filtered
