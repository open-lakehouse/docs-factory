# docs-list_tables-start
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
tables = client.list_tables("my_catalog", "my_schema")
for table in tables:
    print(table.name)
# docs-list_tables-end


# docs-create_table-start
def create_table_example() -> None:
    from unitycatalog_client import DataSourceFormat, TableType, UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    table = client.create_table(
        "my_table",
        "my_schema",
        "my_catalog",
        TableType.MANAGED,
        DataSourceFormat.DELTA,
        comment="My first table",
    )
    print(f"Created: {table.name}")


# docs-create_table-end


# docs-get_table-start
def get_table_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    table = client.table("my_catalog.my_schema.my_table").get()
    print(f"Got: {table.name}")


# docs-get_table-end


# docs-delete_table-start
def delete_table_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    client.table("my_catalog.my_schema.my_table").delete()
    print("Deleted table")


# docs-delete_table-end
