# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "polars==1.44.2",
#   "deltalake==1.6.6",
#   "pyarrow>=18",
#   "unitycatalog-client==0.6.0",
# ]
#
# [tool.docs-factory]
# compose = "../compose.yaml"
# services = ["unitycatalog"]
# env = { AWS_ENDPOINT_URL = "http://localhost:9000", AWS_ALLOW_HTTP = "true" }
# ///
"""List, read, and append to a Unity Catalog table on S3 from Polars.

docker compose up -d --wait        # from the page folder
AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run snippets/polars_tables.py
"""

import asyncio
import os
import sys

# --8<-- [start:connect]
import polars as pl

catalog = pl.Catalog("http://localhost:8080", require_https=False)
# --8<-- [end:connect]

from _seed import S3_ROOT_KEYS, seed_orders  # noqa: E402


def main() -> None:
    # --8<-- [start:list]
    for table in catalog.list_tables("retail", "sales"):
        print(table.name, table.table_type, table.storage_location)
    # --8<-- [end:list]
    assert [t.name for t in catalog.list_tables("retail", "sales")] == ["orders"]

    # --8<-- [start:read]
    orders = catalog.scan_table("retail", "sales", "orders")
    print(orders.filter(pl.col("amount") > 5).collect())
    # --8<-- [end:read]
    assert orders.collect().height == 3

    # --8<-- [start:append]
    new_orders = pl.DataFrame(
        {"order_id": [4], "customer": ["margaret"], "amount": [12.0]}
    )
    catalog.write_table(new_orders, "retail", "sales", "orders", delta_mode="append")
    # --8<-- [end:append]
    assert catalog.scan_table("retail", "sales", "orders").collect().height == 4


if __name__ == "__main__":
    asyncio.run(seed_orders("s3://uc-docs/retail/orders", S3_ROOT_KEYS))
    main()
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
