use unitycatalog_client::UnityCatalogClient;
use unitycatalog_common::models::volumes::v1::VolumeType;

// docs-list_volumes-start
pub async fn list_volumes_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client
        .list_volumes("my_catalog", "my_schema")
        .await
        .unwrap();
    for volume in response.volumes {
        println!("{}", volume.name);
    }
}
// docs-list_volumes-end

// docs-create_volume-start
pub async fn create_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let volume = client
        .create_volume("my_catalog", "my_schema", "my_volume", VolumeType::Managed)
        .with_comment("My first volume".to_string())
        .await
        .unwrap();
    println!("Created: {}", volume.name);
}
// docs-create_volume-end

// docs-get_volume-start
pub async fn get_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let volume = client
        .volume("my_catalog", "my_schema", "my_volume")
        .get()
        .await
        .unwrap();
    println!("Got: {}", volume.name);
}
// docs-get_volume-end

// docs-update_volume-start
pub async fn update_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let volume = client
        .volume("my_catalog", "my_schema", "my_volume")
        .update()
        .with_comment("Updated comment".to_string())
        .await
        .unwrap();
    println!("Updated: {}", volume.name);
}
// docs-update_volume-end

// docs-delete_volume-start
pub async fn delete_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client
        .volume("my_catalog", "my_schema", "my_volume")
        .delete()
        .await
        .unwrap();
    println!("Deleted volume");
}
// docs-delete_volume-end
