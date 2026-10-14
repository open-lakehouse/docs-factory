# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.4"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.aws.yaml"
# services = ["unitycatalog"]
# claims.duckdb = [
#   { journey = "iceberg.schema-create", region = "schema", api = "CREATE SCHEMA" },
#   { journey = "iceberg.create", region = "create", api = "CREATE TABLE" },
#   { journey = "iceberg.append", region = "write", api = "INSERT INTO" },
#   { journey = "iceberg.read", region = "read" },
#   { journey = "iceberg.update", region = "change", api = "UPDATE" },
#   { journey = "iceberg.delete", region = "change", api = "DELETE FROM" },
#   { journey = "iceberg.rename", region = "rename", api = "ALTER TABLE … RENAME TO" },
#   { journey = "iceberg.drop", region = "drop", api = "DROP TABLE" },
# ]
# ///
"""Create, change, and drop an Iceberg table in Unity Catalog from DuckDB, through Iceberg REST.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose -f compose.aws.yaml up -d --wait

Then run this script, with `_setup.py` from the same page beside it:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run duckdb_iceberg.py
"""

# --8<-- [start:install]
import duckdb

con = duckdb.connect()
con.execute("INSTALL iceberg")
con.execute("LOAD iceberg")
con.execute("SET iceberg_use_metadata_log = false")
# --8<-- [end:install]

from _setup import setup_retail, table_info  # noqa: E402

setup_retail()

# --8<-- [start:attach]
con.execute("CREATE SECRET uc (TYPE iceberg, TOKEN 'not-used')")
con.execute("""
    ATTACH 'retail' AS retail (
        TYPE iceberg,
        SECRET uc,
        ENDPOINT 'http://localhost:8080/api/2.1/unity-catalog/iceberg'
    )
""")
# --8<-- [end:attach]

# The local environment's simulated S3, which DuckDB doesn't find on its own.
# --8<-- [start:local-s3]
con.execute("SET s3_endpoint = 'localhost:9000'")
con.execute("SET s3_use_ssl = false")
con.execute("SET s3_url_style = 'path'")
# --8<-- [end:local-s3]

# --8<-- [start:schema]
con.execute("CREATE SCHEMA retail.staging")
con.sql(
    "SELECT schema_name FROM duckdb_schemas() WHERE database_name = 'retail'"
).show()
# --8<-- [end:schema]
schemas = con.sql(
    "SELECT schema_name FROM duckdb_schemas() WHERE database_name = 'retail'"
).fetchall()
assert {"sales", "staging"} <= {s for (s,) in schemas}, schemas

# --8<-- [start:create]
con.execute("""
    CREATE TABLE retail.sales.orders (
        order_id BIGINT,
        customer VARCHAR,
        amount DOUBLE
    )
""")
# --8<-- [end:create]
info = table_info("retail.sales.orders")
assert (info["data_source_format"], info["table_type"]) == ("ICEBERG", "MANAGED"), info

# --8<-- [start:write]
con.execute("""
    INSERT INTO retail.sales.orders VALUES
        (1, 'ada', 9.5),
        (2, 'grace', 20.0),
        (3, 'linus', 3.25)
""")
# --8<-- [end:write]

# --8<-- [start:read]
con.sql("SELECT * FROM retail.sales.orders WHERE amount > 5 ORDER BY order_id").show()
# --8<-- [end:read]
assert con.sql("SELECT count(*) FROM retail.sales.orders").fetchone() == (3,)

# --8<-- [start:change]
con.execute("UPDATE retail.sales.orders SET amount = 21.0 WHERE order_id = 2")
con.execute("DELETE FROM retail.sales.orders WHERE customer = 'linus'")
# --8<-- [end:change]
rows = con.sql("SELECT * FROM retail.sales.orders ORDER BY order_id").fetchall()
assert rows == [(1, "ada", 9.5), (2, "grace", 21.0)], rows

# --8<-- [start:rename]
con.execute("ALTER TABLE retail.sales.orders RENAME TO order_history")
# --8<-- [end:rename]
tables = con.sql(
    "SELECT name FROM (SHOW ALL TABLES) WHERE database = 'retail' AND schema = 'sales'"
).fetchall()
assert tables == [("order_history",)], tables

# --8<-- [start:drop]
con.execute("DROP TABLE retail.sales.order_history")
con.execute("DROP SCHEMA retail.staging")
# --8<-- [end:drop]
assert con.sql("SELECT count(*) FROM (SHOW ALL TABLES)").fetchone() == (0,)
