# docs-list_schemas-start
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
schemas = client.list_schemas("my_catalog")
for schema in schemas:
    print(schema.name)
# docs-list_schemas-end


# docs-create_schema-start
def create_schema_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    schema = client.create_schema("my_schema", "my_catalog", comment="My first schema")
    print(f"Created: {schema.catalog_name}.{schema.name}")


# docs-create_schema-end


# docs-get_schema-start
def get_schema_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    schema = client.schema("my_catalog", "my_schema").get()
    print(f"Got: {schema.catalog_name}.{schema.name}")


# docs-get_schema-end


# docs-update_schema-start
def update_schema_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    schema = client.schema("my_catalog", "my_schema").update(comment="Updated comment")
    print(f"Updated: {schema.catalog_name}.{schema.name}")


# docs-update_schema-end


# docs-delete_schema-start
def delete_schema_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    client.schema("my_catalog", "my_schema").delete()
    print("Deleted schema")


# docs-delete_schema-end
