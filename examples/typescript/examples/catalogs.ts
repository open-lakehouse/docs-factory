import { UnityCatalogClient } from "@unitycatalog/client";

// docs-list_catalogs-start
export async function listCatalogsExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalogs = await client.listCatalogs();
  for (const catalog of catalogs) {
    console.log(catalog.name);
  }
}
// docs-list_catalogs-end

// docs-create_catalog-start
export async function createCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalog = await client.createCatalog("my_catalog", {
    comment: "My first catalog",
  });
  console.log(`Created: ${catalog.name}`);
}
// docs-create_catalog-end

// docs-get_catalog-start
export async function getCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalog = await client.catalog("my_catalog").get();
  console.log(`Got: ${catalog.name}`);
}
// docs-get_catalog-end

// docs-update_catalog-start
export async function updateCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const catalog = await client.catalog("my_catalog").update({
    comment: "Updated comment",
  });
  console.log(`Updated: ${catalog.name}`);
}
// docs-update_catalog-end

// docs-delete_catalog-start
export async function deleteCatalogExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.catalog("my_catalog").delete();
  console.log("Deleted catalog");
}
// docs-delete_catalog-end
