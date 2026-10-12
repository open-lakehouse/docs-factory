-- Read the orders Delta table: the whole table, then selected columns and
-- rows. Enter the statements in the DuckDB CLI.

-- --8<-- [start:setup]
INSTALL delta;
LOAD delta;
-- --8<-- [end:setup]

-- --8<-- [start:read]
SELECT * FROM delta_scan('/tmp/delta/orders') ORDER BY order_id;
-- --8<-- [end:read]

-- --8<-- [start:filter]
SELECT order_id, product, amount
FROM delta_scan('/tmp/delta/orders')
WHERE status = 'placed' AND amount > 15
ORDER BY order_id;
-- --8<-- [end:filter]
