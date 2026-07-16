import { UnityCatalogClient } from "@unitycatalog/client";

// docs-list_tag_policies-start
export async function listTagPoliciesExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const policies = await client.listTagPolicies();
  for (const policy of policies) {
    console.log(policy.tagKey);
  }
}
// docs-list_tag_policies-end

// docs-get_tag_policy-start
export async function getTagPolicyExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const policy = await client.tagPolicy("classification").get();
  console.log(`Got: ${policy.tagKey}`);
}
// docs-get_tag_policy-end

// docs-delete_tag_policy-start
export async function deleteTagPolicyExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.tagPolicy("classification").delete();
  console.log("Deleted tag policy");
}
// docs-delete_tag_policy-end
