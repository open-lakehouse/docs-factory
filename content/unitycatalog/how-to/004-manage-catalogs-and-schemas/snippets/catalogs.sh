#!/usr/bin/env bash
# Create, inspect, update, and delete a catalog and a schema with the uc CLI.
#
# The CLI equivalents of catalogs.py, one region per task on the page.
# catalogs_cli.py runs them in order and checks the server state.

# --8<-- [start:setup]
uc() { docker compose exec -T unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:create-catalog]
uc catalog create --name retail \
  --comment "Order and customer data for the retail team" \
  --properties '{"owner_team": "retail-analytics"}'
# --8<-- [end:create-catalog]

# --8<-- [start:view-catalogs]
uc catalog list --output jsonPretty
uc catalog get --name retail --output jsonPretty
# --8<-- [end:view-catalogs]

# --8<-- [start:update-catalog]
uc catalog update --name retail \
  --comment "Curated retail data" \
  --properties '{"owner_team": "retail-analytics", "tier": "gold"}'
# --8<-- [end:update-catalog]

# --8<-- [start:create-schema]
uc schema create --catalog retail --name staging --comment "Raw order extracts"
# --8<-- [end:create-schema]

# --8<-- [start:view-schemas]
uc schema list --catalog retail --output jsonPretty
uc schema get --full_name retail.staging --output jsonPretty
# --8<-- [end:view-schemas]

# --8<-- [start:update-schema]
uc schema update --full_name retail.staging --new_name sales --comment "Cleaned order data"
# --8<-- [end:update-schema]

# --8<-- [start:delete-nonempty]
uc catalog delete --name retail
# --8<-- [end:delete-nonempty]

# --8<-- [start:delete-inward]
uc schema delete --full_name retail.sales
uc catalog delete --name retail
# --8<-- [end:delete-inward]

# --8<-- [start:delete-force]
uc catalog delete --name retail --force true
# --8<-- [end:delete-force]
