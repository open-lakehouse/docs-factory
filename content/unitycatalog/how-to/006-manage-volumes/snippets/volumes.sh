#!/usr/bin/env bash
# CLI equivalents of volumes.py; volumes_cli.py runs each region.

# --8<-- [start:setup]
uc() { docker compose exec -T unitycatalog bin/uc "$@"; }
ROOT="${UC_DOCS_ROOT:-/tmp/uc-docs}"
# --8<-- [end:setup]

# --8<-- [start:prep]
uc catalog delete --name retail --force true || true
# --8<-- [end:prep]

# --8<-- [start:managed-root]
uc catalog create --name retail
uc schema create --catalog retail --name files --storage_root "file://$ROOT/managed"
# --8<-- [end:managed-root]

# --8<-- [start:create-external]
uc volume create --full_name retail.files.landing \
  --volume_type EXTERNAL \
  --storage_location "file://$ROOT/landing" \
  --comment "Order exports dropped by the partner SFTP job"
# --8<-- [end:create-external]

# --8<-- [start:create-managed]
uc volume create --full_name retail.files.reports --volume_type MANAGED
# --8<-- [end:create-managed]

# --8<-- [start:view]
uc volume list --catalog retail --schema files --output jsonPretty
uc volume get --full_name retail.files.landing --output jsonPretty
# --8<-- [end:view]

# --8<-- [start:list-files]
uc volume read --full_name retail.files.landing
uc volume read --full_name retail.files.landing --path README.txt
# --8<-- [end:list-files]

# --8<-- [start:update]
uc volume update --full_name retail.files.landing \
  --new_name partner_landing \
  --comment "Partner order exports, retained 30 days"
# --8<-- [end:update]

# --8<-- [start:delete]
uc volume delete --full_name retail.files.partner_landing
uc volume delete --full_name retail.files.reports
# --8<-- [end:delete]
