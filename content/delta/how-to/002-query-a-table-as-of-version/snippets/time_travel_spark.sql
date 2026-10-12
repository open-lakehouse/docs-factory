-- Query earlier versions of the orders Delta table: list its history, then
-- read it as of a version and as of a timestamp. Enter the statements in the
-- spark-sql shell started with Delta Lake.

-- --8<-- [start:history]
DESCRIBE HISTORY delta.`/tmp/delta/orders`;
-- --8<-- [end:history]

-- --8<-- [start:version]
SELECT * FROM delta.`/tmp/delta/orders` VERSION AS OF 1 ORDER BY order_id;
-- --8<-- [end:version]

-- --8<-- [start:timestamp]
CREATE TABLE IF NOT EXISTS orders USING DELTA LOCATION '/tmp/delta/orders';

SELECT * FROM orders
TIMESTAMP AS OF current_timestamp() - INTERVAL 1 DAY
ORDER BY order_id;
-- --8<-- [end:timestamp]
