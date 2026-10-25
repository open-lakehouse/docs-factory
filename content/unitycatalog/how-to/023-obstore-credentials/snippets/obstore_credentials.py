# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.7.0", "obstore==0.11.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Give obstore a credential provider that asks Unity Catalog for S3 credentials.

Start the docs' local server from `uc-docs-env/uc-aws`:

    docker compose up -d --wait

Then run this script:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run obstore_credentials.py
"""

# --8<-- [start:connect]
import asyncio
import threading
from datetime import UTC, datetime

import obstore
from obstore.store import S3Store
from unitycatalog.client import (
    ApiClient,
    Configuration,
    GenerateTemporaryTableCredential,
    GenerateTemporaryVolumeCredential,
    TableOperation,
    TablesApi,
    TemporaryCredentialsApi,
    VolumeOperation,
    VolumesApi,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]


# --8<-- [start:provider]
class UnityCatalogCredentials:
    """An obstore credential provider that asks Unity Catalog for S3 credentials.

    `request` is an async function that takes an `ApiClient` and returns the
    server's `TemporaryCredentials`. It runs on an event loop of its own, in a
    background thread, so obstore can call the provider from sync methods,
    async methods, and threads without a loop alike.
    """

    def __init__(self, config, request):
        self._request = request
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True).start()
        self._api = self._run(self._connect(config))
        # The first answer gives the store its URL, and a missing grant fails here.
        self._first = self._run(request(self._api))
        self.url = self._first.url

    @staticmethod
    async def _connect(config):
        return ApiClient(config)

    def _run(self, coroutine):
        return asyncio.run_coroutine_threadsafe(coroutine, self._loop).result()

    def __call__(self):
        creds = self._first or self._run(self._request(self._api))
        self._first = None
        aws = creds.aws_temp_credentials
        return {
            "access_key_id": aws.access_key_id,
            "secret_access_key": aws.secret_access_key,
            "token": aws.session_token,
            # expiration_time is in epoch milliseconds.
            "expires_at": datetime.fromtimestamp(creds.expiration_time / 1000, tz=UTC),
        }

    def close(self):
        self._run(self._api.close())
        self._loop.call_soon_threadsafe(self._loop.stop)


# --8<-- [end:provider]


import os  # noqa: E402
import subprocess  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402

from obstore.exceptions import PermissionDeniedError  # noqa: E402
from unitycatalog.client import (  # noqa: E402
    AwsIamRoleRequest,
    CatalogsApi,
    ColumnInfo,
    ColumnTypeName,
    CreateCatalog,
    CreateCredentialRequest,
    CreateExternalLocation,
    CreateSchema,
    CreateTable,
    CreateVolumeRequestContent,
    CredentialPurpose,
    CredentialsApi,
    DataSourceFormat,
    ExternalLocationsApi,
    SchemasApi,
    TableType,
    VolumeType,
)
from unitycatalog.client.exceptions import NotFoundException  # noqa: E402

BUCKET = "s3://amzn-s3-demo-bucket"
vends: list[float] = []


def main() -> None:
    _count_vends()

    # --8<-- [start:volume]
    async def write_files(api):
        volume = await VolumesApi(api).get_volume(name="analytics.ops.files")
        return await TemporaryCredentialsApi(api).generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=volume.volume_id, operation=VolumeOperation.WRITE_VOLUME
            )
        )

    credentials = UnityCatalogCredentials(config, write_files)
    files = S3Store.from_url(
        credentials.url, region="us-east-1", credential_provider=credentials
    )
    # --8<-- [end:volume]
    assert len(vends) == 1, vends

    # --8<-- [start:sync]
    obstore.put(files, "reports/2026-10.csv", b"day,orders\n2026-10-01,42\n")
    print([meta["path"] for meta in obstore.list(files, prefix="reports").collect()])
    # --8<-- [end:sync]
    asyncio.run(_read_async(files))
    # Three operations, one answer: the constructor's, handed to obstore once.
    assert len(vends) == 1, vends
    time.sleep(0.2)
    obstore.head(files, "reports/2026-10.csv")
    assert len(vends) == 1, "obstore re-vended an hour-long credential"
    asyncio.run(asyncio.to_thread(obstore.head, files, "reports/2026-10.csv"))

    # --8<-- [start:table]
    async def read_trips(api):
        table = await TablesApi(api).get_table(full_name="analytics.ops.trips")
        return await TemporaryCredentialsApi(api).generate_temporary_table_credentials(
            GenerateTemporaryTableCredential(
                table_id=table.table_id, operation=TableOperation.READ
            )
        )

    reader = UnityCatalogCredentials(config, read_trips)
    trips = S3Store.from_url(reader.url, region="us-east-1", credential_provider=reader)
    # --8<-- [end:table]
    obstore.list(trips).collect()
    try:
        obstore.put(trips, "probe.txt", b"no")
    except PermissionDeniedError:
        pass
    else:
        raise AssertionError("a READ table credential wrote")
    reader.close()

    _check_renewal()
    _check_async_provider_under_sync_calls(credentials.url)

    # --8<-- [start:close]
    credentials.close()
    # --8<-- [end:close]


async def _read_async(files: S3Store) -> None:
    # --8<-- [start:async]
    result = await obstore.get_async(files, "reports/2026-10.csv")
    data = bytes(await result.bytes_async())
    print(data.decode())
    # --8<-- [end:async]
    assert b"2026-10-01,42" in data, data


def _count_vends() -> None:
    original = TemporaryCredentialsApi.generate_temporary_volume_credentials

    async def counted(self, *args, **kwargs):
        vends.append(time.monotonic())
        return await original(self, *args, **kwargs)

    TemporaryCredentialsApi.generate_temporary_volume_credentials = counted


def _check_renewal() -> None:
    """obstore asks again once less than five minutes are left, not before."""

    async def short_lived(api):
        volume = await VolumesApi(api).get_volume(name="analytics.ops.files")
        creds = await TemporaryCredentialsApi(
            api
        ).generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=volume.volume_id, operation=VolumeOperation.READ_VOLUME
            )
        )
        # Five minutes and three seconds left.
        creds.expiration_time = int((time.time() + 303) * 1000)
        return creds

    provider = UnityCatalogCredentials(config, short_lived)
    store = S3Store.from_url(
        provider.url, region="us-east-1", credential_provider=provider
    )
    # The constructor's answer serves the first call.
    vends.clear()
    obstore.head(store, "reports/2026-10.csv")
    time.sleep(1)
    obstore.head(store, "reports/2026-10.csv")
    assert not vends, f"renewed with over five minutes left: {vends}"
    time.sleep(3)
    obstore.head(store, "reports/2026-10.csv")
    assert len(vends) == 1, f"not renewed inside five minutes: {vends}"
    provider.close()


_ASYNC_PROVIDER = """
import asyncio, json, os, sys, urllib.request
from datetime import UTC, datetime, timedelta
import obstore
from obstore.store import S3Store
base = os.environ["UC_BASE_URL"]
volume = json.load(urllib.request.urlopen(base + "/volumes/analytics.ops.files"))
answer = json.load(urllib.request.urlopen(urllib.request.Request(
    base + "/temporary-volume-credentials",
    data=json.dumps({"volume_id": volume["volume_id"], "operation": "READ_VOLUME"}).encode(),
    headers={"content-type": "application/json"},
)))
aws = answer["aws_temp_credentials"]
async def provider():
    return {"access_key_id": aws["access_key_id"], "secret_access_key": aws["secret_access_key"],
            "token": aws["session_token"], "expires_at": datetime.now(UTC) + timedelta(hours=1)}
