# docs-list_tag_policies-start
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
policies = client.list_tag_policies()
for policy in policies:
    print(policy.tag_key)
# docs-list_tag_policies-end


# docs-create_tag_policy-start
def create_tag_policy_example() -> None:
    from unitycatalog_client import TagPolicy, UnityCatalogClient, Value

    client = UnityCatalogClient(base_url="http://localhost:8080")
    policy = client.create_tag_policy(
        TagPolicy(
            tag_key="classification",
            description="Data sensitivity level",
            values=[Value(name="public"), Value(name="restricted")],
        )
    )
    print(f"Created: {policy.tag_key}")


# docs-create_tag_policy-end


# docs-get_tag_policy-start
def get_tag_policy_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    policy = client.tag_policy("classification").get()
    print(f"Got: {policy.tag_key}")


# docs-get_tag_policy-end


# docs-update_tag_policy-start
def update_tag_policy_example() -> None:
    from unitycatalog_client import TagPolicy, UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    policy = client.tag_policy("classification").update(
        TagPolicy(tag_key="classification", description="Updated description")
    )
    print(f"Updated: {policy.tag_key}")


# docs-update_tag_policy-end


# docs-delete_tag_policy-start
def delete_tag_policy_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    client.tag_policy("classification").delete()
    print("Deleted tag policy")


# docs-delete_tag_policy-end
