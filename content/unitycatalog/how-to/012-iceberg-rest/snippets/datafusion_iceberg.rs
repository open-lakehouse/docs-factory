// /// docs-factory
// compose = "../../../../../envs/uc-aws/compose.yaml"
// services = ["unitycatalog"]
// claims.datafusion-rust = [
//   { journey = "iceberg.schema-create", region = "schema", api = "Catalog::create_namespace" },
//   { journey = "iceberg.namespace-list", region = "schema", api = "Catalog::list_namespaces" },
//   { journey = "iceberg.namespace-drop", region = "drop", api = "Catalog::drop_namespace" },
//   { journey = "iceberg.create", region = "create", api = "CREATE TABLE" },
//   { journey = "iceberg.append", region = "write", api = "INSERT INTO" },
//   { journey = "iceberg.read", region = "read", api = "SELECT" },
//   { journey = "iceberg.update", fails = "UPDATE not supported", anchor = "update-and-delete-rows" },
//   { journey = "iceberg.delete", fails = "DELETE not supported", anchor = "update-and-delete-rows" },
//   { journey = "iceberg.rename", region = "rename", api = "Catalog::rename_table" },
//   { journey = "iceberg.drop", region = "drop", api = "Catalog::drop_table" },
// ]
// ///

//! Create, change, and drop an Iceberg table in Unity Catalog from DataFusion in Rust, through
//! Iceberg REST.
//!
//! It connects iceberg-rust's REST catalog to the server's Iceberg REST API, queries it with
//! DataFusion SQL, and manages schemas and renames through the same catalog. Start the docs'
//! local server from `uc-docs-env/uc-aws` with `docker compose up -d --wait`. Put this file in
//! a Cargo project's `src/main.rs` after
//! `cargo add iceberg-datafusion --git https://github.com/apache/datafusion-iceberg --rev 8979482936eff6509e40c2e4e3bfc1235d965d60`,
//! `cargo add iceberg iceberg-catalog-rest iceberg-storage-opendal --git https://github.com/apache/iceberg-rust --rev 5b82ab99aeaf50bf4f5b3b776ac9cd6380a5f3e3`,
//! `cargo add datafusion@55.1 serde_json`, `cargo add reqwest@0.12 --features json`,
//! and `cargo add tokio --features macros,rt-multi-thread`, then run it with
//! `AWS_ENDPOINT_URL=http://localhost:9000 AWS_REGION=us-east-1 cargo run`.
//!
//! It first creates a fresh `retail` catalog with managed storage on S3, and a
//! `sales` schema, replacing any `retail` catalog there. The asserts check each
//! step, so a run that finishes means the example works.

use datafusion::arrow::array::{Array, Int64Array, RecordBatch};
use serde_json::{json, Value};

// --8<-- [start:imports]
use std::collections::HashMap;
use std::sync::Arc;

use datafusion::prelude::SessionContext;
use iceberg::{Catalog, CatalogBuilder, NamespaceIdent, TableIdent};
use iceberg_catalog_rest::RestCatalogBuilder;
use iceberg_datafusion::IcebergCatalogProvider;
use iceberg_storage_opendal::OpenDalStorageFactory;
// --8<-- [end:imports]

const API: &str = "http://localhost:8080/api/2.1/unity-catalog";

type BoxError = Box<dyn std::error::Error>;

