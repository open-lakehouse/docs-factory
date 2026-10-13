//> using scala 2.13
//> using dep org.apache.spark::spark-sql:4.2.0
//> using dep io.delta::delta-spark:4.4.0

// /// docs-factory
// claims.spark-scala = [
//   { journey = "read.scan", region = "read", api = 'spark.read.format("delta").load()' },
// ]
// ///

// Read a Delta table with Spark in Scala.
//
// It reads the whole table, then selected columns and rows. It first writes the
// sample `orders` table to /tmp/delta/orders, replacing any table there. Run it
// with `scala-cli run read.sc`; the asserts at the end check the result, so a
// run that finishes means the example works. In `spark-shell`, the `spark`
// session already exists, so enter only the read and filter steps.

import org.apache.spark.sql.SparkSession

val spark = SparkSession.builder
  .master("local[*]")
  .appName("delta-docs")
  .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
  .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
  .getOrCreate()

// The `orders` table the tutorials build, in the same three versions.
scala.reflect.io.Directory(new java.io.File("/tmp/delta/orders")).deleteRecursively()
spark.sql(
  "CREATE TABLE delta.`/tmp/delta/orders` (order_id BIGINT, customer_id BIGINT, " +
    "product STRING, quantity BIGINT, amount DOUBLE, status STRING) USING DELTA"
)
spark.sql(
  "INSERT INTO delta.`/tmp/delta/orders` VALUES (1, 101, 'widget', 2, 19.98, 'placed'), " +
    "(2, 102, 'gadget', 1, 24.50, 'placed'), (3, 101, 'gizmo', 5, 12.25, 'shipped')"
)
spark.sql(
  "INSERT INTO delta.`/tmp/delta/orders` VALUES (4, 103, 'widget', 1, 9.99, 'placed'), " +
    "(5, 102, 'sprocket', 3, 30.00, 'placed')"
)

// --8<-- [start:read]
val orders = spark.read.format("delta").load("/tmp/delta/orders")
orders.orderBy("order_id").show()
// --8<-- [end:read]
val everything = orders.collect().map(_.getAs[Long]("order_id")).sorted.toSeq

// --8<-- [start:filter]
val placed = spark.read
  .format("delta")
  .load("/tmp/delta/orders")
  .select("order_id", "product", "amount")
  .where("status = 'placed' AND amount > 15")
placed.orderBy("order_id").show()
// --8<-- [end:filter]
val columns = placed.columns.toSeq
val filtered = placed.collect().map(_.getAs[Long]("order_id")).sorted.toSeq
spark.stop()

assert(everything == Seq(1L, 2L, 3L, 4L, 5L), everything)
assert(columns == Seq("order_id", "product", "amount"), columns)
assert(filtered == Seq(1L, 2L, 5L), filtered)
