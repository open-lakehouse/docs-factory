#!/usr/bin/env bash
# Run the local server on PostgreSQL and check that its metadata survives.
#
# Run it from uc-docs-env/unitycatalog: it starts the PostgreSQL variant of the
# docs' local server itself, then runs every step in order.

# --8<-- [start:setup]
uc() { docker exec unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:start-server]
docker compose -f compose.postgres.yaml up -d --wait
# --8<-- [end:start-server]

# --8<-- [start:create-catalog]
uc catalog create --name persisted --comment "Survives a new server container"
# --8<-- [end:create-catalog]

# --8<-- [start:recreate-server]
docker compose -f compose.postgres.yaml up -d --wait --force-recreate unitycatalog
uc catalog get --name persisted --output jsonPretty
# --8<-- [end:recreate-server]

# --8<-- [start:inspect]
docker compose -f compose.postgres.yaml exec postgres \
  psql -U uc -d ucdb -c 'SELECT name, comment FROM uc_catalogs'
# --8<-- [end:inspect]

# --8<-- [start:backup]
docker compose -f compose.postgres.yaml exec postgres \
  pg_dump -U uc ucdb > uc-metadata.sql
# --8<-- [end:backup]

# --8<-- [start:reset]
docker compose -f compose.postgres.yaml down -v
# --8<-- [end:reset]
