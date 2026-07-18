use unitycatalog_client::UnityCatalogClient;

// --8<-- [start:list_schemas]
pub async fn list_schemas_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client.list_schemas("my_catalog").await.unwrap();
    for schema in response.schemas {
        println!("{}", schema.name);
    }
}
// --8<-- [end:list_schemas]

// --8<-- [start:create_schema]
pub async fn create_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let schema = client
        .create_schema("my_catalog", "my_schema")
        .with_comment("My first schema".to_string())
        .await
        .unwrap();
    println!("Created: {}.{}", schema.catalog_name, schema.name);
}
// --8<-- [end:create_schema]

// --8<-- [start:get_schema]
pub async fn get_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let schema = client
        .schema("my_catalog", "my_schema")
        .get()
        .await
        .unwrap();
    println!("Got: {}.{}", schema.catalog_name, schema.name);
}
// --8<-- [end:get_schema]

// --8<-- [start:update_schema]
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
// --8<-- [end:update_schema]

// --8<-- [start:delete_schema]
pub async fn delete_schema_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client
        .schema("my_catalog", "my_schema")
        .delete()
        .await
        .unwrap();
    println!("Deleted schema");
}
// --8<-- [end:delete_schema]
