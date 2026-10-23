# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.spark = [
#   { journey = "managed.create-as-select", region = "ctas", api = "CREATE TABLE … AS SELECT" },
#   { journey = "managed.replace", region = "replace-table", api = "CREATE OR REPLACE TABLE … AS SELECT" },
#   { journey = "managed.overwrite", region = "overwrite", api = "INSERT OVERWRITE" },
#   { journey = "managed.replace-where", region = "replace-where", api = "INSERT INTO … REPLACE WHERE" },
#   { journey = "managed.overwrite-partitions", region = "dynamic-partitions", api = "partitionOverwriteMode=dynamic" },
# ]
# claims.spark-sql = [
#   { journey = "create.ctas", region = "ctas", api = "CREATE TABLE … AS SELECT", note = "through Unity Catalog" },
#   { journey = "schema.overwrite", region = "replace-table", api = "CREATE OR REPLACE TABLE … AS SELECT", note = "through Unity Catalog" },
#   { journey = "write.overwrite", region = "overwrite", api = "INSERT OVERWRITE", note = "through Unity Catalog" },
#   { journey = "write.replace-where", region = "replace-where", api = "INSERT INTO … REPLACE WHERE", note = "through Unity Catalog" },
#   { journey = "write.dynamic-partitions", region = "dynamic-partitions", api = "partitionOverwriteMode=dynamic", note = "through Unity Catalog" },
#   { journey = "history.restore", region = "restore", api = "RESTORE TABLE", note = "through Unity Catalog" },
# ]
# ///
"""Replace and overwrite a catalog-managed Delta table with Spark SQL.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run replace_overwrite.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import os
from datetime import date

# --8<-- [start:imports]
from pyspark.sql import SparkSession

# --8<-- [end:imports]
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
CONFIG = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")


async def _drop_catalog() -> None:
    async with ApiClient(CONFIG) as api:
        try:
            await CatalogsApi(api).delete_catalog(name="replace_demo", force=True)
        except NotFoundException:
            pass


async def _create_catalog() -> None:
    async with ApiClient(CONFIG) as api:
        await CatalogsApi(api).create_catalog(
            CreateCatalog(
                name="replace_demo", storage_root=f"file://{DOCS_ROOT}/managed"
            )
        )


asyncio.run(_drop_catalog())
asyncio.run(_create_catalog())

# --8<-- [start:session]
spark = (
    SparkSession.builder.appName("replace-orders")
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
    .config("spark.sql.catalog.replace_demo", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.replace_demo.uri", "http://localhost:8080")
    .config("spark.sql.catalog.replace_demo.auth.type", "static")
    .config("spark.sql.catalog.replace_demo.auth.token", "not-used")
    .config("spark.sql.defaultCatalog", "replace_demo")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")
spark.sql("CREATE SCHEMA sales")


def expect_error(sql: str, *fragments: str) -> str:
    """Run `sql`, require it to fail, and require each fragment in the message."""
    try:
        spark.sql(sql)
    except Exception as e:  # noqa: BLE001 - Py4J, Analysis, and Parse errors alike
        message = str(e)
        for fragment in fragments:
            assert fragment in message, (fragment, message)
        return message
    raise AssertionError(f"expected an error from: {sql}")


def identity(table: str) -> tuple[str, str]:
    props = dict(spark.sql(f"SHOW TBLPROPERTIES {table}").collect())
    return props["io.unitycatalog.tableId"], spark.sql(
        f"DESCRIBE DETAIL {table}"
    ).first().location


def history(table: str) -> list[tuple[int, str]]:
    return [
        (r.version, r.operation)
        for r in spark.sql(f"DESCRIBE HISTORY {table}").orderBy("version").collect()
    ]


def rows(table: str) -> list[tuple]:
    return [
        (r.order_id, r.day.isoformat())
        for r in spark.table(table).orderBy("order_id").collect()
    ]


# --8<-- [start:ctas]
spark.sql("""
    CREATE TABLE sales.orders USING DELTA AS
    SELECT * FROM VALUES
        (1, 'ada',   9.50,  DATE'2026-10-01'),
        (2, 'grace', 20.00, DATE'2026-10-01'),
        (3, 'linus', 3.25,  DATE'2026-10-02')
    AS t(order_id, customer, amount, day)
