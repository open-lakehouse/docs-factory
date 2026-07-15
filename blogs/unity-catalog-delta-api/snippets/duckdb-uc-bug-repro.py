# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "duckdb>=1.5.4",
# ]
# ///
# duckdb-uc-bug-repro.py — regression check for a parse failure (NOW FIXED) in the
# DuckDB `unity_catalog` extension when reading a table from OSS Unity Catalog 0.5.
#
# STATUS: FIXED as of unity_catalog@core_nightly build fd85147 (re-verified
#   2026-07-13). This script used to reproduce the bug; it now runs green end to
#   end and serves as a regression check. Run it against a fresh core_nightly to
#   confirm the fix still holds.
#
# THE BUG (historical, build e37b1b4 and earlier)
#   After attaching an OSS UC 0.5 catalog, ANY operation that parsed table column
#   metadata — `SHOW ALL TABLES`, `DESCRIBE <t>`, or `SELECT ... FROM <t>` — failed
#   with:
#
#     IO Error: Invalid field found while parsing field: type_precision
#
#   ROOT CAUSE
#     UC 0.5's classic `GET /tables` response carries a full `ColumnInfo` per column,
#     including `type_precision` / `type_scale` (see the sample response at the bottom
#     of this file). For a table created by Delta-Spark, those fields are present but
#     NULL (`"type_precision": null`; a table with a seeded schema reports 0 instead).
#     The extension's column-metadata parser did not accept the `type_precision`
#     field, so it threw while binding the /tables response — before any Delta data
#     file was touched. Listing only *appeared* to work until a table with null
#     type_precision (e.g. a Spark-created one) was present; then even `SHOW ALL
#     TABLES` failed. The field is still emitted by UC 0.5; the fix is that the
#     extension now tolerates it.
#
# ENVIRONMENT (fix verified 2026-07-13; bug last seen 2026-07-10 on build e37b1b4)
#   DuckDB 1.5.4 · unity_catalog extension @ core_nightly, build fd85147
#   Unity Catalog OSS v0.5.0 (docker image unitycatalog/unitycatalog:v0.5.0)
#
# EXTENSION SOURCES — we want the latest development state of BOTH extensions.
#   Availability for DuckDB 1.5.4 / osx_arm64 (checked against the repos directly):
#                     core (stable)    core_nightly
#       unity_catalog     200              200   <- use core_nightly (latest dev)
#       delta             200              404   <- ONLY on core; not in nightly
#   So `unity_catalog` comes from core_nightly, but `delta` is NOT published to
#   core_nightly at all and can only come from `core`. The script below tries
#   core_nightly for delta first (to honor "latest dev state") and falls back to
#   core with a printed note. A genuinely-nightly `delta` would require a nightly
#   DuckDB build whose commit has matching extension binaries — which is not
#   reliably published per commit, so stable DuckDB + core delta is the newest
#   combination that actually installs.
#
# HOW TO REPRODUCE
#   1. Start UC 0.5 with the accompanying compose.yaml + server.properties (both
#      handed over verbatim). They configure managed tables on the local filesystem
#      (storage-root file:///tmp/uc-data, bind-mounted 1:1) with NO cloud creds:
#        mkdir -p /tmp/uc-data && docker compose up -d      # REST API on :8080
#   2. Create a managed Delta table so there is something to read. Either run the
#      accompanying read_write_delta_spark.py (creates `unity.default.events`), or
#      use the seeded `unity.default.marksheet` — BUT note marksheet's storage
#      location is a container-internal path, so reading IT fails with a *different*
#      error (InvalidTableLocationError). Use `events` to hit the type_precision bug
#      on a host-readable table.
#   3. Run this script:  uv run duckdb-uc-bug-repro.py
#      (or, without uv:   pip install 'duckdb>=1.5.4' && python duckdb-uc-bug-repro.py)
#
# EXPECTED (and now ACTUAL, build fd85147): step [3] lists the tables and step [4]
#                        prints [(1, 'alpha'), (2, 'beta')].
# HISTORICAL (build e37b1b4): step [3] raised "Invalid field ... type_precision"
#                        (and so would step [4]).
import os

