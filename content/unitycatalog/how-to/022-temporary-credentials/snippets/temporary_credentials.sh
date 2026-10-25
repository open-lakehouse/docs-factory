#!/usr/bin/env bash
# Request temporary S3 credentials from the Unity Catalog REST API with curl and jq.
#
# The REST equivalents of temporary_credentials.py. Run that script first: it
# creates the table, volume, and model version these requests name.

# --8<-- [start:setup]
UC=http://localhost:8080/api/2.1/unity-catalog
# --8<-- [end:setup]

# --8<-- [start:table]
TABLE_ID=$(curl -s "$UC/tables/analytics.ops.trips" | jq -r .table_id)
curl -s -X POST "$UC/temporary-table-credentials" \
  -H 'Content-Type: application/json' \
  -d "{\"table_id\": \"$TABLE_ID\", \"operation\": \"READ\"}"
# --8<-- [end:table]

# --8<-- [start:volume]
VOLUME_ID=$(curl -s "$UC/volumes/analytics.ops.files" | jq -r .volume_id)
curl -s -X POST "$UC/temporary-volume-credentials" \
  -H 'Content-Type: application/json' \
  -d "{\"volume_id\": \"$VOLUME_ID\", \"operation\": \"WRITE_VOLUME\"}"
# --8<-- [end:volume]

# --8<-- [start:model-version]
curl -s -X POST "$UC/temporary-model-version-credentials" \
  -H 'Content-Type: application/json' \
  -d '{"catalog_name": "analytics", "schema_name": "ops", "model_name": "churn",
       "version": 1, "operation": "READ_MODEL_VERSION"}'
# --8<-- [end:model-version]

# --8<-- [start:path]
curl -s -X POST "$UC/temporary-path-credentials" \
  -H 'Content-Type: application/json' \
  -d '{"url": "s3://amzn-s3-demo-bucket/lake/landing", "operation": "PATH_READ_WRITE"}'
# --8<-- [end:path]
