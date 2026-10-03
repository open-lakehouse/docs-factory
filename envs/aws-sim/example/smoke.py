# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0", "obstore==0.11.1"]
# ///
"""End-to-end check that UC vends working, path-scoped S3 credentials via aws-sim.

docker compose up -d --wait
AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run smoke.py
"""

import asyncio
import os

import obstore
from obstore.exceptions import PermissionDeniedError
from obstore.store import S3Store, from_url
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    CreateVolumeRequestContent,
    GenerateTemporaryVolumeCredential,
    SchemasApi,
    TemporaryCredentialsApi,
    VolumeOperation,
    VolumesApi,
    VolumeType,
)
from unitycatalog.client.exceptions import NotFoundException

LOCATION = "s3://uc-docs/support/policies"


async def vend(
    api: ApiClient, volume_id: str, op: VolumeOperation
) -> tuple[S3Store, S3Store]:
    """Stores for the vended URL and, with the same credentials, the bucket root."""
    creds = await TemporaryCredentialsApi(api).generate_temporary_volume_credentials(
        GenerateTemporaryVolumeCredential(volume_id=volume_id, operation=op)
    )
    aws = creds.aws_temp_credentials
    assert aws is not None and aws.session_token, creds
    keys = {
        "access_key_id": aws.access_key_id,
        "secret_access_key": aws.secret_access_key,
        "session_token": aws.session_token,
        "region": "us-east-1",
    }
    store, root = from_url(creds.url, **keys), from_url("s3://uc-docs", **keys)
    assert isinstance(store, S3Store) and isinstance(root, S3Store)
    return store, root


async def main() -> None:
    config = Configuration(
        host=os.environ.get(
            "UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog"
        )
    )
    async with ApiClient(config) as api:
        try:
            await CatalogsApi(api).delete_catalog(name="support", force=True)
        except NotFoundException:
            pass
        await CatalogsApi(api).create_catalog(CreateCatalog(name="support"))
        await SchemasApi(api).create_schema(
            CreateSchema(name="knowledge", catalog_name="support")
        )
        volume = await VolumesApi(api).create_volume(
            CreateVolumeRequestContent(
                catalog_name="support",
                schema_name="knowledge",
                name="policies",
                volume_type=VolumeType.EXTERNAL,
                storage_location=LOCATION,
            )
        )

        writer, writer_root = await vend(
            api, volume.volume_id, VolumeOperation.WRITE_VOLUME
        )
        obstore.put(writer, "returns.md", b"Items can be returned within 30 days.\n")

        reader, _ = await vend(api, volume.volume_id, VolumeOperation.READ_VOLUME)
        listed = [m["path"] for m in obstore.list(reader).collect()]
        assert listed == ["returns.md"], listed
        body = bytes(obstore.get(reader, "returns.md").bytes())
        assert body == b"Items can be returned within 30 days.\n", body

        try:
            obstore.put(reader, "returns.md", b"overwrite")
        except PermissionDeniedError:
            pass
        else:
            raise AssertionError("READ_VOLUME credentials were allowed to write")

        # Write credentials, a key outside the volume: the session policy must deny it.
        try:
            obstore.put(writer_root, "support/other.md", b"x")
        except PermissionDeniedError:
            pass
        else:
            raise AssertionError("vended credentials escaped the volume prefix")

        await CatalogsApi(api).delete_catalog(name="support", force=True)
    print("aws-sim smoke: OK")


if __name__ == "__main__":
    asyncio.run(main())
