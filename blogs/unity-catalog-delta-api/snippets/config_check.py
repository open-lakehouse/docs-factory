# /// script
# requires-python = ">=3.12"
# dependencies = ["requests==2.32.3"]
# ///
# config_check.py — discover the UC Delta API surface (GET /delta/v1/config).
#
# The first request a Delta client makes: the server advertises its supported
# endpoints and negotiates a protocol version. This is the minimal, pure-uv
# example — no JVM, no cloud — so it doubles as the copy-and-run template.
#
# Run:      uv run config_check.py
# Needs:    UC_URL exported (a local server via `docker compose up -d`), e.g.
#             export UC_URL=http://localhost:8080   # the REST API port (see compose.yaml)
#             export UC_CATALOG=unity   # the default seed catalog in OSS UC
# Verified: unitycatalog v0.5.0 (docker image :v0.5.0), 2026-07-03 — HTTP 200,
#           returns the 12-endpoint list + "protocol-version":"1.0".
import os

import requests

base = os.environ["UC_URL"].rstrip("/")
resp = requests.get(
    f"{base}/api/2.1/unity-catalog/delta/v1/config",
    # `catalog` is mandatory (config is negotiated per catalog); the client also
    # tells the server which protocol versions it supports, and the server
    # replies with the endpoint set for the highest version both can speak.
    params={
        "catalog": os.environ.get("UC_CATALOG", "unity"),
        "protocol-versions": "1.0",
    },
    timeout=10,
)
resp.raise_for_status()
print(resp.json())
