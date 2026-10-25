# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.7.0", "obstore==0.11.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# claims."python-sdk" = [
#   { journey = "credentials.vend-table", region = "table", api = "generate_temporary_table_credentials" },
#   { journey = "credentials.vend-volume", region = "volume", api = "generate_temporary_volume_credentials" },
#   { journey = "credentials.vend-model-version", region = "model-version", api = "generate_temporary_model_version_credentials" },
#   { journey = "credentials.vend-path", region = "path", api = "generate_temporary_path_credentials" },
# ]
# ///
"""Request temporary S3 credentials for a table, a volume, a model version, and a path.

Start the docs' local server from `uc-docs-env/uc-aws`:

    docker compose up -d --wait

Then run this script:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run temporary_credentials.py
"""

import asyncio
import os
import time

# --8<-- [start:connect]
from datetime import UTC, datetime

import obstore
from obstore.store import S3Store, from_url
from unitycatalog.client import (
    ApiClient,
    Configuration,
    GenerateTemporaryModelVersionCredential,
    GenerateTemporaryPathCredential,
    GenerateTemporaryTableCredential,
    GenerateTemporaryVolumeCredential,
    ModelVersionOperation,
    PathOperation,
    TableOperation,
    TablesApi,
    TemporaryCredentialsApi,
    VolumeOperation,
    VolumesApi,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]

from obstore.exceptions import PermissionDeniedError  # noqa: E402
from unitycatalog.client import (  # noqa: E402
    AwsIamRoleRequest,
    CatalogsApi,
    ColumnInfo,
    ColumnTypeName,
    CreateCatalog,
    CreateCredentialRequest,
    CreateExternalLocation,
    CreateModelVersion,
    CreateRegisteredModel,
    CreateSchema,
    CreateTable,
    CreateVolumeRequestContent,
    CredentialPurpose,
    CredentialsApi,
    DataSourceFormat,
    ExternalLocationsApi,
    FinalizeModelVersion,
    ModelVersionsApi,
    RegisteredModelsApi,
    SchemasApi,
    TableType,
    VolumeType,
)
from unitycatalog.client.exceptions import (  # noqa: E402
    BadRequestException,
    NotFoundException,
)

BUCKET = "s3://amzn-s3-demo-bucket"


