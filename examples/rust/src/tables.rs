use unitycatalog_client::UnityCatalogClient;
use unitycatalog_common::models::tables::v1::{DataSourceFormat, TableType};

// docs-list_tables-start
pub async fn list_tables_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client.list_tables("my_catalog", "my_schema").await.unwrap();
    for table in response.tables {
        println!("{}", table.name);
    }
}
// docs-list_tables-end

// docs-create_table-start
pub async fn create_table_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let table = client
        .create_table(
            "my_table",
            "my_schema",
            "my_catalog",
            TableType::Managed,
            DataSourceFormat::Delta,
        )
        .with_comment("My first table".to_string())
        .await
        .unwrap();
    println!("Created: {}", table.name);
}
// docs-create_table-end

// docs-get_table-start
pub async fn get_table_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let table = client
        .table_from_full_name("my_catalog.my_schema.my_table")
        .get()
        .await
        .unwrap();
    println!("Got: {}", table.name);
}
// docs-get_table-end

// docs-delete_table-start
pub async fn delete_table_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client
        .table_from_full_name("my_catalog.my_schema.my_table")
        .delete()
        .await
        .unwrap();
    println!("Deleted table");
}
// docs-delete_table-end
