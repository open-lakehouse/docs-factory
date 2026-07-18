# --8<-- [start:list_catalogs]
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
catalogs = client.list_catalogs()
for catalog in catalogs:
    print(catalog.name)
# --8<-- [end:list_catalogs]


# --8<-- [start:create_catalog]
def create_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    catalog = client.create_catalog("my_catalog", comment="My first catalog")
    print(f"Created: {catalog.name}")


# --8<-- [end:create_catalog]


# --8<-- [start:get_catalog]
def get_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    catalog = client.catalog("my_catalog").get()
    print(f"Got: {catalog.name}")


# --8<-- [end:get_catalog]


# --8<-- [start:update_catalog]
def update_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    catalog = client.catalog("my_catalog").update(comment="Updated comment")
    print(f"Updated: {catalog.name}")


# --8<-- [end:update_catalog]


# --8<-- [start:delete_catalog]
def delete_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    client.catalog("my_catalog").delete()
    print("Deleted catalog")


# --8<-- [end:delete_catalog]
