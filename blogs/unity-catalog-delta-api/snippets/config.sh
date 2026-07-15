#!/usr/bin/env bash
# config.sh — GET /delta/v1/config against a local UC, as a captured transcript.
#
# The curl counterpart to config_check.py: it shows the Delta-native surface on
# the wire. Capture the real response into the draft (the "money shot"); do not
# hand-write it.
#
# Run:      export UC_URL=http://localhost:8080   # the REST API port (see compose.yaml)
#           export UC_CATALOG=unity          # the default seed catalog in OSS UC
#           ./config.sh
# Needs:    a local server (see compose.yaml — `docker compose up -d`).
# Verified: unitycatalog v0.5.0 (docker image :v0.5.0), 2026-07-10 — HTTP 200,
#           returns the 12-endpoint list + "protocol-version":"1.0".
set -euo pipefail

: "${UC_URL:?export UC_URL first, e.g. http://localhost:8080}"
: "${UC_CATALOG:=unity}"

# -sS: quiet but still show errors. --fail-with-body: non-2xx exits non-zero and
# still prints the server's error JSON, so a copy-paste fails loudly.
# `catalog` is mandatory — config is negotiated per catalog.
curl -sS --fail-with-body \
  "${UC_URL%/}/api/2.1/unity-catalog/delta/v1/config?catalog=${UC_CATALOG}&protocol-versions=1.0"
