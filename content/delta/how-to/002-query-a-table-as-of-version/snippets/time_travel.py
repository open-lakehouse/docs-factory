# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake[pandas,pyarrow]==1.6.6"]
#
# [tool.docs-factory]
# claims.delta-rs-python = [
#   { journey = "read.version", region = "version", api = "DeltaTable(path, version=n)" },
#   { journey = "read.timestamp", region = "timestamp", api = "load_as_version(datetime)" },
#   { journey = "history.list", region = "history", api = "history()" },
#   { journey = "read.past-retention", region = "version", anchor = "retention-limits-time-travel", note = "while its files exist" },
# ]
# ///
"""Query earlier versions of a Delta table with the deltalake package.

It lists the history, then reads the table as of a version and as of a
timestamp. It first writes the sample `orders` table to /tmp/delta/orders,
replacing any table there, and backdates its commits. The asserts at the end
check the result, so a run that finishes means the example works.
"""

import os
import shutil
import time
from pathlib import Path

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
DAY = 24 * 60 * 60


def build_orders(path: str = "/tmp/delta/orders") -> None:
    """Write the `orders` table the tutorials build, with versions 0, 1, and 2
    committed 8 days, 2 days, and 1 hour ago."""
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
    # Without in-commit timestamps, a version's time is the modification time
    # of its commit file in _delta_log.
    now = time.time()
    for version, age in enumerate((8 * DAY, 2 * DAY, 60 * 60)):
        commit = Path(path, "_delta_log", f"{version:020d}.json")
        os.utime(commit, (now - age, now - age))


def main():
    build_orders()

    # --8<-- [start:history]
    from deltalake import DeltaTable

    for commit in DeltaTable("/tmp/delta/orders").history():
        print(commit["version"], commit["operation"])
    # --8<-- [end:history]
    history = DeltaTable("/tmp/delta/orders").history()

    # --8<-- [start:version]
    dt = DeltaTable("/tmp/delta/orders", version=1)
    print(dt.to_pandas().sort_values("order_id"))
    # --8<-- [end:version]
    at_version = dt.to_pandas()

    # --8<-- [start:timestamp]
    from datetime import UTC, datetime, timedelta

    dt = DeltaTable("/tmp/delta/orders")
    dt.load_as_version(datetime.now(UTC) - timedelta(days=1))
    print(dt.version())
    print(dt.to_pandas().sort_values("order_id"))
    # --8<-- [end:timestamp]
    at_timestamp = (dt.version(), dt.to_pandas())

    # Spark refuses this version, older than the retention period; deltalake reads it.
    oldest = DeltaTable("/tmp/delta/orders", version=0).to_pandas()
    return history, at_version, at_timestamp, oldest


if __name__ == "__main__":
    history, at_version, (version, at_timestamp), oldest = main()
    assert [c["operation"] for c in history] == ["WRITE", "WRITE", "CREATE TABLE"], (
        history
    )
    assert sorted(at_version["order_id"]) == [1, 2, 3], at_version
    assert version == 1 and sorted(at_timestamp["order_id"]) == [1, 2, 3], at_timestamp
    assert len(oldest) == 0, oldest
