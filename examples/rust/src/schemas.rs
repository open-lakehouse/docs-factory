use unitycatalog_client::UnityCatalogClient;

// docs-list_schemas-start
pub async fn list_schemas_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client.list_schemas("my_catalog").await.unwrap();
    for schema in response.schemas {
        println!("{}", schema.name);
    }
}
// docs-list_schemas-end

// docs-create_schema-start
pub async fn create_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let schema = client
        .create_schema("my_catalog", "my_schema")
        .with_comment("My first schema".to_string())
        .await
        .unwrap();
    println!("Created: {}.{}", schema.catalog_name, schema.name);
}
// docs-create_schema-end

// docs-get_schema-start
pub async fn get_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let schema = client
        .schema("my_catalog", "my_schema")
        .get()
        .await
        .unwrap();
    println!("Got: {}.{}", schema.catalog_name, schema.name);
}
// docs-get_schema-end

// docs-update_schema-start
pub async fn update_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let schema = client
        .schema("my_catalog", "my_schema")
        .update()
        .with_comment("Updated comment".to_string())
        .await
        .unwrap();
    println!("Updated: {}.{}", schema.catalog_name, schema.name);
}
// docs-update_schema-end

// docs-delete_schema-start
pub async fn delete_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client
        .schema("my_catalog", "my_schema")
        .delete()
        .await
        .unwrap();
    println!("Deleted schema");
}
// docs-delete_schema-end
