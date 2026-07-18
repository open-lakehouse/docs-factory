import { UnityCatalogClient } from "@unitycatalog/client";

// --8<-- [start:list_schemas]
export async function listSchemasExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schemas = await client.listSchemas("my_catalog");
  for (const schema of schemas) {
    console.log(schema.name);
  }
}
// --8<-- [end:list_schemas]

// --8<-- [start:create_schema]
export async function createSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schema = await client.createSchema("my_schema", "my_catalog", {
    comment: "My first schema",
  });
  console.log(`Created: ${schema.catalogName}.${schema.name}`);
}
// --8<-- [end:create_schema]

// --8<-- [start:get_schema]
export async function getSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schema = await client.schema("my_catalog", "my_schema").get();
  console.log(`Got: ${schema.catalogName}.${schema.name}`);
}
// --8<-- [end:get_schema]

// --8<-- [start:update_schema]
export async function updateSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schema = await client.schema("my_catalog", "my_schema").update({
    comment: "Updated comment",
  });
  console.log(`Updated: ${schema.catalogName}.${schema.name}`);
}
// --8<-- [end:update_schema]

// --8<-- [start:delete_schema]
export async function deleteSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.schema("my_catalog", "my_schema").delete();
  console.log("Deleted schema");
}
// --8<-- [end:delete_schema]
