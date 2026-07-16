import { UnityCatalogClient } from "@unitycatalog/client";

// docs-list_tables-start
export async function listTablesExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const tables = await client.listTables("my_catalog", "my_schema");
  for (const table of tables) {
    console.log(table.name);
  }
}
// docs-list_tables-end

// docs-create_table-start
export async function createTableExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  // tableType: 1 = MANAGED, dataSourceFormat: 1 = DELTA
  const table = await client.createTable(
    "my_table",
    "my_schema",
    "my_catalog",
    1,
    1,
    { comment: "My first table" },
  );
  console.log(`Created: ${table.name}`);
}
// docs-create_table-end

// docs-get_table-start
export async function getTableExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const table = await client.table("my_catalog.my_schema.my_table").get();
  console.log(`Got: ${table.name}`);
}
// docs-get_table-end

// docs-delete_table-start
export async function deleteTableExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.table("my_catalog.my_schema.my_table").delete();
  console.log("Deleted table");
}
// docs-delete_table-end
