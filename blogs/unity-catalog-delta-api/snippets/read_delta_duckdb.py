# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "duckdb>=1.5.4",
# ]
# ///
# read_delta_duckdb.py — read a UC MANAGED Delta table from DuckDB, through the
# same UC Delta API that Delta-Spark uses. This is the "any Delta engine" payoff:
# a *different* engine reads the table `read_write_delta_spark.py` wrote, with no
# cloud storage and no credentials — cross-engine interop over one catalog.
#
# Read path only. DuckDB's UC write support exists in nightly but is out of scope
# here; the point is that DuckDB READS the Spark-written table via /delta/v1/...
#
# Run:      docker compose up -d                 # local UC (see compose.yaml)
#           uv run read_write_delta_spark.py      # first: create + write `events`
#           uv run read_delta_duckdb.py           # then: read it back from DuckDB
# Needs:    - DuckDB >= 1.5.4 (pinned below): the unity_catalog extension and its
#             ATTACH/SECRET syntax stabilized in the 1.5.x line.
#           - network access on first run: installs `delta` (core repo) and
#             `unity_catalog` (core_nightly). The unity_catalog extension is still
#             in active development, so it is UNPINNED (core_nightly), unlike the
#             version-pinned deps elsewhere in these snippets — expect it to move.
#           - the `events` table already created by read_write_delta_spark.py, and
#             UC's vended file:///tmp/uc-data paths readable on this host (the
#             compose bind-mounts /tmp/uc-data 1:1, so they are).
#           Env (defaults shown): export UC_URL=http://localhost:8080  # REST API port
#                                 export UC_CATALOG=unity
# Verified: GREEN end-to-end against UC v0.5.0 (:8080), DuckDB 1.5.4 +
#           unity_catalog@core_nightly (build fd85147), 2026-07-13. SELECT returns
#           [(1, 'alpha'), (2, 'beta')] — the Spark-written table, read from a
#           different engine over one catalog, no cloud creds. The extension
#           installs + loads, CREATE SECRET / ATTACH are accepted, and it calls the
#           classic catalog API (GET /schemas 200, GET /tables 200) AND now parses
#           the /tables response cleanly.
#           HISTORY: an earlier nightly (build e37b1b4, 2026-07-10) failed here with
#             IO Error: Invalid field found while parsing field: type_precision
#           — UC 0.5 emits a `type_precision` field (NULL for Spark-created columns)
#           that the extension's response model did not yet recognize. That upstream
#           version skew is now fixed in core_nightly; the field is still emitted,
#           the extension just tolerates it.
#           One thing the code bakes in: install `delta` from the CORE repo — it is
#           NOT in core_nightly (404) — and `unity_catalog` from core_nightly.
# --8<-- [start:full]
# --8<-- [start:install]
import os

import duckdb

uc_url = os.environ.get("UC_URL", "http://localhost:8080").rstrip("/")
catalog = os.environ.get("UC_CATALOG", "unity")

con = duckdb.connect()

con.execute("INSTALL delta")
con.execute("LOAD delta")
# Switch to a regular install once the updated extension is released.
con.execute("FORCE INSTALL unity_catalog FROM core_nightly")
con.execute("LOAD unity_catalog")
# --8<-- [end:install]

# --8<-- [start:attach]
# A UC secret carries the endpoint + token. Local OSS UC runs with authorization
# disabled, so the token is present-but-ignored ('not-used'); a hosted UC would
# use a real PAT.
con.execute(
    "CREATE SECRET (TYPE unity_catalog, TOKEN 'not-used', ENDPOINT $endpoint)",
    {"endpoint": uc_url},
)

# ATTACH the UC catalog; DEFAULT_SCHEMA lets us read `events` unqualified below.
con.execute(
    f"ATTACH '{catalog}' AS {catalog} (TYPE unity_catalog, DEFAULT_SCHEMA 'default')"
)
# --8<-- [end:attach]

# --8<-- [start:read]
con.sql(f"SELECT * FROM {catalog}.default.events ORDER BY id").fetchall()
# --8<-- [end:read]
# --8<-- [end:full]
