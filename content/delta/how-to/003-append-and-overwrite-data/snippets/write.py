# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.docs-factory]
# claims.deltalake = [
#   { journey = "write.append", region = "append", api = 'write_deltalake(mode="append")' },
#   { journey = "write.overwrite", region = "overwrite", api = 'write_deltalake(mode="overwrite")' },
#   { journey = "write.enforce-schema", region = "append", note = "other columns fail with `SchemaMismatchError`" },
#   { journey = "history.list", region = "history", api = "history()" },
# ]
# ///
"""Append rows to a Delta table with the deltalake package, then overwrite it.

It first writes the sample `orders` table to /tmp/delta/orders, replacing any
table there. The asserts at the end check the result, so a run that finishes
means the example works.
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

    # --8<-- [start:append]
    import pyarrow as pa
    from deltalake import DeltaTable, write_deltalake

    new_orders = pa.table(
        {
            "order_id": [6],
            "customer_id": [104],
            "product": ["gizmo"],
            "quantity": [2],
            "amount": [24.50],
            "status": ["placed"],
        }
    )
    write_deltalake("/tmp/delta/orders", new_orders, mode="append")
    # --8<-- [end:append]
    after_append = DeltaTable("/tmp/delta/orders").to_pandas()

    from deltalake.exceptions import SchemaMismatchError

    try:
        other_columns = pa.table({"order_id": [9], "note": ["x"]})
        write_deltalake("/tmp/delta/orders", other_columns, mode="append")
    except SchemaMismatchError:
        pass
    else:
        raise AssertionError("an append with other columns was accepted")

    # --8<-- [start:overwrite]
    replacement = pa.table(
        {
            "order_id": [7, 8],
            "customer_id": [105, 101],
            "product": ["widget", "gadget"],
            "quantity": [4, 2],
            "amount": [39.96, 49.00],
            "status": ["placed", "placed"],
        }
    )
    write_deltalake("/tmp/delta/orders", replacement, mode="overwrite")
    # --8<-- [end:overwrite]
    after_overwrite = DeltaTable("/tmp/delta/orders").to_pandas()

    # --8<-- [start:history]
    for commit in DeltaTable("/tmp/delta/orders").history(limit=2):
        print(commit["version"], commit["operation"], commit["operationParameters"])
    # --8<-- [end:history]
    history = DeltaTable("/tmp/delta/orders").history(limit=2)
    previous = DeltaTable("/tmp/delta/orders", version=3).to_pandas()
    return after_append, after_overwrite, history, previous


if __name__ == "__main__":
    after_append, after_overwrite, history, previous = main()
    assert sorted(after_append["order_id"]) == [1, 2, 3, 4, 5, 6], after_append
    assert sorted(after_overwrite["order_id"]) == [7, 8], after_overwrite
    assert [
        (c["version"], c["operation"], c["operationParameters"]["mode"])
        for c in history
    ] == [
        (4, "WRITE", "Overwrite"),
        (3, "WRITE", "Append"),
    ], history
    # The overwritten rows stay readable in the earlier version.
    assert len(previous) == 6, previous