""")
# --8<-- [end:ctas]
props = dict(spark.sql("SHOW TBLPROPERTIES sales.orders").collect())
assert props["delta.feature.catalogManaged"] == "supported", props
table_id, location = identity("sales.orders")
assert location.startswith(f"file:{DOCS_ROOT}/managed/__unitystorage/"), location
assert location.endswith(table_id), (location, table_id)
assert history("sales.orders") == [(0, "CREATE TABLE AS SELECT")]
assert rows("sales.orders") == [(1, "2026-10-01"), (2, "2026-10-01"), (3, "2026-10-02")]
# Columns come from the query; partitioning only from an explicit PARTITIONED BY.
ctas_detail = spark.sql("DESCRIBE DETAIL sales.orders").first()
assert ctas_detail.partitionColumns == [], ctas_detail.partitionColumns
assert spark.table("sales.orders").columns == ["order_id", "customer", "amount", "day"]
# Without USING DELTA, the session's default provider (Parquet) is refused.
expect_error(
    "CREATE TABLE sales.orders_parquet AS SELECT 1 AS order_id",
    "Unity Catalog does not support non-Delta managed table",
)
# CTAS needs a new name.
expect_error(
    "CREATE TABLE sales.orders USING DELTA AS SELECT 1 AS a",
    "TABLE_OR_VIEW_ALREADY_EXISTS",
)

# --8<-- [start:replace-table]
spark.sql("""
    CREATE OR REPLACE TABLE sales.orders USING DELTA
    PARTITIONED BY (day) AS
    SELECT *, amount * 0.20 AS tax FROM sales.orders
""")
# --8<-- [end:replace-table]
assert identity("sales.orders") == (table_id, location)
assert history("sales.orders") == [
    (0, "CREATE TABLE AS SELECT"),
    (1, "CREATE OR REPLACE TABLE AS SELECT"),
]
detail = spark.sql("DESCRIBE DETAIL sales.orders").first()
assert detail.partitionColumns == ["day"], detail.partitionColumns
assert spark.table("sales.orders").columns == [
    "order_id",
    "customer",
    "amount",
    "day",
    "tax",
]
assert rows("sales.orders") == [(1, "2026-10-01"), (2, "2026-10-01"), (3, "2026-10-02")]
# The previous version still reads with its old columns.
assert spark.sql("SELECT * FROM sales.orders VERSION AS OF 0").columns == [
    "order_id",
    "customer",
    "amount",
    "day",
]

# REPLACE TABLE needs an existing table; CREATE OR REPLACE creates one.
expect_error(
    "REPLACE TABLE sales.missing (a INT) USING DELTA", "TABLE_OR_VIEW_NOT_FOUND"
)
expect_error(
    "REPLACE TABLE sales.missing USING DELTA AS SELECT 1 AS a",
    "TABLE_OR_VIEW_NOT_FOUND",
)
# A replacement takes partitioning only from its own PARTITIONED BY.
spark.sql("CREATE TABLE sales.parts (a INT, p INT) USING DELTA PARTITIONED BY (p)")
spark.sql(
    "CREATE OR REPLACE TABLE sales.parts USING DELTA AS SELECT * FROM sales.parts"
)
assert spark.sql("DESCRIBE DETAIL sales.parts").first().partitionColumns == []
spark.sql(
    "CREATE OR REPLACE TABLE sales.parts (a INT, p INT) USING DELTA PARTITIONED BY (p)"
)
spark.sql("REPLACE TABLE sales.parts (a INT, p INT) USING DELTA")
assert spark.sql("DESCRIBE DETAIL sales.parts").first().partitionColumns == []
spark.sql("DROP TABLE sales.parts")

spark.sql("CREATE OR REPLACE TABLE sales.scratch (a INT) USING DELTA")
assert history("sales.scratch") == [(0, "CREATE OR REPLACE TABLE")]
scratch_id = identity("sales.scratch")
spark.sql("INSERT INTO sales.scratch VALUES (1)")
# REPLACE TABLE without a query leaves the table empty, under the same identity.
spark.sql("REPLACE TABLE sales.scratch (a INT, b STRING) USING DELTA")
assert spark.table("sales.scratch").count() == 0
assert identity("sales.scratch") == scratch_id
assert history("sales.scratch")[-1] == (2, "REPLACE TABLE")

# --8<-- [start:overwrite]
spark.sql("""
    INSERT OVERWRITE sales.orders VALUES
        (4, 'ada',   12.00, DATE'2026-10-03', 2.40),
        (5, 'grace', 8.00,  DATE'2026-10-03', 1.60),
        (6, 'linus', 5.00,  DATE'2026-10-04', 1.00)
