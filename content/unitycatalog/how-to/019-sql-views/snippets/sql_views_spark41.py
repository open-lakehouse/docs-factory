# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# # The page shows no Spark 4.1 code, so only the failures are claims: a claim
# # that a journey works names a region the page shows. The reads and the
# # SHOW TABLES listing are asserted below and pinned by R01's Spark 4.1 row.
# claims.spark-sql = [
#   { journey = "view.create", anchor = "create-a-view", fails = "[MISSING_CATALOG_ABILITY.VIEWS] Catalog samples does not support views." },
#   { journey = "view.replace", anchor = "change-or-rename-a-view", fails = "[MISSING_CATALOG_ABILITY.VIEWS] Catalog samples does not support views." },
#   { journey = "view.rename", anchor = "change-or-rename-a-view", fails = "Cannot rename a table with ALTER VIEW. Please use ALTER TABLE instead." },
#   { journey = "view.drop", anchor = "drop-a-view", fails = "[UNSUPPORTED_FEATURE.CATALOG_OPERATION] The feature is not supported: Catalog `samples` does not support views." },
# ]
# ///
"""Compatibility evidence: Spark 4.1 reads Unity Catalog views but can't
create, change, or drop them. The page shows no code from this script.

Start the docs' local server from `uc-docs-env/unitycatalog`, and seed the
TPC-H sample into it (`samples.tpch`):

    docker compose up -d --wait

Then run this script beside `register_view.py` and `sql_views.py`. It first
registers `samples.tpch.orders_by_status` the way `register_view.py` does,
and creates `samples.tpch.customer_orders` with Spark 4.2 the way
`sql_views.py` does:

    uv run sql_views_spark41.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# ruff: noqa: E402
# The regions import what they use, after the hidden setup above them.

import ast
import asyncio
import os
import re
import subprocess
import textwrap
from pathlib import Path

from unitycatalog.client import ApiClient, Configuration, TablesApi
from unitycatalog.client.exceptions import NotFoundException

HERE = Path(__file__).resolve().parent
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
SEED = HERE.parents[1] / "003-seed-tpch-data" / "seed_tpch.py"
subprocess.run(
    ["uv", "run", "-q", str(SEED)],
    check=True,
    env={**os.environ, "TPCH_STORAGE_ROOT": f"{DOCS_ROOT}/tpch"},
)
CONFIG = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
VIEWS = ("orders_by_status", "customer_orders")


def region(script: str, name: str) -> str:
    """The code the page shows from a sibling script's region."""
    text = (HERE / script).read_text()
    found = re.search(
        rf"# --8<-- \[start:{name}\]\n(.*?)# --8<-- \[end:{name}\]", text, re.S
    )
    assert found, (script, name)
    return textwrap.dedent(found.group(1))


async def _register() -> None:
    """Run the page's REST registration step as the reader enters it in
    `python -m asyncio`, with top-level await."""
    scope: dict = {}
    code = compile(
        region("register_view.py", "register"),
        "register_view.py",
        "exec",
        flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT,
    )
    await eval(code, scope)
    await scope["api"].close()


async def _delete() -> None:
    async with ApiClient(CONFIG) as api:
        for name in VIEWS:
            try:
                await TablesApi(api).delete_table(f"samples.tpch.{name}")
            except NotFoundException:
                pass


asyncio.run(_delete())

# The page registers this view in "Register a view through the REST API" before
# this section, so run exactly that step.
asyncio.run(_register())

# The view the page's Spark 4.2 sections leave behind: created, then changed
# by dropping and creating it again. Run those steps with Spark 4.2.
subprocess.run(
    ["uv", "run", "-q", "--no-project", "--with", "pyspark==4.2.0", "python", "-"],
    input="".join(region("sql_views.py", r) for r in ("session", "create", "change"))
    + "spark.stop()\n",
    text=True,
    check=True,
)

from pyspark.sql import SparkSession

