// /// docs-factory
// claims.delta-rs-rust = [
//   { journey = "read.scan", region = "read", api = "open_table() + table_provider()" },
// ]
// ///

//! Read a Delta table with the `deltalake` crate (delta-rs) in Rust.
//!
//! It reads the whole table, then selected columns and rows, through DataFusion.
//! It first writes the sample `orders` table to /tmp/delta/orders, replacing any
//! table there. Put it in a Cargo project's `src/main.rs` after
//! `cargo add deltalake@1.1.1 --features datafusion` and
//! `cargo add tokio --features macros,rt-multi-thread`, then `cargo run`. The
//! asserts at the end check the result, so a run that finishes means the example
//! works.

use std::sync::Arc;

use deltalake::arrow::array::{Array, Float64Array, Int64Array, RecordBatch, StringArray};
use deltalake::arrow::datatypes::{DataType as ArrowType, Field, Schema};
use deltalake::kernel::{DataType, PrimitiveType, StructField};
use deltalake::{DeltaResult, DeltaTable};

// --8<-- [start:imports]
use deltalake::datafusion::prelude::{col, lit, SessionContext};
use deltalake::ensure_table_uri;
// --8<-- [end:imports]

const PATH: &str = "/tmp/delta/orders";

type Order = (i64, i64, &'static str, i64, f64, &'static str);

/// Write the `orders` table the tutorials build, in the same three versions.
async fn build_orders() -> DeltaResult<()> {
    let _ = std::fs::remove_dir_all(PATH);
    let columns = [
        ("order_id", PrimitiveType::Long),
        ("customer_id", PrimitiveType::Long),
        ("product", PrimitiveType::String),
        ("quantity", PrimitiveType::Long),
        ("amount", PrimitiveType::Double),
        ("status", PrimitiveType::String),
    ]
    .map(|(name, kind)| StructField::new(name, DataType::Primitive(kind), true));
    let table = DeltaTable::try_from_url(ensure_table_uri(PATH)?).await?;
    let table = table.create().with_columns(columns).await?;
    let table = table
        .write([batch(&[
            (1, 101, "widget", 2, 19.98, "placed"),
            (2, 102, "gadget", 1, 24.50, "placed"),
            (3, 101, "gizmo", 5, 12.25, "shipped"),
        ])])
        .await?;
    table
        .write([batch(&[
            (4, 103, "widget", 1, 9.99, "placed"),
            (5, 102, "sprocket", 3, 30.00, "placed"),
        ])])
        .await?;
    Ok(())
}

fn batch(rows: &[Order]) -> RecordBatch {
    let schema = Arc::new(Schema::new(vec![
        Field::new("order_id", ArrowType::Int64, true),
        Field::new("customer_id", ArrowType::Int64, true),
        Field::new("product", ArrowType::Utf8, true),
        Field::new("quantity", ArrowType::Int64, true),
        Field::new("amount", ArrowType::Float64, true),
        Field::new("status", ArrowType::Utf8, true),
    ]));
    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(Int64Array::from_iter_values(rows.iter().map(|r| r.0))),
            Arc::new(Int64Array::from_iter_values(rows.iter().map(|r| r.1))),
            Arc::new(StringArray::from_iter_values(rows.iter().map(|r| r.2))),
            Arc::new(Int64Array::from_iter_values(rows.iter().map(|r| r.3))),
            Arc::new(Float64Array::from_iter_values(rows.iter().map(|r| r.4))),
            Arc::new(StringArray::from_iter_values(rows.iter().map(|r| r.5))),
        ],
    )
    .expect("the columns match the schema")
}

/// The sorted `order_id` values in the batches.
fn ids(batches: &[RecordBatch]) -> Vec<i64> {
    let mut ids: Vec<i64> = batches
        .iter()
        .flat_map(|b| {
            let column = b.column_by_name("order_id").expect("an order_id column");
            let ids = column
                .as_any()
                .downcast_ref::<Int64Array>()
                .expect("BIGINT");
            (0..ids.len()).map(|i| ids.value(i)).collect::<Vec<_>>()
        })
        .collect();
    ids.sort_unstable();
    ids
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    build_orders().await?;

    // --8<-- [start:read]
    let table = deltalake::open_table(ensure_table_uri("/tmp/delta/orders")?).await?;
    let ctx = SessionContext::new();
    let orders = ctx.read_table(table.table_provider().await?)?;
    orders
        .clone()
        .sort_by(vec![col("order_id")])?
        .show()
        .await?;
    // --8<-- [end:read]
    let everything = ids(&orders.clone().collect().await?);

    // --8<-- [start:filter]
    let placed = orders
        .filter(
            col("status")
                .eq(lit("placed"))
                .and(col("amount").gt(lit(15.0))),
        )?
        .select_columns(&["order_id", "product", "amount"])?;
    placed
        .clone()
        .sort_by(vec![col("order_id")])?
        .show()
        .await?;
    // --8<-- [end:filter]
    let columns: Vec<String> = placed
        .schema()
        .fields()
        .iter()
        .map(|f| f.name().clone())
        .collect();
    let filtered = ids(&placed.collect().await?);

    assert_eq!(everything, [1, 2, 3, 4, 5]);
    assert_eq!(columns, ["order_id", "product", "amount"]);
    assert_eq!(filtered, [1, 2, 5]);
    Ok(())
}
