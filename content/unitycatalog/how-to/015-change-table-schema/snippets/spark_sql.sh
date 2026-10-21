#!/usr/bin/env bash
# Start the Spark SQL shell with Delta Lake and the Unity Catalog connector,
# with the docs' local server as the `warehouse` catalog.

# --8<-- [start:launch]
uvx --from pyspark==4.1.0 spark-sql \
  --packages io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0,io.delta:delta-spark_4.1_2.13:4.3.1 \
  --conf spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension \
  --conf spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog \
  --conf spark.sql.catalog.warehouse=io.unitycatalog.spark.UCSingleCatalog \
  --conf spark.sql.catalog.warehouse.uri=http://localhost:8080 \
  --conf spark.sql.catalog.warehouse.auth.type=static \
  --conf spark.sql.catalog.warehouse.auth.token=not-used \
  --conf spark.sql.defaultCatalog=warehouse
# --8<-- [end:launch]
