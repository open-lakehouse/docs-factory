import { UnityCatalogClient } from "@unitycatalog/client";

// --8<-- [start:list_tag_policies]
export async function listTagPoliciesExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const policies = await client.listTagPolicies();
  for (const policy of policies) {
    console.log(policy.tagKey);
  }
}
// --8<-- [end:list_tag_policies]

// --8<-- [start:get_tag_policy]
export async function getTagPolicyExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const policy = await client.tagPolicy("classification").get();
  console.log(`Got: ${policy.tagKey}`);
}
// --8<-- [end:get_tag_policy]

// --8<-- [start:delete_tag_policy]
export async function deleteTagPolicyExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.tagPolicy("classification").delete();
  console.log("Deleted tag policy");
}
// --8<-- [end:delete_tag_policy]
