///usr/bin/env jbang "$0" "$@" ; exit $?
// --8<-- [start:deps]
//JAVA 17+
//DEPS org.apache.spark:spark-sql_2.13:4.2.0
//DEPS io.delta:delta-spark_2.13:4.4.0
// --8<-- [end:deps]

// /// docs-factory
// claims.spark-java = [
//   { journey = "read.scan", region = "read", api = 'spark.read().format("delta").load()' },
// ]
// ///

// Read a Delta table with Spark in Java.
//
// It reads the whole table, then selected columns and rows. It first writes the
// sample `orders` table to /tmp/delta/orders, replacing any table there. Run it
// with `jbang Read.java`; the checks at the end of `main` test the result, so a
// run that finishes means the example works.

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;

public class Read {
  public static void main(String[] args) throws IOException {
    // --8<-- [start:session]
    SparkSession spark = SparkSession.builder()
        .master("local[*]")
        .appName("delta-docs")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .getOrCreate();
    // --8<-- [end:session]
    buildOrders(spark);

    // --8<-- [start:read]
    Dataset<Row> orders = spark.read().format("delta").load("/tmp/delta/orders");
    orders.orderBy("order_id").show();
    // --8<-- [end:read]
    List<Long> everything = ids(orders);

    // --8<-- [start:filter]
    Dataset<Row> placed = spark.read()
        .format("delta")
        .load("/tmp/delta/orders")
        .select("order_id", "product", "amount")
        .where("status = 'placed' AND amount > 15");
    placed.orderBy("order_id").show();
    // --8<-- [end:filter]
    List<String> columns = List.of(placed.columns());
    List<Long> filtered = ids(placed);
    spark.stop();

    check(everything.equals(List.of(1L, 2L, 3L, 4L, 5L)), everything);
    check(columns.equals(List.of("order_id", "product", "amount")), columns);
    check(filtered.equals(List.of(1L, 2L, 5L)), filtered);
  }

  /** Write the `orders` table the tutorials build, in the same three versions. */
  static void buildOrders(SparkSession spark) throws IOException {
    Path table = Path.of("/tmp/delta/orders");
    if (Files.exists(table)) {
      try (Stream<Path> files = Files.walk(table)) {
        files.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
      }
    }
    spark.sql("CREATE TABLE delta.`/tmp/delta/orders` (order_id BIGINT, customer_id BIGINT, "
        + "product STRING, quantity BIGINT, amount DOUBLE, status STRING) USING DELTA");
    spark.sql("INSERT INTO delta.`/tmp/delta/orders` VALUES (1, 101, 'widget', 2, 19.98, 'placed'), "
        + "(2, 102, 'gadget', 1, 24.50, 'placed'), (3, 101, 'gizmo', 5, 12.25, 'shipped')");
    spark.sql("INSERT INTO delta.`/tmp/delta/orders` VALUES (4, 103, 'widget', 1, 9.99, 'placed'), "
        + "(5, 102, 'sprocket', 3, 30.00, 'placed')");
  }

  static List<Long> ids(Dataset<Row> df) {
    return df.collectAsList().stream().map(r -> r.<Long>getAs("order_id")).sorted().toList();
  }

  // Java's `assert` is off unless the JVM runs with -ea, so check explicitly.
  static void check(boolean ok, Object got) {
    if (!ok) throw new AssertionError("unexpected result: " + got);
  }
}
