# /// script
# requires-python = ">=3.11"
# dependencies = ["pyiceberg[pyarrow]==0.12.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.aws.yaml"
# services = ["unitycatalog"]
# claims.pyiceberg = [
#   { journey = "iceberg.schema-create", region = "schema", api = "create_namespace" },
#   { journey = "iceberg.create", region = "create", api = "create_table" },
#   { journey = "iceberg.append", region = "write", api = "Table.append" },
#   { journey = "iceberg.read", region = "read", api = "Table.scan" },
#   { journey = "iceberg.update", region = "change", api = "Table.overwrite(overwrite_filter=)" },
#   { journey = "iceberg.delete", region = "change", api = "Table.delete" },
#   { journey = "iceberg.rename", region = "rename", api = "rename_table" },
#   { journey = "iceberg.drop", region = "drop", api = "drop_table" },
# ]
# ///
"""Create, change, and drop an Iceberg table in Unity Catalog from PyIceberg, through Iceberg REST.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose -f compose.aws.yaml up -d --wait

Then run this script, with `_setup.py` from the same page beside it:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run pyiceberg_tables.py
"""

import os
import sys

import _setup  # before pyiceberg, which reads its settings on import

# --8<-- [start:imports]
import pyarrow as pa
from pyiceberg.catalog import load_catalog

# --8<-- [end:imports]

_setup.setup_retail()

# --8<-- [start:connect]
catalog = load_catalog(
    "retail",
    type="rest",
    uri="http://localhost:8080/api/2.1/unity-catalog/iceberg",
    warehouse="retail",
    token="not-used",
)
# --8<-- [end:connect]

# --8<-- [start:schema]
catalog.create_namespace("staging")
print(catalog.list_namespaces())
# --8<-- [end:schema]
assert set(catalog.list_namespaces()) == {("sales",), ("staging",)}

# --8<-- [start:create]
orders_schema = pa.schema(
    [("order_id", pa.int64()), ("customer", pa.string()), ("amount", pa.float64())]
)
orders = catalog.create_table("sales.orders", schema=orders_schema)
# --8<-- [end:create]
info = _setup.table_info("retail.sales.orders")
assert (info["data_source_format"], info["table_type"]) == ("ICEBERG", "MANAGED"), info

# --8<-- [start:write]
orders.append(
    pa.table(
        {
            "order_id": [1, 2, 3],
            "customer": ["ada", "grace", "linus"],
            "amount": [9.5, 20.0, 3.25],
        },
        schema=orders_schema,
    )
)
# --8<-- [end:write]

# --8<-- [start:read]
print(orders.scan(row_filter="amount > 5").to_arrow().sort_by("order_id"))
# --8<-- [end:read]
assert orders.scan().to_arrow().num_rows == 3

# --8<-- [start:change]
orders.delete(delete_filter="customer = 'linus'")
orders.overwrite(
    pa.table(
        {"order_id": [2], "customer": ["grace"], "amount": [21.0]},
        schema=orders_schema,
    ),
    overwrite_filter="order_id = 2",
)
# --8<-- [end:change]
rows = catalog.load_table("sales.orders").scan().to_arrow().sort_by("order_id")
assert rows.to_pylist() == [
    {"order_id": 1, "customer": "ada", "amount": 9.5},
    {"order_id": 2, "customer": "grace", "amount": 21.0},
], rows

# --8<-- [start:rename]
catalog.rename_table("sales.orders", "sales.order_history")
# --8<-- [end:rename]
assert catalog.list_tables("sales") == [("sales", "order_history")]

# --8<-- [start:drop]
catalog.drop_table("sales.order_history")
catalog.drop_namespace("staging")
# --8<-- [end:drop]
assert catalog.list_tables("sales") == []

# pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
# assert has passed by now, so skip the native teardown.
sys.stdout.flush()
os._exit(0)
