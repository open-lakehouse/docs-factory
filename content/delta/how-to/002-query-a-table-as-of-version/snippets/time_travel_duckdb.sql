-- Query an earlier version of the orders Delta table. Enter the statements in
-- the DuckDB CLI.

-- --8<-- [start:setup]
INSTALL delta;
LOAD delta;
-- --8<-- [end:setup]

-- --8<-- [start:version]
ATTACH '/tmp/delta/orders' AS orders (TYPE delta);

SELECT * FROM orders AT (VERSION => 1) ORDER BY order_id;
-- --8<-- [end:version]

-- --8<-- [start:timestamp]
SELECT * FROM orders AT (TIMESTAMP => now() - INTERVAL 1 DAY) ORDER BY order_id;
-- --8<-- [end:timestamp]