async def main() -> None:
    async with ApiClient(config) as api:
        await _seed(api)
        # --8<-- [start:api]
        temp = TemporaryCredentialsApi(api)
        # --8<-- [end:api]

        # --8<-- [start:table]
        table = await TablesApi(api).get_table(full_name="analytics.ops.trips")
        creds = await temp.generate_temporary_table_credentials(
            GenerateTemporaryTableCredential(
                table_id=table.table_id, operation=TableOperation.READ
            )
        )
        print(creds.url, creds.expiration_time)
        # --8<-- [end:table]
        assert creds.url == table.storage_location
        # About an hour, in epoch milliseconds.
        assert 55 * 60 < creds.expiration_time / 1000 - time.time() <= 60 * 60
        await _check_read_only(creds)
        rw = await temp.generate_temporary_table_credentials(
            GenerateTemporaryTableCredential(
                table_id=table.table_id, operation=TableOperation.READ_WRITE
            )
        )
        await _check_writes(rw)

        # --8<-- [start:volume]
        volume = await VolumesApi(api).get_volume(name="analytics.ops.files")
        creds = await temp.generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=volume.volume_id, operation=VolumeOperation.WRITE_VOLUME
            )
        )
        print(creds.url)
        # --8<-- [end:volume]
        assert creds.url == volume.storage_location
        await _check_writes(creds)
        ro = await temp.generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=volume.volume_id, operation=VolumeOperation.READ_VOLUME
            )
        )
        await _check_read_only(ro)

        # --8<-- [start:model-version]
        creds = await temp.generate_temporary_model_version_credentials(
            GenerateTemporaryModelVersionCredential(
                catalog_name="analytics",
                schema_name="ops",
                model_name="churn",
                version=1,
                operation=ModelVersionOperation.READ_MODEL_VERSION,
            )
        )
        print(creds.url)
        # --8<-- [end:model-version]
        await _check_read_only(creds)
        await _check_finalized_is_read_only(temp)

        # --8<-- [start:path]
        creds = await temp.generate_temporary_path_credentials(
            GenerateTemporaryPathCredential(
                url="s3://amzn-s3-demo-bucket/lake/landing",
                operation=PathOperation.PATH_READ_WRITE,
            )
        )
        print(creds.url)
        # --8<-- [end:path]
        await _check_writes(creds)
        await _check_path_outside_location(temp)

        # --8<-- [start:store]
        aws = creds.aws_temp_credentials
        store = from_url(
            creds.url,
            access_key_id=aws.access_key_id,
            secret_access_key=aws.secret_access_key,
            session_token=aws.session_token,
            region="us-east-1",
        )
        await obstore.put_async(store, "events.json", b'{"event": "signup"}\n')
        print([meta["path"] for meta in await obstore.list(store).collect_async()])
        # --8<-- [end:store]

        calls = _count_calls(temp, "generate_temporary_volume_credentials")

        # --8<-- [start:refresh]
        async def volume_credentials():
            creds = await temp.generate_temporary_volume_credentials(
                GenerateTemporaryVolumeCredential(
                    volume_id=volume.volume_id, operation=VolumeOperation.WRITE_VOLUME
                )
            )
            aws = creds.aws_temp_credentials
            return {
                "access_key_id": aws.access_key_id,
                "secret_access_key": aws.secret_access_key,
                "token": aws.session_token,
                "expires_at": datetime.fromtimestamp(
                    creds.expiration_time / 1000, tz=UTC
                ),
            }

        store = S3Store.from_url(
            volume.storage_location,
            region="us-east-1",
            credential_provider=volume_credentials,
        )
        for name in ("a.txt", "b.txt", "c.txt"):
            await obstore.put_async(store, name, b"refreshed as needed\n")
        # --8<-- [end:refresh]
        # obstore caches the credential until expires_at instead of asking again.
        assert len(calls) == 1, len(calls)

        await _check_local_storage(api, temp)


async def _check_read_only(creds) -> None:
    """A read credential lists the object's files and can't write them."""
    store = _store(creds, creds.url)
    await obstore.list(store).collect_async()
    try:
        await obstore.put_async(store, "probe.txt", b"no")
    except PermissionDeniedError:
        pass
    else:
        raise AssertionError(f"a read credential wrote to {creds.url}")


async def _check_writes(creds) -> None:
    """A write credential writes under its URL and nowhere else."""
    await obstore.put_async(_store(creds, creds.url), "probe.txt", b"ok")
    try:
        await obstore.put_async(
            _store(creds, BUCKET), "lake/elsewhere/probe.txt", b"no"
        )
    except PermissionDeniedError:
        pass
    else:
        raise AssertionError(f"a credential for {creds.url} wrote outside it")


async def _check_finalized_is_read_only(temp: TemporaryCredentialsApi) -> None:
    """The page says write credentials end when a version is finalized."""
    try:
        await temp.generate_temporary_model_version_credentials(
            GenerateTemporaryModelVersionCredential(
                catalog_name="analytics",
                schema_name="ops",
                model_name="churn",
                version=1,
                operation=ModelVersionOperation.READ_WRITE_MODEL_VERSION,
            )
        )
    except BadRequestException as exc:
        assert "has been finalized" in str(exc.body), exc.body
    else:
        raise AssertionError("a finalized model version got write credentials")


async def _check_path_outside_location(temp: TemporaryCredentialsApi) -> None:
    try:
        await temp.generate_temporary_path_credentials(
            GenerateTemporaryPathCredential(
                url=f"{BUCKET}/elsewhere", operation=PathOperation.PATH_READ
            )
        )
    except BadRequestException as exc:
        assert "S3 bucket configuration not found" in str(exc.body), exc.body
    else:
        raise AssertionError("a path outside every external location was vended")


