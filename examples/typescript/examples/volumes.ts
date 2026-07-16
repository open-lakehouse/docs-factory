import { UnityCatalogClient } from "@unitycatalog/client";

// docs-list_volumes-start
export async function listVolumesExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const volumes = await client.listVolumes("my_catalog", "my_schema");
  for (const volume of volumes) {
    console.log(volume.name);
  }
}
// docs-list_volumes-end

// docs-create_volume-start
export async function createVolumeExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  // volumeType: 1 = MANAGED
  const volume = await client.createVolume(
    "my_catalog",
    "my_schema",
    "my_volume",
    1,
    { comment: "My first volume" },
  );
  console.log(`Created: ${volume.name}`);
}
// docs-create_volume-end

// docs-get_volume-start
export async function getVolumeExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const volume = await client
    .volume("my_catalog", "my_schema", "my_volume")
    .get();
  console.log(`Got: ${volume.name}`);
}
// docs-get_volume-end

// docs-update_volume-start
export async function updateVolumeExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  const volume = await client
    .volume("my_catalog", "my_schema", "my_volume")
    .update({ comment: "Updated comment" });
  console.log(`Updated: ${volume.name}`);
}
// docs-update_volume-end

// docs-delete_volume-start
export async function deleteVolumeExample(): Promise<void> {
  const client = new UnityCatalogClient("http://localhost:8080");
  await client.volume("my_catalog", "my_schema", "my_volume").delete();
  console.log("Deleted volume");
}
// docs-delete_volume-end
