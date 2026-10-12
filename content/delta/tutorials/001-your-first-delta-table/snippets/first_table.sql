-- Create a Delta table at a path, write it in two commits, then read its
-- history and an earlier version. Enter the statements in the spark-sql shell
-- started with Delta Lake.

-- --8<-- [start:create]
CREATE TABLE delta.`/tmp/delta/orders` (
  order_id BIGINT,
  customer_id BIGINT,
  product STRING,
  quantity BIGINT,
  amount DOUBLE,
  status STRING
) USING DELTA;
-- --8<-- [end:create]

-- --8<-- [start:insert-first]
INSERT INTO delta.`/tmp/delta/orders` VALUES
  (1, 101, 'widget', 2, 19.98, 'placed'),
  (2, 102, 'gadget', 1, 24.50, 'placed'),
  (3, 101, 'gizmo', 5, 12.25, 'shipped');
-- --8<-- [end:insert-first]

-- --8<-- [start:select]
SELECT * FROM delta.`/tmp/delta/orders` ORDER BY order_id;
-- --8<-- [end:select]

-- --8<-- [start:insert-second]
INSERT INTO delta.`/tmp/delta/orders` VALUES
  (4, 103, 'widget', 1, 9.99, 'placed'),
  (5, 102, 'sprocket', 3, 30.00, 'placed');
-- --8<-- [end:insert-second]

-- --8<-- [start:history]
DESCRIBE HISTORY delta.`/tmp/delta/orders`;
-- --8<-- [end:history]

-- --8<-- [start:time-travel]
SELECT * FROM delta.`/tmp/delta/orders` VERSION AS OF 1 ORDER BY order_id;
-- --8<-- [end:time-travel]
