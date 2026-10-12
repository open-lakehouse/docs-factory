-- Append rows to the orders Delta table, then overwrite it. Enter the
-- statements in the spark-sql shell started with Delta Lake.

-- --8<-- [start:append]
INSERT INTO delta.`/tmp/delta/orders` VALUES
  (6, 104, 'gizmo', 2, 24.50, 'placed');
-- --8<-- [end:append]

-- --8<-- [start:overwrite]
INSERT OVERWRITE delta.`/tmp/delta/orders` VALUES
  (7, 105, 'widget', 4, 39.96, 'placed'),
  (8, 101, 'gadget', 2, 49.00, 'placed');
-- --8<-- [end:overwrite]

-- --8<-- [start:history]
DESCRIBE HISTORY delta.`/tmp/delta/orders` LIMIT 2;
-- --8<-- [end:history]
