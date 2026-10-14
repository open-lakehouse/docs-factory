# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.4"]
# ///
# change_orders_duckdb.py — append to and update the Iceberg table Spark created, from DuckDB.
# Run:      uv run change_orders_duckdb.py
# Needs:    write_orders_spark.py run first.
# Verified: unitycatalog v0.7.0, duckdb 1.5.4 (iceberg extension 75726455).
import duckdb

# --8<-- [start:attach]
con = duckdb.connect()
con.execute("INSTALL iceberg")
con.execute("LOAD iceberg")
con.execute("SET iceberg_use_metadata_log = false")
con.execute("CREATE SECRET uc (TYPE iceberg, TOKEN 'not-used')")
con.execute("""
    ATTACH 'retail' AS retail (
        TYPE iceberg, SECRET uc,
        ENDPOINT 'http://localhost:8080/api/2.1/unity-catalog/iceberg'
    )
""")
# --8<-- [end:attach]
# The docs environment simulates S3 at localhost:9000; leave these out on AWS.
con.execute("SET s3_endpoint = 'localhost:9000'")
con.execute("SET s3_use_ssl = false")
con.execute("SET s3_url_style = 'path'")

# --8<-- [start:change]
con.execute("INSERT INTO retail.sales.orders VALUES (12, 3, 3.25), (13, 1, 1.5)")
con.execute("UPDATE retail.sales.orders SET amount = 21.0 WHERE order_id = 11")
con.sql("SELECT * FROM retail.sales.orders ORDER BY order_id").show()
# --8<-- [end:change]
assert con.sql("SELECT sum(amount) FROM retail.sales.orders").fetchone() == (35.25,)
