import { UnityCatalogClient } from "@unitycatalog/client";

// --8<-- [start:list_registered_models]
export async function listRegisteredModelsExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const models = await client.listRegisteredModels({
    catalogName: "my_catalog",
    schemaName: "my_schema",
  });
  for (const model of models) {
    console.log(model.name);
  }
}
// --8<-- [end:list_registered_models]

// --8<-- [start:create_registered_model]
export async function createRegisteredModelExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const model = await client.createRegisteredModel(
    "my_model",
    "my_catalog",
    "my_schema",
    { comment: "My first model" },
  );
  console.log(`Created: ${model.fullName}`);
}
// --8<-- [end:create_registered_model]

// --8<-- [start:get_registered_model]
export async function getRegisteredModelExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const model = await client
    .registeredModel("my_catalog", "my_schema", "my_model")
    .get();
  console.log(`Got: ${model.name}`);
}
// --8<-- [end:get_registered_model]

// --8<-- [start:create_model_version]
export async function createModelVersionExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  // A new version starts in PENDING_REGISTRATION. Write your artifacts to the
  // returned storageLocation (vending credentials as needed), then finalize.
  const version = await client.createModelVersion(
    "my_model",
    "my_catalog",
    "my_schema",
    "s3://my-run/artifacts",
  );
  console.log(`Created version ${version.version}`);
}
// --8<-- [end:create_model_version]

// --8<-- [start:finalize_model_version]
export async function finalizeModelVersionExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  // Once all artifacts are written, finalize to transition the version to READY.
  const version = await client.finalizeModelVersion(
    "my_catalog.my_schema.my_model",
    1,
  );
  console.log(`Finalized version ${version.version}`);
}
// --8<-- [end:finalize_model_version]

// --8<-- [start:list_model_versions]
export async function listModelVersionsExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const versions = await client.listModelVersions(
    "my_catalog.my_schema.my_model",
  );
  for (const version of versions) {
    console.log(`version ${version.version}`);
  }
}
// --8<-- [end:list_model_versions]
