use unitycatalog_client::UnityCatalogClient;

// docs-list_catalogs-start
pub async fn list_catalogs_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client.list_catalogs().await.unwrap();
    for catalog in response.catalogs {
        println!("{}", catalog.name);
    }
}
// docs-list_catalogs-end

// docs-create_catalog-start
pub async fn create_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let catalog = client
        .create_catalog("my_catalog")
        .with_comment("My first catalog".to_string())
        .await
        .unwrap();
    println!("Created: {}", catalog.name);
}
// docs-create_catalog-end

// docs-get_catalog-start
pub async fn get_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let catalog = client.catalog("my_catalog").get().await.unwrap();
    println!("Got: {}", catalog.name);
}
// docs-get_catalog-end

// docs-update_catalog-start
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
// docs-update_catalog-end

// docs-delete_catalog-start
pub async fn delete_catalog_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client.catalog("my_catalog").delete().await.unwrap();
    println!("Deleted catalog");
}
// docs-delete_catalog-end