""")
# --8<-- [end:overwrite]
assert rows("sales.orders") == [(4, "2026-10-03"), (5, "2026-10-03"), (6, "2026-10-04")]
assert history("sales.orders")[-1] == (2, "WRITE")
assert identity("sales.orders") == (table_id, location)
expect_error(
    "INSERT OVERWRITE sales.orders VALUES (7, 'ada')",
    "DELTA_INSERT_COLUMN_ARITY_MISMATCH",
    "target table has 5 column(s) but the inserted data has 2 column(s)",
)
for missing in (
    "INSERT OVERWRITE sales.missing VALUES (1)",
    "INSERT INTO sales.missing REPLACE WHERE a = 1 VALUES (1)",
):
    expect_error(missing, "TABLE_OR_VIEW_NOT_FOUND")

# --8<-- [start:replace-where]
spark.sql("""
    INSERT INTO sales.orders
    REPLACE WHERE day = DATE'2026-10-03'
    VALUES (7, 'ada', 30.00, DATE'2026-10-03', 6.00)
""")
# --8<-- [end:replace-where]
assert rows("sales.orders") == [(6, "2026-10-04"), (7, "2026-10-03")]
assert history("sales.orders")[-1] == (3, "WRITE")
expect_error(
    """INSERT INTO sales.orders REPLACE WHERE day = DATE'2026-10-03'
       VALUES (8, 'ada', 1.00, DATE'2026-10-09', 0.20)""",
    "DELTA_REPLACE_WHERE_MISMATCH",
)
assert history("sales.orders")[-1] == (3, "WRITE")

# --8<-- [start:dynamic-partitions]
spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")
spark.sql("""
    INSERT OVERWRITE sales.orders VALUES
        (8, 'grace', 4.00, DATE'2026-10-04', 0.80)
