# docs-list_volumes-start
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
volumes = client.list_volumes("my_catalog", "my_schema")
for volume in volumes:
    print(volume.name)
# docs-list_volumes-end


# docs-create_volume-start
def create_volume_example() -> None:
    from unitycatalog_client import UnityCatalogClient, VolumeType

    client = UnityCatalogClient(base_url="http://localhost:8080")
    volume = client.create_volume(
        "my_catalog",
        "my_schema",
        "my_volume",
        VolumeType.VOLUME_TYPE_MANAGED,
        comment="My first volume",
    )
    print(f"Created: {volume.name}")


# docs-create_volume-end


# docs-get_volume-start
def get_volume_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    volume = client.volume("my_catalog", "my_schema", "my_volume").get()
    print(f"Got: {volume.name}")


# docs-get_volume-end


# docs-update_volume-start
def update_volume_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    volume = client.volume("my_catalog", "my_schema", "my_volume").update(
        comment="Updated comment"
    )
    print(f"Updated: {volume.name}")


# docs-update_volume-end


# docs-delete_volume-start
def delete_volume_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    client.volume("my_catalog", "my_schema", "my_volume").delete()
    print("Deleted volume")


# docs-delete_volume-end
