import { UnityCatalogClient } from "@unitycatalog/client";

// docs-list_schemas-start
export async function listSchemasExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schemas = await client.listSchemas("my_catalog");
  for (const schema of schemas) {
    console.log(schema.name);
  }
}
// docs-list_schemas-end

// docs-create_schema-start
export async function createSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schema = await client.createSchema("my_schema", "my_catalog", {
    comment: "My first schema",
  });
  console.log(`Created: ${schema.catalogName}.${schema.name}`);
}
// docs-create_schema-end

// docs-get_schema-start
export async function getSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schema = await client.schema("my_catalog", "my_schema").get();
  console.log(`Got: ${schema.catalogName}.${schema.name}`);
}
// docs-get_schema-end

// docs-update_schema-start
export async function updateSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const schema = await client.schema("my_catalog", "my_schema").update({
    comment: "Updated comment",
  });
  console.log(`Updated: ${schema.catalogName}.${schema.name}`);
}
// docs-update_schema-end

// docs-delete_schema-start
export async function deleteSchemaExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.schema("my_catalog", "my_schema").delete();
  console.log("Deleted schema");
}
// docs-delete_schema-end
