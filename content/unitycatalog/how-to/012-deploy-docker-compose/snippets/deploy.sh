#!/usr/bin/env bash
# Run a persistent Unity Catalog server with Docker Compose.
#
# Run it from the folder that holds compose.yaml and server.properties.

# --8<-- [start:setup]
uc() { docker compose exec unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:write-env]
printf 'UC_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
chmod 600 .env
# --8<-- [end:write-env]

# --8<-- [start:start]
docker compose up -d --wait
# --8<-- [end:start]

# --8<-- [start:check]
docker compose ps
docker compose exec unitycatalog wget -q -O - http://localhost:8090/readyz
curl -fsS http://localhost:8080/api/2.1/unity-catalog/catalogs
# --8<-- [end:check]

# --8<-- [start:create-catalog]
uc catalog create --name analytics --comment "Kept across restarts"
# --8<-- [end:create-catalog]

# --8<-- [start:restart]
docker compose down
docker compose up -d --wait
uc catalog get --name analytics --output jsonPretty
# --8<-- [end:restart]

# --8<-- [start:backup]
docker compose exec -T postgres pg_dump -U unitycatalog unitycatalog > uc-metadata.sql
docker compose cp unitycatalog:/home/unitycatalog/etc/conf ./uc-conf-backup
# --8<-- [end:backup]

# --8<-- [start:upgrade]
docker compose up -d --wait
# --8<-- [end:upgrade]

# --8<-- [start:remove]
docker compose down -v
# --8<-- [end:remove]
