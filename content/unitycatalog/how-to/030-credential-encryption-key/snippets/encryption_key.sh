#!/usr/bin/env bash
# Encrypt the secrets of s3_compatible storage credentials with a key of your
# own, then move them to a new key. Each region is one step of the page.

# --8<-- [start:generate]
openssl rand -base64 32 > credential-key
chmod 600 credential-key
# --8<-- [end:generate]

# --8<-- [start:start]
export UC_SERVER_S3_COMPATIBLE_STORAGE_ENABLED=true
export UC_SERVER_CREDENTIAL_ENCRYPTION_KEY="$(cat credential-key)"
cd uc-server
jbang io.unitycatalog:unitycatalog-server:0.7.0 --port 8080
# --8<-- [end:start]

# --8<-- [start:create]
curl -s -X POST http://localhost:8080/api/2.1/unity-catalog/credentials \
  -H 'Content-Type: application/json' -d "{
    \"name\": \"lake-storage\", \"purpose\": \"STORAGE\",
    \"s3_compatible_access_key\": {
      \"access_key_id\": \"$S3_ACCESS_KEY_ID\",
      \"secret_access_key\": \"$S3_SECRET_ACCESS_KEY\"}}"
# --8<-- [end:create]

# --8<-- [start:rotate]
mv credential-key credential-key.old
openssl rand -base64 32 > credential-key
chmod 600 credential-key
# --8<-- [end:rotate]

# --8<-- [start:unreadable]
grep 'Cannot read the stored secret' uc-server/etc/logs/server.log
# --8<-- [end:unreadable]

# --8<-- [start:resupply]
curl -s -X PATCH http://localhost:8080/api/2.1/unity-catalog/credentials/lake-storage \
  -H 'Content-Type: application/json' -d "{
    \"s3_compatible_access_key\": {
      \"access_key_id\": \"$S3_ACCESS_KEY_ID\",
      \"secret_access_key\": \"$S3_SECRET_ACCESS_KEY\"}}"
# --8<-- [end:resupply]
