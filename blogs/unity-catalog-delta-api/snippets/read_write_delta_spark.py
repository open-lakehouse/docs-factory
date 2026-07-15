# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pyspark==4.1.0",
# ]
# ///
# read_write_delta_spark.py — the lead example: create, write, and read a UC
# MANAGED Delta table through Delta-Spark, entirely on the local filesystem —
# no cloud storage, no credentials. Delta-Spark drives the new UC Delta API
# under the hood (staging -> promote -> commit -> load, all via /delta/v1/...).
#
# Point your engine at UC and it just works. See config.sh / config_check.py for
# the raw protocol underneath.
#
# Run:      docker compose up -d          # local UC, managed tables in /tmp/uc-data
#           uv run read_write_delta_spark.py
# Needs:    - a JVM (Java 17);
#           - the local-managed UC server (managed tables land in
#             file:///tmp/uc-data, mounted 1:1 so the host can read it);
#           - network access to Maven on first run: Spark downloads the UC + Delta
#             jars via --packages. Behind a proxy, set MAVEN_REPO (Maven mirror)
#             and UV_INDEX_URL (PyPI mirror) — see brief.md §9.
#           Env (defaults shown): export UC_URL=http://localhost:8080  # REST API port
#                                 export UC_CATALOG=unity
#                                 export MAVEN_REPO=            # optional Maven mirror
# Verified: unitycatalog v0.5.0 (docker :v0.5.0), 2026-07-10 — end-to-end
#           create->insert->select of a MANAGED Delta table on the local FS, no
#           cloud. Data landed under /tmp/uc-data; SELECT returned (1,'alpha'),
#           (2,'beta') via the UC Delta API. Stack: PySpark 4.1.0 +
#           unitycatalog-spark_4.1_2.13:0.5.0 + delta-spark_4.1_2.13:4.3.0.
#           (A benign reportMetrics 404 may be logged after the commit — optional
#           telemetry, it does not affect the create/write/read.)
# --8<-- [start:full]
# --8<-- [start:session]
import os

from pyspark.sql import SparkSession

uc_url = os.environ.get("UC_URL", "http://localhost:8080").rstrip("/")
catalog = os.environ.get("UC_CATALOG", "unity")

UC_SPARK = "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.5.0"
DELTA_SPARK = "io.delta:delta-spark_4.1_2.13:4.3.0"
# Juist in case we are behind a proxy.
repositories = os.environ.get("MAVEN_REPO", "")

spark = (
    SparkSession.builder.appName("uc-delta-api-local")
    .config("spark.jars.packages", f"{UC_SPARK},{DELTA_SPARK}")
    .config("spark.jars.repositories", repositories)
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config(
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    )
    .config(f"spark.sql.catalog.{catalog}", "io.unitycatalog.spark.UCSingleCatalog")
    .config(f"spark.sql.catalog.{catalog}.uri", uc_url)
    # Local OSS UC runs with authorization disabled, so any token works; a hosted
    # UC would negotiate OAuth (see the storage post for that builder).
    .config(f"spark.sql.catalog.{catalog}.token", os.environ.get("UC_TOKEN", ""))
    .config("spark.sql.defaultCatalog", catalog)
    .getOrCreate()
)
spark.sparkContext.setLogLevel("WARN")
# --8<-- [end:session]

# --8<-- [start:create]
# UC managed tables require the `catalogManaged` table feature
spark.sql(
    f"CREATE TABLE IF NOT EXISTS {catalog}.default.events (id BIGINT, name STRING) "
    f"USING DELTA TBLPROPERTIES ('delta.feature.catalogManaged' = 'supported')"
)
spark.sql(f"INSERT INTO {catalog}.default.events VALUES (1, 'alpha'), (2, 'beta')")
# --8<-- [end:create]

# --8<-- [start:read]
spark.sql(f"SELECT * FROM {catalog}.default.events ORDER BY id").show()

spark.stop()
# --8<-- [end:read]
# --8<-- [end:full]
