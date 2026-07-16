# docs-list_catalogs-start
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
catalogs = client.list_catalogs()
for catalog in catalogs:
    print(catalog.name)
# docs-list_catalogs-end


# docs-create_catalog-start
def create_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    catalog = client.create_catalog("my_catalog", comment="My first catalog")
    print(f"Created: {catalog.name}")


# docs-create_catalog-end


# docs-get_catalog-start
def get_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    catalog = client.catalog("my_catalog").get()
    print(f"Got: {catalog.name}")


# docs-get_catalog-end


# docs-update_catalog-start
def update_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    catalog = client.catalog("my_catalog").update(comment="Updated comment")
    print(f"Updated: {catalog.name}")


# docs-update_catalog-end


# docs-delete_catalog-start
def delete_catalog_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    client.catalog("my_catalog").delete()
    print("Deleted catalog")


# docs-delete_catalog-end