""")
spark.conf.unset("spark.sql.sources.partitionOverwriteMode")
# --8<-- [end:dynamic-partitions]
assert rows("sales.orders") == [(7, "2026-10-03"), (8, "2026-10-04")]
last = spark.sql("DESCRIBE HISTORY sales.orders").orderBy("version").collect()[-1]
assert (last.version, last.operation) == (4, "WRITE"), last
assert last.operationParameters["isDynamicPartitionOverwrite"] == "true", last

# --8<-- [start:history]
spark.sql("DESCRIBE HISTORY sales.orders").select("version", "operation").show(
    truncate=False
)
# --8<-- [end:history]
assert history("sales.orders") == [
    (0, "CREATE TABLE AS SELECT"),
    (1, "CREATE OR REPLACE TABLE AS SELECT"),
    (2, "WRITE"),
    (3, "WRITE"),
    (4, "WRITE"),
]
params = {
    r.version: r.operationParameters
    for r in spark.sql("DESCRIBE HISTORY sales.orders").collect()
}
assert params[2]["mode"] == "Overwrite", params[2]
assert "predicate" in params[3], params[3]
assert params[4]["isDynamicPartitionOverwrite"] == "true", params[4]

# --8<-- [start:version-as-of]
spark.sql(
    "SELECT order_id, day FROM sales.orders VERSION AS OF 3 ORDER BY order_id"
).show()
# --8<-- [end:version-as-of]
assert [
    (r.order_id, r.day)
    for r in spark.sql(
        "SELECT order_id, day FROM sales.orders VERSION AS OF 3 ORDER BY order_id"
    ).collect()
] == [(6, date(2026, 10, 4)), (7, date(2026, 10, 3))]

# --8<-- [start:restore]
spark.sql("RESTORE TABLE sales.orders TO VERSION AS OF 3")
# --8<-- [end:restore]
assert rows("sales.orders") == [(6, "2026-10-04"), (7, "2026-10-03")]
assert history("sales.orders")[-1] == (5, "RESTORE")
assert identity("sales.orders") == (table_id, location)

# What a replacement can't change. Each attempt fails and leaves the table as it was.
expect_error(
    "CREATE OR REPLACE TABLE sales.orders USING PARQUET AS SELECT * FROM sales.orders",
    "Cannot change table format from DELTA to PARQUET",
)
expect_error(
    f"""CREATE OR REPLACE TABLE sales.orders USING DELTA
        LOCATION 'file://{DOCS_ROOT}/elsewhere' AS SELECT * FROM sales.orders""",
    "cannot specify 'location' or 'external': only catalog-managed Delta tables "
    "can be replaced on this path",
)
expect_error(
    """CREATE OR REPLACE TABLE sales.orders USING DELTA
       TBLPROPERTIES ('io.unitycatalog.tableId' = 'abc') AS SELECT * FROM sales.orders""",
    "cannot specify catalog-managed property 'io.unitycatalog.tableId'",
)
expect_error(
    """CREATE OR REPLACE TABLE sales.orders USING DELTA
       TBLPROPERTIES ('delta.feature.catalogManaged' = 'disabled')
       AS SELECT * FROM sales.orders""",
    "cannot override 'delta.feature.catalogManaged'='disabled'; expected 'supported'",
)
assert identity("sales.orders") == (table_id, location)
assert history("sales.orders")[-1] == (5, "RESTORE")
assert rows("sales.orders") == [(6, "2026-10-04"), (7, "2026-10-03")]

# An external table can't be replaced, with or without its location.
external = f"file://{DOCS_ROOT}/external/replace_demo_orders"
spark.sql(f"CREATE TABLE sales.ext_orders (a INT) USING DELTA LOCATION '{external}'")
expect_error(
    "CREATE OR REPLACE TABLE sales.ext_orders (a INT, b STRING) USING DELTA",
    "REPLACE TABLE is only supported for catalog-managed UC Delta tables",
    "is EXTERNAL",
)
expect_error(
    "REPLACE TABLE sales.ext_orders USING DELTA AS SELECT 1 AS a",
    "REPLACE TABLE is only supported for catalog-managed UC Delta tables",
    "is EXTERNAL",
)
expect_error(
    f"""CREATE OR REPLACE TABLE sales.ext_orders (a INT, b STRING) USING DELTA
        LOCATION '{external}'""",
    "cannot specify 'location' or 'external'",
)
assert spark.table("sales.ext_orders").columns == ["a"]

# A replacement may turn deletion vectors off (the page says so, without consequences).
spark.sql("""
    CREATE OR REPLACE TABLE sales.scratch USING DELTA
    TBLPROPERTIES ('delta.enableDeletionVectors' = 'false') AS SELECT 1 AS a
""")
scratch_props = dict(spark.sql("SHOW TBLPROPERTIES sales.scratch").collect())
assert scratch_props["delta.enableDeletionVectors"] == "false", scratch_props

spark.sql("DROP TABLE sales.ext_orders")
spark.stop()
asyncio.run(_drop_catalog())
