"""Shared setup for this page's scripts: a fresh `retail.sales.orders` external table.

Not a test on its own (no PEP 723 block); each script imports it, so their
dependencies must cover `unitycatalog-client`, `deltalake`, and `pyarrow`.
"""

import json

import pyarrow as pa
from deltalake import DeltaTable, write_deltalake
from unitycatalog.client import (
    ApiClient,
    AwsIamRoleRequest,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateCredentialRequest,
    CreateExternalLocation,
    CreateSchema,
    CreateTable,
    CredentialPurpose,
    CredentialsApi,
    ExternalLocationsApi,
    SchemasApi,
    TablesApi,
)
from unitycatalog.client.exceptions import NotFoundException
from unitycatalog.client.models import (
    ColumnInfo,
    ColumnTypeName,
    DataSourceFormat,
    TableType,
)

UC_URL = "http://localhost:8080"

# Stands in for the service that owns the data; readers on the page never use it.
S3_ROOT_KEYS = {
    "aws_access_key_id": "aws-sim-root",
    "aws_secret_access_key": "aws-sim-root-secret",
    "aws_region": "us-east-1",
}

ORDERS = pa.table(
    {
        "order_id": pa.array([1, 2, 3], pa.int64()),
        "customer": ["ada", "grace", "linus"],
        "amount": [9.5, 20.0, 3.25],
    }
)

DELTA_TO_UC = {
    "long": (ColumnTypeName.LONG, "bigint"),
    "string": (ColumnTypeName.STRING, "string"),
    "double": (ColumnTypeName.DOUBLE, "double"),
}


async def seed_orders(
    location: str, storage_options: dict[str, str] | None = None
) -> None:
    """Write ORDERS at `location` and register it as `retail.sales.orders`."""
    write_deltalake(location, ORDERS, mode="overwrite", storage_options=storage_options)
    fields = json.loads(
        DeltaTable(location, storage_options=storage_options).schema().to_json()
    )["fields"]
    columns = [
        ColumnInfo(
            name=f["name"],
            type_name=DELTA_TO_UC[f["type"]][0],
            type_text=DELTA_TO_UC[f["type"]][1],
            type_json=json.dumps(f),
            position=i,
            nullable=f["nullable"],
        )
        for i, f in enumerate(fields)
    ]
    config = Configuration(host=f"{UC_URL}/api/2.1/unity-catalog")
    async with ApiClient(config) as api:
        if location.startswith("s3://"):
            await _ensure_external_location(api, location.rsplit("/", 1)[0])
        catalogs = CatalogsApi(api)
        try:
            await catalogs.delete_catalog(name="retail", force=True)
        except NotFoundException:
            pass
        await catalogs.create_catalog(CreateCatalog(name="retail"))
        await SchemasApi(api).create_schema(
            CreateSchema(name="sales", catalog_name="retail")
        )
        await TablesApi(api).create_table(
            CreateTable(
                name="orders",
                catalog_name="retail",
                schema_name="sales",
                table_type=TableType.EXTERNAL,
                data_source_format=DataSourceFormat.DELTA,
                storage_location=location,
                columns=columns,
            )
        )


async def _ensure_external_location(api: ApiClient, url: str) -> None:
    """Let the server vend S3 credentials under `url`, as an admin sets it up on AWS."""
    locations = ExternalLocationsApi(api)
    credentials = CredentialsApi(api)
    for loc in (await locations.list_external_locations()).external_locations or []:
        if loc.name == "retail_data":
            return
    existing = (await credentials.list_credentials()).credentials or []
    if "retail_storage" not in [c.name for c in existing]:
        await credentials.create_credential(
            CreateCredentialRequest(
                name="retail_storage",
                purpose=CredentialPurpose.STORAGE,
                aws_iam_role=AwsIamRoleRequest(
                    role_arn="arn:aws:iam::123456789012:role/uc-storage-retail"
                ),
            )
        )
    await locations.create_external_location(
        CreateExternalLocation(
            name="retail_data", url=url, credential_name="retail_storage"
        )
    )
