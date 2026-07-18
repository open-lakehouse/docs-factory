import { UnityCatalogClient } from "@unitycatalog/client";

// --8<-- [start:list_tables]
export async function listTablesExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const tables = await client.listTables("my_catalog", "my_schema");
  for (const table of tables) {
    console.log(table.name);
  }
}
// --8<-- [end:list_tables]

// --8<-- [start:create_table]
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
// --8<-- [end:create_table]

// --8<-- [start:get_table]
export async function getTableExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const table = await client.table("my_catalog.my_schema.my_table").get();
  console.log(`Got: ${table.name}`);
}
// --8<-- [end:get_table]

// --8<-- [start:delete_table]
export async function deleteTableExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.table("my_catalog.my_schema.my_table").delete();
  console.log("Deleted table");
}
// --8<-- [end:delete_table]
