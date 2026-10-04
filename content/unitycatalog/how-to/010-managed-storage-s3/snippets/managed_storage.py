# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0", "obstore==0.11.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.aws.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Give a catalog and a schema S3 storage roots and see where managed data lands.

docker compose -f compose.aws.yaml up -d --wait   # from envs/unitycatalog
AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run snippets/managed_storage.py
"""

import asyncio
import os

import obstore

# --8<-- [start:connect]
from obstore.store import from_url
from unitycatalog.client import (
    ApiClient,
    AwsIamRoleRequest,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateCredentialRequest,
    CreateExternalLocation,
    CreateSchema,
    CreateVolumeRequestContent,
    CredentialPurpose,
    CredentialsApi,
    ExternalLocationsApi,
    GenerateTemporaryVolumeCredential,
    SchemasApi,
    TemporaryCredentialsApi,
    VolumeOperation,
    VolumesApi,
    VolumeType,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]

from unitycatalog.client.exceptions import (  # noqa: E402
    BadRequestException,
    NotFoundException,
)


async def main() -> None:
    async with ApiClient(config) as api:
        await _reset(api)

        # --8<-- [start:location]
        await CredentialsApi(api).create_credential(
            CreateCredentialRequest(
                name="lake_storage",
                purpose=CredentialPurpose.STORAGE,
                aws_iam_role=AwsIamRoleRequest(
                    role_arn="arn:aws:iam::123456789012:role/uc-storage-lake"
                ),
            )
        )
        await ExternalLocationsApi(api).create_external_location(
            CreateExternalLocation(
                name="lake", url="s3://uc-docs/lake", credential_name="lake_storage"
            )
        )
        # --8<-- [end:location]

        # --8<-- [start:catalog-root]
        sales = await CatalogsApi(api).create_catalog(
            CreateCatalog(name="sales", storage_root="s3://uc-docs/lake/sales")
        )
        print(sales.storage_location)
        # s3://uc-docs/lake/sales/__unitystorage/catalogs/<catalog id>
        # --8<-- [end:catalog-root]

        # --8<-- [start:schema-root]
        schemas = SchemasApi(api)
        await schemas.create_schema(CreateSchema(name="raw", catalog_name="sales"))
        curated = await schemas.create_schema(
            CreateSchema(
                name="curated",
                catalog_name="sales",
                storage_root="s3://uc-docs/lake/curated",
            )
        )
        print(curated.storage_location)
        # s3://uc-docs/lake/curated/__unitystorage/schemas/<schema id>
        # --8<-- [end:schema-root]

        # --8<-- [start:managed-volume]
        volumes = VolumesApi(api)
        drops = await volumes.create_volume(
            CreateVolumeRequestContent(
                catalog_name="sales",
                schema_name="raw",
                name="drops",
                volume_type=VolumeType.MANAGED,
            )
        )
        reports = await volumes.create_volume(
            CreateVolumeRequestContent(
                catalog_name="sales",
                schema_name="curated",
                name="reports",
                volume_type=VolumeType.MANAGED,
            )
        )
        print(drops.storage_location)  # under the catalog's root
        print(reports.storage_location)  # under the schema's root
        # --8<-- [end:managed-volume]
        assert drops.storage_location.startswith(f"{sales.storage_location}/volumes/")
        assert reports.storage_location.startswith(
            f"{curated.storage_location}/volumes/"
        )

        # --8<-- [start:write]
        vended = await TemporaryCredentialsApi(
            api
        ).generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=reports.volume_id, operation=VolumeOperation.WRITE_VOLUME
            )
        )
        aws = vended.aws_temp_credentials
        store = from_url(
            vended.url,
            access_key_id=aws.access_key_id,
            secret_access_key=aws.secret_access_key,
            session_token=aws.session_token,
            region="us-east-1",
        )
        await obstore.put_async(
            store, "2026-10/daily.csv", b"day,total\n2026-10-01,42\n"
        )
        # --8<-- [end:write]
        listed = await obstore.list(store).collect_async()
        assert [m["path"] for m in listed] == ["2026-10/daily.csv"], listed

        await _check_reserved_prefix(volumes)
        await _check_uncovered_root(api)

        # --8<-- [start:clean-up]
        await CatalogsApi(api).delete_catalog(name="sales", force=True)
        # --8<-- [end:clean-up]
        await _reset(api)


async def _check_reserved_prefix(volumes: VolumesApi) -> None:
    try:
        await volumes.create_volume(
            CreateVolumeRequestContent(
                catalog_name="sales",
                schema_name="raw",
                name="sneaky",
                volume_type=VolumeType.EXTERNAL,
                storage_location="s3://uc-docs/lake/sales/__unitystorage/sneaky",
            )
        )
    except BadRequestException as exc:
        assert "__unitystorage" in str(exc.body), exc.body
    else:
        raise AssertionError("external volume inside __unitystorage was accepted")


async def _check_uncovered_root(api: ApiClient) -> None:
    """Pins the page's warning: with authorization disabled, a root outside every
    external location is accepted, and vending under it fails later."""
    await CatalogsApi(api).create_catalog(
        CreateCatalog(name="stray", storage_root="s3://uc-docs/elsewhere")
    )
    await SchemasApi(api).create_schema(
        CreateSchema(name="files", catalog_name="stray")
    )
    volume = await VolumesApi(api).create_volume(
        CreateVolumeRequestContent(
            catalog_name="stray",
            schema_name="files",
            name="v",
            volume_type=VolumeType.MANAGED,
        )
    )
    try:
        await TemporaryCredentialsApi(api).generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=volume.volume_id, operation=VolumeOperation.READ_VOLUME
            )
        )
    except BadRequestException as exc:
        assert "FAILED_PRECONDITION" in str(exc.body), exc.body
    else:
        raise AssertionError("vending succeeded for a root outside every location")


async def _reset(api: ApiClient) -> None:
    for delete in (
        CatalogsApi(api).delete_catalog(name="sales", force=True),
        CatalogsApi(api).delete_catalog(name="stray", force=True),
        ExternalLocationsApi(api).delete_external_location(name="lake", force=True),
        CredentialsApi(api).delete_credential(name="lake_storage", force=True),
    ):
        try:
            await delete
        except NotFoundException:
            pass


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
