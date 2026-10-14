# /// script
# requires-python = ">=3.11"
# dependencies = ["pyiceberg[pyarrow,pandas]==0.12.0"]
# ///
# read_orders_pyiceberg.py — read the table into Arrow and list who committed each snapshot.
# Run:      PYICEBERG_CATALOG__RETAIL__S3__ENDPOINT=http://localhost:9000 uv run read_orders_pyiceberg.py
# Needs:    change_orders_duckdb.py run first. The endpoint variable is only for the
#           docs environment's simulated S3; leave it out on AWS.
# Verified: unitycatalog v0.7.0, pyiceberg 0.12.0.
import os
import sys

# --8<-- [start:read]
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "retail",
    type="rest",
    uri="http://localhost:8080/api/2.1/unity-catalog/iceberg",
    warehouse="retail",
    token="not-used",
)
orders = catalog.load_table("sales.orders")
print(orders.scan().to_arrow().sort_by("order_id").to_pandas())

for snapshot in orders.snapshots():
    print(
        snapshot.snapshot_id,
        snapshot.summary.operation.value,
        snapshot.summary.additional_properties.get("engine-name", "(no engine-name)"),
    )
# --8<-- [end:read]
assert orders.scan().to_arrow().num_rows == 4
sys.stdout.flush()
os._exit(0)  # skip pyarrow's native teardown, which can hang on exit
