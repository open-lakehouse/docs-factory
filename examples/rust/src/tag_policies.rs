use unitycatalog_client::UnityCatalogClient;
use unitycatalog_common::models::tags::v1::{TagPolicy, Value};

// docs-list_tag_policies-start
pub async fn list_tag_policies_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let response = client.list_tag_policies().await.unwrap();
    for policy in response.tag_policies {
        println!("{}", policy.tag_key);
    }
}
// docs-list_tag_policies-end

// docs-create_tag_policy-start
pub async fn create_tag_policy_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let policy = client
        .create_tag_policy(TagPolicy {
            tag_key: "classification".to_string(),
            description: Some("Data sensitivity level".to_string()),
            values: vec![
                Value {
                    name: "public".to_string(),
                    ..Default::default()
                },
                Value {
                    name: "restricted".to_string(),
                    ..Default::default()
                },
            ],
            ..Default::default()
        })
        .await
        .unwrap();
    println!("Created: {}", policy.tag_key);
}
// docs-create_tag_policy-end

// docs-get_tag_policy-start
pub async fn get_tag_policy_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let policy = client.tag_policy("classification").get().await.unwrap();
    println!("Got: {}", policy.tag_key);
}
// docs-get_tag_policy-end

// docs-update_tag_policy-start
pub async fn update_tag_policy_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    let policy = client
        .tag_policy("classification")
        .update(TagPolicy {
            tag_key: "classification".to_string(),
            description: Some("Updated description".to_string()),
            ..Default::default()
        })
        .await
        .unwrap();
    println!("Updated: {}", policy.tag_key);
}
// docs-update_tag_policy-end

// docs-delete_tag_policy-start
pub async fn delete_tag_policy_example(base_url: url::Url) {
    let client = UnityCatalogClient::new_unauthenticated(base_url);
    client.tag_policy("classification").delete().await.unwrap();
    println!("Deleted tag policy");
}
// docs-delete_tag_policy-end
