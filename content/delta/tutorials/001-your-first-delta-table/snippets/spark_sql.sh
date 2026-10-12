#!/usr/bin/env bash
# Start the Spark SQL shell with Delta Lake, and list a table's transaction log.

# --8<-- [start:launch]
uvx --from pyspark==4.2.0 spark-sql \
  --packages io.delta:delta-spark_2.13:4.4.0 \
  --conf spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension \
  --conf spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog
# --8<-- [end:launch]

# --8<-- [start:log]
ls /tmp/delta/orders/_delta_log
# --8<-- [end:log]
