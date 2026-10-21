-- Change a managed Delta table's columns and properties, rename it by copying,
-- and change an external table's Delta log. Enter the statements in the
-- spark-sql shell that spark_sql.sh starts.

-- --8<-- [start:create-table]
CREATE SCHEMA IF NOT EXISTS sales;
CREATE TABLE sales.orders (
  order_id    BIGINT,
  customer    STRING,
  amount      DECIMAL(10, 2),
  quantity    INT,
  legacy_code STRING
) USING DELTA;
INSERT INTO sales.orders VALUES
  (1, 'ada', 9.50, 1, 'A'),
  (2, 'grace', 20.00, 2, 'B');
-- --8<-- [end:create-table]

-- --8<-- [start:add-columns]
ALTER TABLE sales.orders
  ADD COLUMNS (channel STRING COMMENT 'Where the order was placed');
ALTER TABLE sales.orders ALTER COLUMN amount COMMENT 'Order total in EUR';
COMMENT ON TABLE sales.orders IS 'One row per customer order';
-- --8<-- [end:add-columns]

-- --8<-- [start:check-column-mapping]
SHOW TBLPROPERTIES sales.orders ('delta.columnMapping.mode');
-- --8<-- [end:check-column-mapping]

-- --8<-- [start:drop-column]
ALTER TABLE sales.orders DROP COLUMN legacy_code;
-- --8<-- [end:drop-column]

-- --8<-- [start:widen-type]
ALTER TABLE sales.orders SET TBLPROPERTIES ('delta.enableTypeWidening' = 'true');
ALTER TABLE sales.orders ALTER COLUMN quantity TYPE BIGINT;
-- --8<-- [end:widen-type]

-- --8<-- [start:properties]
ALTER TABLE sales.orders
  SET TBLPROPERTIES ('sales.owner' = 'orders-team', 'sales.tier' = 'gold');
ALTER TABLE sales.orders UNSET TBLPROPERTIES ('sales.tier');
SHOW TBLPROPERTIES sales.orders ('sales.owner');
-- --8<-- [end:properties]

-- --8<-- [start:history]
DESCRIBE HISTORY sales.orders;
-- --8<-- [end:history]

-- --8<-- [start:rename-table]
CREATE TABLE sales.customer_orders USING DELTA AS SELECT * FROM sales.orders;
DROP TABLE sales.orders;
-- --8<-- [end:rename-table]

-- --8<-- [start:external-alter]
ALTER TABLE sales.order_events ADD COLUMNS (carrier STRING);
ALTER TABLE sales.order_events ALTER COLUMN status COMMENT 'Latest order status';
COMMENT ON TABLE sales.order_events IS 'One row per order event';
ALTER TABLE sales.order_events SET TBLPROPERTIES ('sales.owner' = 'orders-team');
-- --8<-- [end:external-alter]
