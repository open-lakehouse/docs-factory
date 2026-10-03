#!/usr/bin/env bash
# CLI equivalents of external_table.py; external_table_cli.py runs each region.

# --8<-- [start:setup]
uc() { docker compose exec -T unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:prep]
uc catalog delete --name retail --force true || true
uc catalog create --name retail
uc schema create --catalog retail --name sales
# --8<-- [end:prep]

# --8<-- [start:register]
uc table create --full_name retail.sales.orders \
  --columns "order_id LONG, customer STRING, amount DOUBLE" \
  --format DELTA \
  --storage_location "file://${UC_DOCS_ROOT:-/tmp/uc-docs}/orders"
# --8<-- [end:register]

# --8<-- [start:view]
uc table get --full_name retail.sales.orders --output jsonPretty
uc table list --catalog retail --schema sales --output jsonPretty
# --8<-- [end:view]

# --8<-- [start:read]
uc table read --full_name retail.sales.orders --max_results 10
# --8<-- [end:read]

# --8<-- [start:drop]
uc table delete --full_name retail.sales.orders
# --8<-- [end:drop]
