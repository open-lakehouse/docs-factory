import { UnityCatalogClient } from "@unitycatalog/client";

// docs-list_registered_models-start
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
// docs-list_registered_models-end

// docs-create_registered_model-start
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
// docs-create_registered_model-end

// docs-get_registered_model-start
export async function getRegisteredModelExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const model = await client
    .registeredModel("my_catalog", "my_schema", "my_model")
    .get();
  console.log(`Got: ${model.name}`);
}
// docs-get_registered_model-end

// docs-create_model_version-start
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
// docs-create_model_version-end

// docs-finalize_model_version-start
export async function finalizeModelVersionExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  // Once all artifacts are written, finalize to transition the version to READY.
  const version = await client.finalizeModelVersion(
    "my_catalog.my_schema.my_model",
    1,
  );
  console.log(`Finalized version ${version.version}`);
}
// docs-finalize_model_version-end

// docs-list_model_versions-start
export async function listModelVersionsExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const versions = await client.listModelVersions(
    "my_catalog.my_schema.my_model",
  );
  for (const version of versions) {
    console.log(`version ${version.version}`);
  }
}
// docs-list_model_versions-end
