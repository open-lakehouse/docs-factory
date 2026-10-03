#!/usr/bin/env bash
# Give a catalog and a schema S3 storage roots with the uc CLI and see where managed data lands.
#
# The CLI equivalents of managed_storage.py; managed_storage_cli.py runs each region.

# --8<-- [start:setup]
uc() { docker compose exec -T unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:prep]
uc catalog delete --name sales --force true || true
uc external_location delete --name lake --force true || true
uc credential delete --name lake_storage --force true || true
# --8<-- [end:prep]

# --8<-- [start:location]
uc credential create --name lake_storage \
  --aws_iam_role_arn arn:aws:iam::123456789012:role/uc-storage-lake
uc external_location create --name lake \
  --url s3://uc-docs/lake --credential_name lake_storage
# --8<-- [end:location]

# --8<-- [start:catalog-root]
uc catalog create --name sales \
  --storage_root s3://uc-docs/lake/sales \
  --output jsonPretty
# --8<-- [end:catalog-root]

# --8<-- [start:schema-root]
uc schema create --catalog sales --name raw
uc schema create --catalog sales --name curated \
  --storage_root s3://uc-docs/lake/curated \
  --output jsonPretty
# --8<-- [end:schema-root]

# --8<-- [start:managed-volume]
uc volume create --full_name sales.raw.drops --volume_type MANAGED --output jsonPretty
uc volume create --full_name sales.curated.reports --volume_type MANAGED --output jsonPretty
# --8<-- [end:managed-volume]

# --8<-- [start:reserved-prefix]
uc volume create --full_name sales.raw.sneaky --volume_type EXTERNAL \
  --storage_location s3://uc-docs/lake/sales/__unitystorage/sneaky
# --8<-- [end:reserved-prefix]

# --8<-- [start:clean-up]
uc catalog delete --name sales --force true
# --8<-- [end:clean-up]
