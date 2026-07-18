use unitycatalog_client::UnityCatalogClient;

// --8<-- [start:list_catalogs]
pub async fn list_catalogs_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client.list_catalogs().await.unwrap();
    for catalog in response.catalogs {
        println!("{}", catalog.name);
    }
}
// --8<-- [end:list_catalogs]

// --8<-- [start:create_catalog]
pub async fn create_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let catalog = client
        .create_catalog("my_catalog")
        .with_comment("My first catalog".to_string())
        .await
        .unwrap();
    println!("Created: {}", catalog.name);
}
// --8<-- [end:create_catalog]

// --8<-- [start:get_catalog]
pub async fn get_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let catalog = client.catalog("my_catalog").get().await.unwrap();
    println!("Got: {}", catalog.name);
}
// --8<-- [end:get_catalog]

// --8<-- [start:update_catalog]
pub async fn update_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let catalog = client
        .catalog("my_catalog")
        .update()
        .with_comment("Updated comment".to_string())
        .await
        .unwrap();
    println!("Updated: {}", catalog.name);
}
// --8<-- [end:update_catalog]

// --8<-- [start:delete_catalog]
pub async fn delete_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client.catalog("my_catalog").delete().await.unwrap();
    println!("Deleted catalog");
}
// --8<-- [end:delete_catalog]