spark = (
    SparkSession.builder.appName("sql-views-spark-4.1")
    .config(
        "spark.jars.packages",
        "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0,"
        "io.delta:delta-spark_4.1_2.13:4.3.1",
    )
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config(
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    )
    .config("spark.sql.catalog.samples", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.samples.uri", "http://localhost:8080")
    .config("spark.sql.catalog.samples.auth.type", "static")
    .config("spark.sql.catalog.samples.auth.token", "not-used")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("ERROR")

spark.sql("SELECT * FROM samples.tpch.orders_by_status ORDER BY o_orderstatus").show()
got = spark.sql("SELECT * FROM samples.tpch.orders_by_status ORDER BY 1").collect()
want = spark.sql("""
    SELECT o_orderstatus, COUNT(*), SUM(o_totalprice) FROM samples.tpch.orders
    GROUP BY o_orderstatus ORDER BY 1
""").collect()
assert len(got) == 3 and [tuple(r) for r in got] == [tuple(r) for r in want], (
    got,
    want,
)
assert spark.table("samples.tpch.orders_by_status").columns == [
    "o_orderstatus",
    "orders",
    "revenue",
]

# Spark 4.1 also reads the view Spark 4.2 created.
segments = spark.sql("""
    SELECT nation, COUNT(*) FROM samples.tpch.customer_orders GROUP BY 1 ORDER BY 1
""").collect()
want_segments = spark.sql("""
    SELECT n.n_name, COUNT(*)
    FROM samples.tpch.orders o
    JOIN samples.tpch.customer c ON o.o_custkey = c.c_custkey
    JOIN samples.tpch.nation n ON c.c_nationkey = n.n_nationkey
    GROUP BY 1 ORDER BY 1
""").collect()
assert len(segments) == 25 and [tuple(r) for r in segments] == [
    tuple(r) for r in want_segments
], (segments, want_segments)

spark.sql("SHOW TABLES IN samples.tpch").show()
tables = {r.tableName for r in spark.sql("SHOW TABLES IN samples.tpch").collect()}
assert {"orders_by_status", "customer_orders", "orders"} <= tables, tables

described = dict(
    spark.sql("DESCRIBE EXTENDED samples.tpch.orders_by_status")
    .select("col_name", "data_type")
    .collect()
)
assert described["Table_type"] == "VIEW", described
assert described["orders"] == "bigint", described
assert "View Text" not in described, described

# Spark 4.1 lists views only through SHOW TABLES, and can't create,
# replace, rename, alter, or drop them.
no_views = "[MISSING_CATALOG_ABILITY.VIEWS] Catalog samples does not support views."
unsupported = "[UNSUPPORTED_FEATURE.CATALOG_OPERATION] The feature is not supported: Catalog `samples` does not support views."
for statement, error in [
    ("SHOW VIEWS IN samples.tpch", no_views),
    (
        "CREATE VIEW samples.tpch.big_orders"
        " AS SELECT o_orderkey FROM samples.tpch.orders WHERE o_totalprice > 400000",
        no_views,
    ),
    (
        "CREATE OR REPLACE VIEW samples.tpch.orders_by_status"
        " AS SELECT o_orderkey FROM samples.tpch.orders",
        no_views,
    ),
    (
        "ALTER VIEW samples.tpch.orders_by_status AS SELECT 1 AS x",
        unsupported,
    ),
    (
        "ALTER VIEW samples.tpch.orders_by_status RENAME TO samples.tpch.by_status",
        "Cannot rename a table with ALTER VIEW. Please use ALTER TABLE instead.",
    ),
    ("DROP VIEW samples.tpch.orders_by_status", unsupported),
    ("DROP VIEW IF EXISTS samples.tpch.orders_by_status", unsupported),
]:
    try:
        spark.sql(statement)
    except Exception as exc:
        assert error in str(exc), (error, exc)
    else:
        raise AssertionError(f"expected {error!r}: {statement[:60]}")
# Nothing above changed the view.
assert spark.sql("SELECT COUNT(*) FROM samples.tpch.orders_by_status").first()[0] == 3

spark.stop()
asyncio.run(_delete())
