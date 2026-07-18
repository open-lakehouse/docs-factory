# --8<-- [start:list_registered_models]
from unitycatalog_client import UnityCatalogClient

client = UnityCatalogClient(base_url="http://localhost:8080")
models = client.list_registered_models(
    catalog_name="my_catalog", schema_name="my_schema"
)
for model in models:
    print(model.name)
# --8<-- [end:list_registered_models]


# --8<-- [start:create_registered_model]
def create_registered_model_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    model = client.create_registered_model(
        name="my_model",
        catalog_name="my_catalog",
        schema_name="my_schema",
        comment="My first model",
    )
    print(f"Created: {model.full_name}")


# --8<-- [end:create_registered_model]


# --8<-- [start:get_registered_model]
def get_registered_model_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    model = client.registered_model("my_catalog", "my_schema", "my_model").get()
    print(f"Got: {model.name}")


# --8<-- [end:get_registered_model]


# --8<-- [start:create_model_version]
def create_model_version_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    # A new version starts in PENDING_REGISTRATION. Write your artifacts to the
    # returned storage_location (vending credentials as needed), then finalize.
    version = client.create_model_version(
        model_name="my_model",
        catalog_name="my_catalog",
        schema_name="my_schema",
        source="s3://my-run/artifacts",
    )
    print(f"Created version {version.version}")


# --8<-- [end:create_model_version]


# --8<-- [start:finalize_model_version]
def finalize_model_version_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    # Once all artifacts are written, finalize to transition the version to READY.
    version = client.finalize_model_version("my_catalog.my_schema.my_model", 1)
    print(f"Finalized version {version.version}")


# --8<-- [end:finalize_model_version]


# --8<-- [start:list_model_versions]
def list_model_versions_example() -> None:
    from unitycatalog_client import UnityCatalogClient

    client = UnityCatalogClient(base_url="http://localhost:8080")
    versions = client.list_model_versions("my_catalog.my_schema.my_model")
    for version in versions:
        print(f"version {version.version}")


# --8<-- [end:list_model_versions]
