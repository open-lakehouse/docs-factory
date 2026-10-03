#!/usr/bin/env bash
# Create a catalog, schema, and table with the uc CLI, write and read rows, then clean up.
#
# first_catalog_cli.py runs one region per step in order and checks the server
# state after each one.

# --8<-- [start:setup]
uc() { docker compose exec -T unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:browse]
uc catalog list --output jsonPretty
uc schema list --catalog unity --output jsonPretty
uc table list --catalog unity --schema default --output jsonPretty
# --8<-- [end:browse]

# --8<-- [start:sample-rows]
uc table read --full_name unity.default.numbers --max_results 5
# --8<-- [end:sample-rows]

# --8<-- [start:create-catalog]
uc catalog create --name quickstart --comment "My first catalog"
# --8<-- [end:create-catalog]

# --8<-- [start:create-schema]
uc schema create --catalog quickstart --name sales --comment "Order data"
# --8<-- [end:create-schema]

# --8<-- [start:create-table]
uc table create --full_name quickstart.sales.orders \
  --columns "order_id INT, customer STRING, amount DOUBLE" \
  --format DELTA \
  --storage_location file:///tmp/uc/orders
# --8<-- [end:create-table]

# --8<-- [start:write-rows]
uc table write --full_name quickstart.sales.orders
# --8<-- [end:write-rows]

# --8<-- [start:read-rows]
uc table read --full_name quickstart.sales.orders --max_results 5
# --8<-- [end:read-rows]

# --8<-- [start:clean-up]
uc catalog delete --name quickstart --force true
# --8<-- [end:clean-up]
