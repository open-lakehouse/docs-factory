use unitycatalog_client::UnityCatalogClient;
use unitycatalog_common::models::volumes::v1::VolumeType;

// --8<-- [start:list_volumes]
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
// --8<-- [end:list_volumes]

// --8<-- [start:create_volume]
pub async fn create_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let volume = client
        .create_volume("my_catalog", "my_schema", "my_volume", VolumeType::Managed)
        .with_comment("My first volume".to_string())
        .await
        .unwrap();
    println!("Created: {}", volume.name);
}
// --8<-- [end:create_volume]

// --8<-- [start:get_volume]
pub async fn get_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let volume = client
        .volume("my_catalog", "my_schema", "my_volume")
        .get()
        .await
        .unwrap();
    println!("Got: {}", volume.name);
}
// --8<-- [end:get_volume]

// --8<-- [start:update_volume]
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
// --8<-- [end:update_volume]

// --8<-- [start:delete_volume]
pub async fn delete_volume_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client
        .volume("my_catalog", "my_schema", "my_volume")
        .delete()
        .await
        .unwrap();
    println!("Deleted volume");
}
// --8<-- [end:delete_volume]
