#!/usr/bin/env bash
# Register an S3 storage credential and external location with the uc CLI, and check vending.
#
# The CLI equivalents of aws_storage.py; aws_storage_cli.py runs each region.

# --8<-- [start:setup]
uc() { docker compose exec -T unitycatalog bin/uc "$@"; }
UC=http://localhost:8080/api/2.1/unity-catalog
# --8<-- [end:setup]

# --8<-- [start:prep]
uc external_location delete --name lake --force true || true
uc credential delete --name lake_storage --force true || true
# --8<-- [end:prep]

# --8<-- [start:create-credential]
uc credential create --name lake_storage \
  --aws_iam_role_arn arn:aws:iam::123456789012:role/uc-storage-lake \
  --comment "Read/write on s3://uc-docs/lake" \
  --output jsonPretty
# --8<-- [end:create-credential]

# --8<-- [start:create-location]
uc external_location create --name lake \
  --url s3://uc-docs/lake \
  --credential_name lake_storage \
  --output jsonPretty
# --8<-- [end:create-location]

# --8<-- [start:verify]
curl -s -X POST "$UC/temporary-path-credentials" \
  -H 'Content-Type: application/json' \
  -d '{"url": "s3://uc-docs/lake/landing", "operation": "PATH_READ"}'
# --8<-- [end:verify]

# --8<-- [start:view]
uc credential get --name lake_storage --output jsonPretty
uc external_location list --output jsonPretty
# --8<-- [end:view]

# --8<-- [start:update-credential]
uc credential update --name lake_storage \
  --aws_iam_role_arn arn:aws:iam::123456789012:role/uc-storage-lake-v2 \
  --output jsonPretty
# --8<-- [end:update-credential]

# --8<-- [start:update-location]
uc external_location update --name lake \
  --comment "Landing and curated data" \
  --output jsonPretty
# --8<-- [end:update-location]

# --8<-- [start:delete]
uc external_location delete --name lake
uc credential delete --name lake_storage
# --8<-- [end:delete]
