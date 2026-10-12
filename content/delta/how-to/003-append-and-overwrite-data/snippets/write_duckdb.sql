-- Append rows to the orders Delta table. Enter the statements in the DuckDB
-- CLI.

-- --8<-- [start:setup]
INSTALL delta;
LOAD delta;
-- --8<-- [end:setup]

-- --8<-- [start:append]
ATTACH '/tmp/delta/orders' AS orders (TYPE delta);

INSERT INTO orders VALUES (6, 104, 'gizmo', 2, 24.50, 'placed');
-- --8<-- [end:append]
