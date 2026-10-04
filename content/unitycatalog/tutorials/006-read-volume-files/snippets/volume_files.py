# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0", "obstore==0.11.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Register a folder of files as a volume, then find and read it by name.

The regions are what a reader types into `python -m asyncio`, step by step.

docker compose up -d --wait   # from envs/unitycatalog
uv run snippets/volume_files.py
"""

import asyncio
import os
import shutil

from unitycatalog.client.exceptions import NotFoundException

# isort: split
# --8<-- [start:open-store]
from obstore.store import from_url
from unitycatalog.client import TemporaryCredentials


def open_store(creds: TemporaryCredentials):
    """Open the volume's directory with the credentials Unity Catalog vended."""
    if creds.aws_temp_credentials:
        aws = creds.aws_temp_credentials
        return from_url(
            creds.url,
            access_key_id=aws.access_key_id,
            secret_access_key=aws.secret_access_key,
            session_token=aws.session_token,
        )
    return from_url(creds.url)  # local storage: no credentials needed


# --8<-- [end:open-store]

POLICIES = {
    "returns.md": "Items can be returned within 30 days of delivery.\n",
    "shipping.md": "Orders ship within two business days.\n",
    "warranty.md": "Electronics carry a one-year warranty.\n",
}


async def main() -> None:
    # --8<-- [start:connect]
    from pathlib import Path

    import obstore
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

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    # --8<-- [end:connect]
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    try:
        await _reset(api)

        # --8<-- [start:write-files]
        folder = Path("/tmp/uc-tutorial/policies")
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "returns.md").write_text(
            "Items can be returned within 30 days of delivery.\n"
        )
        (folder / "shipping.md").write_text("Orders ship within two business days.\n")
        (folder / "warranty.md").write_text("Electronics carry a one-year warranty.\n")
        # --8<-- [end:write-files]

        # --8<-- [start:register]
        await CatalogsApi(api).create_catalog(CreateCatalog(name="support"))
        await SchemasApi(api).create_schema(
            CreateSchema(name="knowledge", catalog_name="support")
        )
        await VolumesApi(api).create_volume(
            CreateVolumeRequestContent(
                catalog_name="support",
                schema_name="knowledge",
                name="policies",
                volume_type=VolumeType.EXTERNAL,
                storage_location=folder.as_uri(),
                comment="Customer-facing policy documents",
            )
        )
        # --8<-- [end:register]

        # --8<-- [start:find]
        volume = await VolumesApi(api).get_volume(name="support.knowledge.policies")
        print(volume.full_name, volume.volume_type.value)
        print(volume.storage_location)
        # --8<-- [end:find]
        assert volume.storage_location == folder.as_uri(), volume

        # --8<-- [start:credentials]
        creds = await TemporaryCredentialsApi(
            api
        ).generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=volume.volume_id,
                operation=VolumeOperation.READ_VOLUME,
            )
        )
        print(creds.url)
        print(creds.aws_temp_credentials, creds.expiration_time)  # None None
        # --8<-- [end:credentials]
        assert creds.url == volume.storage_location, creds
        assert creds.aws_temp_credentials is None and creds.expiration_time is None

        # --8<-- [start:read]
        store = open_store(creds)
        for meta in sorted(obstore.list(store).collect(), key=lambda m: m["path"]):
            text = bytes(obstore.get(store, meta["path"]).bytes()).decode()
            print(f"{meta['path']} ({meta['size']} bytes): {text.strip()}")
        # --8<-- [end:read]
        listed = sorted(m["path"] for m in obstore.list(store).collect())
        assert listed == sorted(POLICIES), listed
        for name, body in POLICIES.items():
            assert bytes(obstore.get(store, name).bytes()).decode() == body

        # --8<-- [start:clean-up]
        await CatalogsApi(api).delete_catalog(name="support", force=True)
        print(sorted(p.name for p in folder.iterdir()))  # the files are still there
        # --8<-- [end:clean-up]
        assert sorted(p.name for p in folder.iterdir()) == sorted(POLICIES)
    finally:
        await api.close()

    _check_s3_mapping()
    shutil.rmtree(folder.parent)


def _check_s3_mapping() -> None:
    """The S3 branch of open_store is shown on the page but local storage never hits it."""
    from unitycatalog.client import AwsCredentials

    store = open_store(
        TemporaryCredentials(
            url="s3://bucket/support/policies",
            aws_temp_credentials=AwsCredentials(
                access_key_id="AKIA", secret_access_key="secret", session_token="token"
            ),
        )
    )
    assert store.prefix == "support/policies", store


async def _reset(api) -> None:
    from unitycatalog.client import CatalogsApi

    try:
        await CatalogsApi(api).delete_catalog(name="support", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())