async def _check_local_storage(api: ApiClient, temp: TemporaryCredentialsApi) -> None:
    """A `file://` table gets its URL back and no keys."""
    table = await TablesApi(api).create_table(
        _table("local_trips", "file:///tmp/uc-docs/local_trips")
    )
    creds = await temp.generate_temporary_table_credentials(
        GenerateTemporaryTableCredential(
            table_id=table.table_id, operation=TableOperation.READ
        )
    )
    assert creds.url == "file:///tmp/uc-docs/local_trips", creds
    assert creds.aws_temp_credentials is None and creds.expiration_time is None, creds


def _count_calls(api, method: str) -> list:
    calls = []
    original = getattr(api, method)

    async def counted(*args, **kwargs):
        calls.append(args)
        return await original(*args, **kwargs)

    setattr(api, method, counted)
    return calls


def _store(creds, url: str):
    aws = creds.aws_temp_credentials
    return from_url(
        url,
        access_key_id=aws.access_key_id,
        secret_access_key=aws.secret_access_key,
        session_token=aws.session_token,
        region="us-east-1",
    )


def _table(name: str, location: str) -> CreateTable:
    return CreateTable(
        name=name,
        catalog_name="analytics",
        schema_name="ops",
        table_type=TableType.EXTERNAL,
        data_source_format=DataSourceFormat.DELTA,
        columns=[
            ColumnInfo(
                name="id",
                type_name=ColumnTypeName.LONG,
                type_text="bigint",
                type_json='{"name":"id","type":"long","nullable":true,"metadata":{}}',
                position=0,
                nullable=True,
            )
        ],
        storage_location=location,
    )


async def _seed(api: ApiClient) -> None:
    """The objects the page assumes: one of each kind, under external location `lake`."""
    credentials = CredentialsApi(api)
    locations = ExternalLocationsApi(api)
    catalogs = CatalogsApi(api)
    for delete in (
        catalogs.delete_catalog(name="analytics", force=True),
        locations.delete_external_location(name="lake", force=True),
        credentials.delete_credential(name="lake_storage", force=True),
    ):
        try:
            await delete
        except NotFoundException:
            pass
    await credentials.create_credential(
        CreateCredentialRequest(
            name="lake_storage",
            purpose=CredentialPurpose.STORAGE,
            aws_iam_role=AwsIamRoleRequest(
                role_arn="arn:aws:iam::123456789012:role/uc-storage-lake"
            ),
        )
    )
    await locations.create_external_location(
        CreateExternalLocation(
            name="lake", url=f"{BUCKET}/lake", credential_name="lake_storage"
        )
    )
    await catalogs.create_catalog(
        CreateCatalog(name="analytics", storage_root=f"{BUCKET}/lake/analytics")
    )
    await SchemasApi(api).create_schema(
        CreateSchema(name="ops", catalog_name="analytics")
    )
    await TablesApi(api).create_table(_table("trips", f"{BUCKET}/lake/tables/trips"))
    await VolumesApi(api).create_volume(
        CreateVolumeRequestContent(
            name="files",
            catalog_name="analytics",
            schema_name="ops",
            volume_type=VolumeType.MANAGED,
        )
    )
    await RegisteredModelsApi(api).create_registered_model(
        CreateRegisteredModel(name="churn", catalog_name="analytics", schema_name="ops")
    )
    versions = ModelVersionsApi(api)
    version = await versions.create_model_version(
        CreateModelVersion(
            model_name="churn",
            catalog_name="analytics",
            schema_name="ops",
            source="models:/churn",
        )
    )
    await versions.finalize_model_version(
        full_name="analytics.ops.churn",
        version=version.version,
        finalize_model_version=FinalizeModelVersion(
            full_name="analytics.ops.churn", version=version.version
        ),
    )


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