import duckdb

UC_URL = os.environ.get("UC_URL", "http://localhost:8080").rstrip("/")
CATALOG = os.environ.get("UC_CATALOG", "unity")
TABLE = os.environ.get("UC_TABLE", "events")  # created by read_write_delta_spark.py

con = duckdb.connect()


# [1] Extensions — prefer the latest development state (core_nightly) for both.
#     `unity_catalog` is on core_nightly. `delta` is NOT (404 for stable DuckDB),
#     so we try core_nightly and fall back to core, printing which source won.
def install(ext: str) -> str:
    try:
        con.execute(f"FORCE INSTALL {ext} FROM core_nightly")
        con.execute(f"LOAD {ext}")
        return "core_nightly"
    except duckdb.HTTPException:
        con.execute(f"FORCE INSTALL {ext}")  # fall back to the core (stable) repo
        con.execute(f"LOAD {ext}")
        return "core (core_nightly had no build)"


delta_src = install("delta")
uc_src = install("unity_catalog")
uc_build = con.sql(
    "SELECT extension_version FROM duckdb_extensions() WHERE extension_name = 'unity_catalog'"
).fetchone()[0]
print(f"duckdb {duckdb.__version__}")
print(f"  delta          <- {delta_src}")
print(f"  unity_catalog  <- {uc_src} (build {uc_build})")

# [2] Secret. NOTE: this must be an UNNAMED secret. A *named* secret
#     (CREATE SECRET uc (...)) is not wired into the request base URL in build
#     e37b1b4 — requests then go out host-less and fail with "Could not resolve
#     hostname". That is a SEPARATE bug from the type_precision one below; using an
#     unnamed secret sidesteps it so we can reach the actual failure. Local OSS UC
#     runs with authorization disabled, so the token is present-but-ignored.
con.execute(
    "CREATE SECRET (TYPE unity_catalog, TOKEN 'not-used', ENDPOINT $endpoint)",
    {"endpoint": UC_URL},
)

# [3] Attach, then list tables. SHOW ALL TABLES parses the /tables ColumnInfo;
#     this used to FAIL once a null-type_precision table (e.g. Spark-created
#     `events`) was present, and now succeeds (build fd85147). (On a cold attach
#     the list may momentarily come back empty before the catalog cache warms —
#     that is a benign timing quirk, not the parse bug; step [4]'s read resolves
#     the table regardless. Re-running lists all tables.)
con.execute(
    f"ATTACH '{CATALOG}' AS {CATALOG} (TYPE unity_catalog, DEFAULT_SCHEMA 'default')"
)
print("attach OK; listing tables (parses column metadata) ...")
print("  SHOW ALL TABLES ->", con.sql("SHOW ALL TABLES").fetchall())

# [4] Read the table — also parses the ColumnInfo (previously the same failure).
print(f"reading {CATALOG}.default.{TABLE} ...")
rows = con.sql(f"SELECT * FROM {CATALOG}.default.{TABLE} ORDER BY 1").fetchall()
print("read OK:", rows)  # -> [(1, 'alpha'), (2, 'beta')]

# ---------------------------------------------------------------------------
# For reference, the exact server response the parser chokes on. Fetch it live:
#
#   curl -sS 'http://localhost:8080/api/2.1/unity-catalog/tables?catalog_name=unity&schema_name=default'
#
# The `events` table's columns (Delta-Spark-created) look like this — note the
# NULL type_precision / type_scale, which a table with a real seeded schema
# (e.g. marksheet) instead reports as 0:
#
#   {
#     "name": "events",
#     "columns": [
#       {"name": "id",   "type_name": "LONG",   "type_text": "bigint",
#        "type_precision": null, "type_scale": null},
#       {"name": "name", "type_name": "STRING", "type_text": "string",
#        "type_precision": null, "type_scale": null}
#     ]
#   }
#
# The full ColumnInfo also carries type_text, type_json, type_name,
# type_interval_type, position, comment, nullable, partition_index.
# ---------------------------------------------------------------------------