/// Call the Unity Catalog REST API, as an admin would once.
async fn call(
    http: &reqwest::Client,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<reqwest::Response, BoxError> {
    let mut request = http.request(method, format!("{API}{path}"));
    if let Some(body) = body {
        request = request.json(&body);
    }
    Ok(request.send().await?)
}

/// Create the object unless an earlier run left it. The server answers 400, not
/// 409, for these.
async fn create_once(http: &reqwest::Client, path: &str, body: Value) -> Result<(), BoxError> {
    let response = call(http, reqwest::Method::POST, path, Some(body)).await?;
    if response.status().is_success() {
        return Ok(());
    }
    let text = response.text().await?;
    if text.contains("ALREADY_EXISTS") {
        Ok(())
    } else {
        Err(format!("POST {path}: {text}").into())
    }
}

/// A storage credential, an external location over
/// `s3://amzn-s3-demo-bucket/retail`, and a fresh `retail` catalog whose
/// managed storage is under it, with a `sales` schema.
async fn setup_retail(http: &reqwest::Client) -> Result<(), BoxError> {
    create_once(
        http,
        "/credentials",
        json!({
            "name": "retail_storage",
            "purpose": "STORAGE",
            "aws_iam_role": {"role_arn": "arn:aws:iam::123456789012:role/uc-retail"},
        }),
    )
    .await?;
    create_once(
        http,
        "/external-locations",
        json!({
            "name": "retail_data",
            "url": "s3://amzn-s3-demo-bucket/retail",
            "credential_name": "retail_storage",
        }),
    )
    .await?;
    let deleted = call(
        http,
        reqwest::Method::DELETE,
        "/catalogs/retail?force=true",
        None,
    )
    .await?;
    if !(deleted.status().is_success() || deleted.status() == reqwest::StatusCode::NOT_FOUND) {
        return Err(format!("DELETE retail: {}", deleted.text().await?).into());
    }
    for (path, body) in [
        (
            "/catalogs",
            json!({"name": "retail", "storage_root": "s3://amzn-s3-demo-bucket/retail/managed"}),
        ),
        (
            "/schemas",
            json!({"name": "sales", "catalog_name": "retail"}),
        ),
    ] {
        call(http, reqwest::Method::POST, path, Some(body))
            .await?
            .error_for_status()?;
    }
    Ok(())
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
async fn main() -> Result<(), BoxError> {
    let http = reqwest::Client::new();
    setup_retail(&http).await?;

    // --8<-- [start:connect]
    let catalog: Arc<dyn Catalog> = Arc::new(
        RestCatalogBuilder::default()
            .with_storage_factory(Arc::new(OpenDalStorageFactory::S3 {
                customized_credential_load: None,
            }))
            .load(
                "retail",
                HashMap::from([
                    (
                        "uri".to_string(),
                        "http://localhost:8080/api/2.1/unity-catalog/iceberg".to_string(),
                    ),
                    ("warehouse".to_string(), "retail".to_string()),
                    ("token".to_string(), "not-used".to_string()),
                ]),
            )
            .await?,
    );
    let ctx = SessionContext::new();
    let provider = IcebergCatalogProvider::try_new(catalog.clone()).await?;
    ctx.register_catalog("retail", Arc::new(provider));
    // --8<-- [end:connect]

    // --8<-- [start:schema]
    let staging = NamespaceIdent::new("staging".to_string());
    catalog.create_namespace(&staging, HashMap::new()).await?;
    for namespace in catalog.list_namespaces(None).await? {
        println!("{namespace}");
    }
    // --8<-- [end:schema]
    let namespaces = catalog.list_namespaces(None).await?;
    let sales = NamespaceIdent::new("sales".to_string());
    assert!(
        namespaces.contains(&sales) && namespaces.contains(&staging),
        "{namespaces:?}"
    );

    // --8<-- [start:create]
    ctx.sql(
        "CREATE TABLE retail.sales.orders (
            order_id BIGINT,
            customer VARCHAR,
            amount DOUBLE
        )",
    )
    .await?
    .collect()
    .await?;
    // --8<-- [end:create]
    let info: Value = call(
        &http,
        reqwest::Method::GET,
        "/tables/retail.sales.orders",
        None,
    )
    .await?
    .error_for_status()?
    .json()
    .await?;
    assert_eq!(info["data_source_format"], "ICEBERG", "{info}");
    assert_eq!(info["table_type"], "MANAGED", "{info}");

    // --8<-- [start:write]
    ctx.sql(
        "INSERT INTO retail.sales.orders VALUES
            (1, 'ada', 9.5),
            (2, 'grace', 20.0),
            (3, 'linus', 3.25)",
    )
    .await?
    .collect()
    .await?;
    // --8<-- [end:write]

    // --8<-- [start:read]
    ctx.sql("SELECT * FROM retail.sales.orders WHERE amount > 5 ORDER BY order_id")
        .await?
        .show()
        .await?;
    // --8<-- [end:read]
    let all = ctx
        .sql("SELECT order_id FROM retail.sales.orders")
        .await?
        .collect()
        .await?;
    assert_eq!(ids(&all), [1, 2, 3]);

    // DataFusion's Iceberg tables take no row-level changes; CI flags this when they do.
    for (statement, expected) in [
        (
            "UPDATE retail.sales.orders SET amount = 21.0 WHERE order_id = 2",
            "UPDATE not supported",
        ),
        (
            "DELETE FROM retail.sales.orders WHERE customer = 'linus'",
            "DELETE not supported",
        ),
    ] {
        let result = match ctx.sql(statement).await {
            Ok(df) => df.collect().await.map(|_| ()),
            Err(e) => Err(e),
        };
        let err = result.expect_err(statement).to_string();
        assert!(err.contains(expected), "{err}");
    }

    // --8<-- [start:rename]
    catalog
        .rename_table(
            &TableIdent::from_strs(["sales", "orders"])?,
            &TableIdent::from_strs(["sales", "order_history"])?,
        )
        .await?;
    // --8<-- [end:rename]
    let tables = catalog.list_tables(&sales).await?;
    assert_eq!(
        tables,
        [TableIdent::from_strs(["sales", "order_history"])?],
        "{tables:?}"
    );

    // --8<-- [start:drop]
    catalog
        .drop_table(&TableIdent::from_strs(["sales", "order_history"])?)
        .await?;
    catalog.drop_namespace(&staging).await?;
    // --8<-- [end:drop]
    assert!(catalog.list_tables(&sales).await?.is_empty());
    assert!(!catalog.list_namespaces(None).await?.contains(&staging));
    Ok(())
}
