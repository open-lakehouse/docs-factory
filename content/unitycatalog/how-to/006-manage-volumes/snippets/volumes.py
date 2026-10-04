# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Create, inspect, update, and delete external and managed volumes.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run volumes.py
"""

import asyncio
import os
import shutil
from pathlib import Path

# --8<-- [start:connect]
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    CreateVolumeRequestContent,
    SchemasApi,
    UpdateVolumeRequestContent,
    VolumesApi,
    VolumeType,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]

ROOT = Path(os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs"))


async def main() -> None:
    _reset()
    async with ApiClient(config) as api:
        volumes = VolumesApi(api)
        await _reset_catalog(api)

        # --8<-- [start:managed-root]
        await CatalogsApi(api).create_catalog(CreateCatalog(name="retail"))
        await SchemasApi(api).create_schema(
            CreateSchema(
                name="files",
                catalog_name="retail",
                storage_root=f"file://{ROOT}/managed",
            )
        )
        # --8<-- [end:managed-root]

        # --8<-- [start:create-external]
        landing = await volumes.create_volume(
            CreateVolumeRequestContent(
                catalog_name="retail",
                schema_name="files",
                name="landing",
                volume_type=VolumeType.EXTERNAL,
                storage_location=f"file://{ROOT}/landing",
                comment="Order exports dropped by the partner SFTP job",
            )
        )
        print(landing.full_name, landing.storage_location)
        # --8<-- [end:create-external]

        # --8<-- [start:create-managed]
        reports = await volumes.create_volume(
            CreateVolumeRequestContent(
                catalog_name="retail",
                schema_name="files",
                name="reports",
                volume_type=VolumeType.MANAGED,
            )
        )
        print(reports.storage_location)  # allocated under the schema's storage root
        # --8<-- [end:create-managed]
        assert reports.storage_location.startswith(
            f"file://{ROOT}/managed/__unitystorage/"
        )

        # --8<-- [start:view]
        listed = await volumes.list_volumes(catalog_name="retail", schema_name="files")
        print([(v.name, v.volume_type) for v in listed.volumes or []])

        info = await volumes.get_volume(name="retail.files.landing")
        print(info.storage_location, info.comment)
        # --8<-- [end:view]
        assert sorted(v.name for v in listed.volumes or []) == ["landing", "reports"]

        # --8<-- [start:list-files]
        path = Path(info.storage_location.removeprefix("file://"))
        print(sorted(p.relative_to(path).as_posix() for p in path.rglob("*")))
        # --8<-- [end:list-files]

        # --8<-- [start:update]
        renamed = await volumes.update_volume(
            name="retail.files.landing",
            update_volume_request_content=UpdateVolumeRequestContent(
                new_name="partner_landing",
                comment="Partner order exports, retained 30 days",
            ),
        )
        print(renamed.full_name)  # retail.files.partner_landing
        # --8<-- [end:update]
        assert renamed.storage_location == landing.storage_location
        await _check_missing_volume_error(volumes)

        managed_dir = Path(reports.storage_location.removeprefix("file://"))
        _write_report(managed_dir)

        # --8<-- [start:delete]
        await volumes.delete_volume(name="retail.files.partner_landing")
        await volumes.delete_volume(name="retail.files.reports")
        # --8<-- [end:delete]

    assert (ROOT / "landing" / "2026" / "orders.csv").exists(), (
        "external files must survive"
    )
    assert not managed_dir.exists(), "managed volume directory must be deleted"


async def _check_missing_volume_error(volumes: VolumesApi) -> None:
    """The page notes that 0.6.0 answers a missing volume with HTTP 500, not 404."""
    from unitycatalog.client.exceptions import ServiceException

    try:
        await volumes.get_volume(name="retail.files.landing")
    except ServiceException as exc:
        assert exc.status == 500, exc.status
    else:
        raise AssertionError("renamed volume is still reachable under its old name")


def _write_report(directory: Path) -> None:
    # The server allocates a managed volume's path but creates no directory.
    # With a 0 umask, the server's uid can delete what this process creates.
    old = os.umask(0)
    try:
        directory.mkdir(parents=True)
        (directory / "daily.csv").write_text("day,total\n2026-10-01,42\n")
    finally:
        os.umask(old)


def _reset() -> None:
    # Only the external fixture is recreated. Managed paths are unique per run
    # (schema and volume UUIDs), and recreating their root under some VM file
    # shares (Colima) leaves the server container a stale view of it.
    shutil.rmtree(ROOT / "landing", ignore_errors=True)
    (ROOT / "landing" / "2026").mkdir(parents=True)
    (ROOT / "landing" / "README.txt").write_text("Partner order exports\n")
    (ROOT / "landing" / "2026" / "orders.csv").write_text("order_id,amount\n1,9.5\n")


async def _reset_catalog(api: ApiClient) -> None:
    from unitycatalog.client.exceptions import NotFoundException

    try:
        await CatalogsApi(api).delete_catalog(name="retail", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
