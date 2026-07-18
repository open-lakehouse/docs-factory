import { UnityCatalogClient } from "@unitycatalog/client";

// --8<-- [start:list_catalogs]
export async function listCatalogsExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalogs = await client.listCatalogs();
  for (const catalog of catalogs) {
    console.log(catalog.name);
  }
}
// --8<-- [end:list_catalogs]

// --8<-- [start:create_catalog]
export async function createCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalog = await client.createCatalog("my_catalog", {
    comment: "My first catalog",
  });
  console.log(`Created: ${catalog.name}`);
}
// --8<-- [end:create_catalog]

// --8<-- [start:get_catalog]
export async function getCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalog = await client.catalog("my_catalog").get();
  console.log(`Got: ${catalog.name}`);
}
// --8<-- [end:get_catalog]

// --8<-- [start:update_catalog]
export async function updateCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalog = await client.catalog("my_catalog").update({
    comment: "Updated comment",
  });
  console.log(`Updated: ${catalog.name}`);
}
// --8<-- [end:update_catalog]

// --8<-- [start:delete_catalog]
export async function deleteCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.catalog("my_catalog").delete();
  console.log("Deleted catalog");
}
// --8<-- [end:delete_catalog]
