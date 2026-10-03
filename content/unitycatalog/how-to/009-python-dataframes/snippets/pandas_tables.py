# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas==2.3.3",
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
"""Read and append to a Unity Catalog table on S3 from pandas, through deltalake.

docker compose up -d --wait        # from the page folder
AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run snippets/pandas_tables.py
"""

import asyncio
import os
import sys

# --8<-- [start:connect]
import pandas as pd
from deltalake import DeltaTable, write_deltalake

UNITY = {
    "unity_workspace_url": "http://localhost:8080",
    "unity_access_token": "not-used",
    "unity_allow_http_url": "true",
}
# --8<-- [end:connect]

from _seed import S3_ROOT_KEYS, seed_orders  # noqa: E402


def main() -> None:
    # --8<-- [start:read]
    orders = DeltaTable("uc://retail.sales.orders", storage_options=UNITY).to_pandas()
    print(orders[orders["amount"] > 5])
    # --8<-- [end:read]
    assert len(orders) == 3

    # --8<-- [start:append]
    new_orders = pd.DataFrame(
        {"order_id": [4], "customer": ["margaret"], "amount": [12.0]}
    )
    write_deltalake(
        "uc://retail.sales.orders", new_orders, mode="append", storage_options=UNITY
    )
    # --8<-- [end:append]
    assert (
        len(DeltaTable("uc://retail.sales.orders", storage_options=UNITY).to_pandas())
        == 4
    )


if __name__ == "__main__":
    asyncio.run(seed_orders("s3://uc-docs/retail/orders", S3_ROOT_KEYS))
    main()
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