store = S3Store.from_url(answer["url"], region="us-east-1", credential_provider=provider)
if sys.argv[1] == "loop":
    async def call():
        store.list_with_delimiter()
    asyncio.run(call())
else:
    try:
        store.list_with_delimiter()
    except Exception as exc:
        print(exc)
"""


def _check_async_provider_under_sync_calls(url: str) -> None:
    """An async provider fails a sync call outside a loop and hangs one inside a loop."""
    env = {**os.environ, "UC_BASE_URL": config.host}
    run = [sys.executable, "-c", _ASYNC_PROVIDER]
    no_loop = subprocess.run(
        [*run, "thread"], capture_output=True, text=True, timeout=60, env=env
    )
    assert "no running event loop" in no_loop.stdout, no_loop
    try:
        subprocess.run([*run, "loop"], capture_output=True, timeout=20, env=env)
    except subprocess.TimeoutExpired:
        pass
    else:
        raise AssertionError("a sync call ran an async provider inside a running loop")


def _seed() -> None:
    async def seed() -> None:
        async with ApiClient(config) as api:
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
            await TablesApi(api).create_table(
                CreateTable(
                    name="trips",
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
                    storage_location=f"{BUCKET}/lake/tables/trips",
                )
            )
            await VolumesApi(api).create_volume(
                CreateVolumeRequestContent(
                    name="files",
                    catalog_name="analytics",
                    schema_name="ops",
                    volume_type=VolumeType.MANAGED,
                )
            )

    asyncio.run(seed())


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    _seed()
    main()
