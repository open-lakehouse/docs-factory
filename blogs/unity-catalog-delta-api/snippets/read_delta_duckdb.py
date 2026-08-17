# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "duckdb>=1.5.4",
# ]
# ///
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
con.execute(
    """
    CREATE SECRET (
        TYPE unity_catalog,
        TOKEN 'not-used',
        ENDPOINT $endpoint
    )
    """,
    {"endpoint": uc_url},
)

# ATTACH the UC catalog; DEFAULT_SCHEMA lets us read `events` unqualified below.
con.execute(
    f"ATTACH '{catalog}' AS {catalog} (TYPE unity_catalog, DEFAULT_SCHEMA 'default')"
)
# --8<-- [end:attach]

# --8<-- [start:read]
con.sql("SELECT * FROM events ORDER BY id").fetchall()
# --8<-- [end:read]
# --8<-- [end:full]
