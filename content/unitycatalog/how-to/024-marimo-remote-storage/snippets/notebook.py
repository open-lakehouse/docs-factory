# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.7.0", "obstore==0.11.1", "marimo==0.25.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Browse a Unity Catalog volume in marimo's Remote Storage panel.

Each region is one cell's code. Start the docs' local server from
`uc-docs-env/uc-aws`:

    docker compose up -d --wait

Then open the notebook with `marimo edit notebook.py`, or run it as a script,
as the tests do:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run notebook.py

The last cell checks that marimo finds the store and can list and download
through it, the way the panel does.
"""

import marimo

app = marimo.App()


@app.cell
def _():
    # --8<-- [start:nb-connect]
    import asyncio
    import threading
    from datetime import UTC, datetime

    import obstore
    from obstore.store import from_url
    from unitycatalog.client import (
        ApiClient,
        Configuration,
        GenerateTemporaryPathCredential,
        GenerateTemporaryTableCredential,
        GenerateTemporaryVolumeCredential,
        PathOperation,
        TableOperation,
        TablesApi,
        TemporaryCredentialsApi,
        VolumeOperation,
        VolumesApi,
    )

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    # --8<-- [end:nb-connect]
    import os as _os

    if _url := _os.environ.get("UC_BASE_URL"):
        config.host = _url
    return (
        ApiClient,
        GenerateTemporaryPathCredential,
        GenerateTemporaryTableCredential,
        GenerateTemporaryVolumeCredential,
        PathOperation,
        TableOperation,
        TablesApi,
        TemporaryCredentialsApi,
        UTC,
        VolumeOperation,
        VolumesApi,
        asyncio,
        config,
        datetime,
        from_url,
        obstore,
        threading,
    )


@app.cell
def _(
    ApiClient,
    GenerateTemporaryPathCredential,
    GenerateTemporaryTableCredential,
    GenerateTemporaryVolumeCredential,
    PathOperation,
    TableOperation,
    TablesApi,
    TemporaryCredentialsApi,
    UTC,
    VolumeOperation,
    VolumesApi,
    asyncio,
    datetime,
    threading,
):
    # --8<-- [start:nb-provider]
    class UnityCatalogCredentials:
        """An obstore credential provider that asks Unity Catalog for storage credentials.

        It returns whichever credential the server vends: S3 keys, an Azure SAS
        token, or a Google Cloud OAuth token. `request` is an async function that
        takes an `ApiClient` and returns the server's `TemporaryCredentials`. It
        runs on an event loop of its own, in a background thread, so obstore can
        call the provider from sync methods, async methods, and threads without a
        loop alike.
        """

        def __init__(self, config, request):
            self._request = request
            self._loop = asyncio.new_event_loop()
            threading.Thread(target=self._loop.run_forever, daemon=True).start()
            self._api = self._run(self._connect(config))
            # The first answer gives the store its URL, and a missing grant fails here.
            self._first = self._run(request(self._api))
            self.url = self._first.url

        @classmethod
        def for_volume(cls, config, name, operation=VolumeOperation.READ_VOLUME):
            async def request(api):
                volume = await VolumesApi(api).get_volume(name=name)
                return await TemporaryCredentialsApi(
                    api
                ).generate_temporary_volume_credentials(
                    GenerateTemporaryVolumeCredential(
                        volume_id=volume.volume_id, operation=operation
                    )
                )

            return cls(config, request)

        @classmethod
        def for_table(cls, config, full_name, operation=TableOperation.READ):
            async def request(api):
                table = await TablesApi(api).get_table(full_name=full_name)
                return await TemporaryCredentialsApi(
                    api
                ).generate_temporary_table_credentials(
                    GenerateTemporaryTableCredential(
                        table_id=table.table_id, operation=operation
                    )
                )

            return cls(config, request)

        @classmethod
        def for_path(cls, config, url, operation=PathOperation.PATH_READ):
            async def request(api):
                return await TemporaryCredentialsApi(
                    api
                ).generate_temporary_path_credentials(
                    GenerateTemporaryPathCredential(url=url, operation=operation)
                )

            return cls(config, request)

        @staticmethod
        async def _connect(config):
            return ApiClient(config)

        def _run(self, coroutine):
            return asyncio.run_coroutine_threadsafe(coroutine, self._loop).result()

        def __call__(self):
            creds = self._first or self._run(self._request(self._api))
            self._first = None
            # expiration_time is in epoch milliseconds.
            expires_at = datetime.fromtimestamp(creds.expiration_time / 1000, tz=UTC)
            if aws := creds.aws_temp_credentials:
                return {
                    "access_key_id": aws.access_key_id,
                    "secret_access_key": aws.secret_access_key,
                    "token": aws.session_token,
                    "expires_at": expires_at,
                }
            if azure := creds.azure_user_delegation_sas:
                return {"sas_token": azure.sas_token, "expires_at": expires_at}
            if gcp := creds.gcp_oauth_token:
                return {"token": gcp.oauth_token, "expires_at": expires_at}
            raise ValueError(f"the server vended no credential for {creds.url}")

        def close(self):
            self._run(self._api.close())
            self._loop.call_soon_threadsafe(self._loop.stop)

    # --8<-- [end:nb-provider]
    return (UnityCatalogCredentials,)


@app.cell
def _(UnityCatalogCredentials, config, from_url):
    # --8<-- [start:nb-store]
    credentials = UnityCatalogCredentials.for_volume(config, "analytics.ops.files")
    files = from_url(
        credentials.url, region="us-east-1", credential_provider=credentials
    )
    # --8<-- [end:nb-store]
    return credentials, files


@app.cell
def _(files, obstore):
    # --8<-- [start:nb-read]
    report = obstore.get(files, "reports/2026-10.csv").bytes()
    print(bytes(report).decode())
    # --8<-- [end:nb-read]
    return (report,)


@app.cell
async def _(files):
    # marimo's own storage backend, called the way the Remote Storage panel
    # calls it: a sync listing on a worker thread, then async downloads. This
    # is marimo-private API, so a marimo bump can move it.
    import asyncio as _asyncio

    from marimo._data._external_storage.get_storage import (
        get_storage_backends_from_variables,
        storage_backend_to_storage_namespace,
    )

    _found = get_storage_backends_from_variables([("files", files)])
    panel = storage_backend_to_storage_namespace(_found[0][1])
    listed = await _asyncio.to_thread(_found[0][1].list_entries, "reports/")
    downloaded = await _found[0][1].download("reports/2026-10.csv")
    signed = await _found[0][1].sign_download_url("reports/2026-10.csv")
    found = len(_found)
    return downloaded, found, listed, panel, signed


if __name__ == "__main__":
    import asyncio
    import os

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
    from unitycatalog.client.exceptions import NotFoundException

    bucket = "s3://amzn-s3-demo-bucket"

    async def _seed() -> None:
        """A managed volume `analytics.ops.files` holding one report."""
        host = os.environ.get(
            "UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog"
        )
        async with ApiClient(Configuration(host=host)) as api:
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
                    name="lake", url=f"{bucket}/lake", credential_name="lake_storage"
                )
            )
            await catalogs.create_catalog(
                CreateCatalog(name="analytics", storage_root=f"{bucket}/lake/analytics")
            )
            await SchemasApi(api).create_schema(
                CreateSchema(name="ops", catalog_name="analytics")
            )
            volume = await VolumesApi(api).create_volume(
                CreateVolumeRequestContent(
                    name="files",
                    catalog_name="analytics",
                    schema_name="ops",
                    volume_type=VolumeType.MANAGED,
                )
            )
            creds = await TemporaryCredentialsApi(
                api
            ).generate_temporary_volume_credentials(
                GenerateTemporaryVolumeCredential(
                    volume_id=volume.volume_id, operation=VolumeOperation.WRITE_VOLUME
                )
            )
            aws = creds.aws_temp_credentials
            store = from_url(
                creds.url,
                access_key_id=aws.access_key_id,
                secret_access_key=aws.secret_access_key,
                session_token=aws.session_token,
                region="us-east-1",
            )
            await store.put_async("reports/2026-10.csv", b"day,orders\n2026-10-01,42\n")

    asyncio.run(_seed())
    _, defs = app.run()
    # Not a cell: marimo runs every cell when the notebook opens, so a closing
    # cell would close the provider the Remote Storage panel still uses.
    defs["credentials"].close()
    assert b"2026-10-01,42" in bytes(defs["report"]), defs["report"]
    assert defs["found"] == 1, "marimo didn't recognize the store"
    assert defs["panel"].name == "files", defs["panel"]
    assert [e.path for e in defs["listed"].entries] == ["reports/2026-10.csv"], defs[
        "listed"
    ]
    assert b"2026-10-01,42" in defs["downloaded"], defs["downloaded"]
    assert defs["signed"] and "X-Amz-Security-Token" in defs["signed"], defs["signed"]
