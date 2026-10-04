# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0", "obstore==0.11.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.aws.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Register an S3 storage credential and external location, and check vending.

docker compose -f compose.aws.yaml up -d --wait   # from envs/unitycatalog
AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run snippets/aws_storage.py
"""

import asyncio
import os

import obstore
from obstore.exceptions import PermissionDeniedError

# --8<-- [start:connect]
from obstore.store import from_url
from unitycatalog.client import (
    ApiClient,
    AwsIamRoleRequest,
    Configuration,
    CreateCredentialRequest,
    CreateExternalLocation,
    CredentialPurpose,
    CredentialsApi,
    ExternalLocationsApi,
    GenerateTemporaryPathCredential,
    PathOperation,
    TemporaryCredentialsApi,
    UpdateCredentialRequest,
    UpdateExternalLocation,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]

from unitycatalog.client.exceptions import (  # noqa: E402
    BadRequestException,
    NotFoundException,
    ServiceException,
)

MASTER = "arn:aws:iam::123456789012:role/uc-master"


async def main() -> None:
    async with ApiClient(config) as api:
        credentials = CredentialsApi(api)
        locations = ExternalLocationsApi(api)
        await _reset(credentials, locations)

        # --8<-- [start:create-credential]
        cred = await credentials.create_credential(
            CreateCredentialRequest(
                name="lake_storage",
                purpose=CredentialPurpose.STORAGE,
                aws_iam_role=AwsIamRoleRequest(
                    role_arn="arn:aws:iam::123456789012:role/uc-storage-lake"
                ),
                comment="Read/write on s3://uc-docs/lake",
            )
        )
        # Put both values in the storage role's trust policy.
        print(cred.aws_iam_role.unity_catalog_iam_arn)
        print(cred.aws_iam_role.external_id)
        # --8<-- [end:create-credential]
        assert cred.aws_iam_role.unity_catalog_iam_arn == MASTER

        # --8<-- [start:create-location]
        location = await locations.create_external_location(
            CreateExternalLocation(
                name="lake",
                url="s3://uc-docs/lake",
                credential_name="lake_storage",
            )
        )
        print(location.url, location.credential_name)
        # --8<-- [end:create-location]
        await _check_no_overlap(locations)

        # --8<-- [start:verify]
        vended = await TemporaryCredentialsApi(api).generate_temporary_path_credentials(
            GenerateTemporaryPathCredential(
                url="s3://uc-docs/lake/landing",
                operation=PathOperation.PATH_READ_WRITE,
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
        await obstore.put_async(store, "hello.txt", b"vended by Unity Catalog\n")
        print([meta["path"] for meta in await obstore.list(store).collect_async()])
        # --8<-- [end:verify]
        await _check_scoped(vended)

        # --8<-- [start:view]
        info = await credentials.get_credential(name="lake_storage")
        print(info.aws_iam_role.role_arn)
        listed = await locations.list_external_locations()
        print([(loc.name, loc.url) for loc in listed.external_locations or []])
        # --8<-- [end:view]

        # --8<-- [start:update-credential]
        updated = await credentials.update_credential(
            name="lake_storage",
            update_credential_request=UpdateCredentialRequest(
                aws_iam_role=AwsIamRoleRequest(
                    role_arn="arn:aws:iam::123456789012:role/uc-storage-lake-v2"
                ),
            ),
        )
        print(updated.aws_iam_role.external_id)  # a new ID: update the trust policy
        # --8<-- [end:update-credential]
        assert updated.aws_iam_role.external_id != cred.aws_iam_role.external_id

        # --8<-- [start:update-location]
        await locations.update_external_location(
            name="lake",
            update_external_location=UpdateExternalLocation(
                comment="Landing and curated data"
            ),
        )
        # --8<-- [end:update-location]

        # --8<-- [start:delete]
        await locations.delete_external_location(name="lake")
        await credentials.delete_credential(name="lake_storage")
        # --8<-- [end:delete]

        await _check_force_delete_dangles(credentials, locations)


async def _check_no_overlap(locations: ExternalLocationsApi) -> None:
    """The page says external locations can't nest or duplicate each other."""
    for url in ("s3://uc-docs", "s3://uc-docs/lake/curated"):
        try:
            await locations.create_external_location(
                CreateExternalLocation(
                    name="nested", url=url, credential_name="lake_storage"
                )
            )
        except BadRequestException as exc:
            assert "overlaps" in str(exc.body), exc.body
        else:
            raise AssertionError(f"overlapping location {url} was accepted")


async def _check_scoped(vended) -> None:
    """The vended keys reach only the requested prefix."""
    aws = vended.aws_temp_credentials
    bucket = from_url(
        "s3://uc-docs",
        access_key_id=aws.access_key_id,
        secret_access_key=aws.secret_access_key,
        session_token=aws.session_token,
        region="us-east-1",
    )
    try:
        await obstore.put_async(bucket, "lake/curated/x.txt", b"no")
    except PermissionDeniedError:
        pass
    else:
        raise AssertionError("vended credentials wrote outside their prefix")


async def _check_force_delete_dangles(
    credentials: CredentialsApi, locations: ExternalLocationsApi
) -> None:
    """Pins the 0.6.0 bug the page's danger callout describes.

    When this starts failing, the server has stopped leaving the location
    behind; update the callout.
    """
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
            name="lake", url="s3://uc-docs/lake", credential_name="lake_storage"
        )
    )
    await credentials.delete_credential(name="lake_storage", force=True)
    try:
        await locations.list_external_locations()
    except ServiceException as exc:
        assert exc.status == 500, exc.status
    else:
        raise AssertionError("listing survived a dangling external location")
    await locations.delete_external_location(name="lake", force=True)
    assert not (await locations.list_external_locations()).external_locations


async def _reset(credentials: CredentialsApi, locations: ExternalLocationsApi) -> None:
    for delete in (
        locations.delete_external_location(name="nested", force=True),
        locations.delete_external_location(name="lake", force=True),
        credentials.delete_credential(name="lake_storage", force=True),
    ):
        try:
            await delete
        except NotFoundException:
            pass


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
