# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client>=0.5", "obstore>=0.5"]
# ///
"""Vend temporary Volume credentials and hand them to obstore.

Unity Catalog governs *access* to a Volume, but the bytes still live in an
object store. Rather than baking long-lived storage keys into every client, UC
hands out short-lived, scoped credentials on demand through the temporary
credential APIs -- the same mechanic already used for tables and the Delta/IRC
protocols.

The region between the ``uc-credential-provider`` markers is what the blog
shows: an obstore credential provider that asks UC for fresh credentials and
lets obstore refresh them automatically as they near expiry. Everything outside
the markers (argument parsing, the round-trip smoke test) keeps the example
runnable against a live UC instance without leaking into the published snippet.

Run it against a UC server that has a Volume registered:

    uv run credential_vending.py my_catalog.my_schema.my_volume \\
        --uc-url http://localhost:8080/api/2.1/unity-catalog
"""

from __future__ import annotations

import argparse
import asyncio

# --8<-- [start:uc-credential-provider]
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from obstore.store import S3Store
from unitycatalog.client import ApiClient, Configuration
from unitycatalog.client.api import TemporaryCredentialsApi, VolumesApi
from unitycatalog.client.models import (
    GenerateTemporaryVolumeCredential,
    VolumeOperation,
)

if TYPE_CHECKING:
    # S3Credential is a TypedDict exported only for type-checking; at runtime the
    # provider just returns a plain dict with these keys.
    from obstore.store import S3Credential


class VolumeCredentialProvider:
    """Vend temporary S3 credentials for a UC Volume, refreshed on demand.

    obstore calls the provider whenever it needs credentials and caches the
    result until ``expires_at``. Because UC returns an expiry with every
    response, obstore transparently re-vends short-lived credentials rather
    than holding a long-lived key -- access stays governed by the catalog.
    """

    def __init__(
        self,
        api_client: ApiClient,
        volume_id: str,
        operation: VolumeOperation = VolumeOperation.READ_VOLUME,
    ) -> None:
        self._api = TemporaryCredentialsApi(api_client)
        self._volume_id = volume_id
        self._operation = operation

    async def __call__(self) -> S3Credential:
        creds = await self._api.generate_temporary_volume_credentials(
            GenerateTemporaryVolumeCredential(
                volume_id=self._volume_id,
                operation=self._operation,
            )
        )
        aws = creds.aws_temp_credentials
        if aws is None:
            raise RuntimeError(
                "UC did not return AWS credentials; this Volume is likely "
                "backed by Azure or GCS storage."
            )

        expires_at = None
        if creds.expiration_time is not None:
            expires_at = datetime.fromtimestamp(
                creds.expiration_time / 1000, tz=timezone.utc
            )

        return {
            "access_key_id": aws.access_key_id,
            "secret_access_key": aws.secret_access_key,
            "token": aws.session_token,
            "expires_at": expires_at,
        }


def volume_store(
    api_client: ApiClient,
    volume_id: str,
    storage_location: str,
    *,
    region: str = "us-east-1",
    operation: VolumeOperation = VolumeOperation.READ_VOLUME,
) -> S3Store:
    """Build an ``S3Store`` rooted at a Volume, authenticated by UC."""
    provider = VolumeCredentialProvider(api_client, volume_id, operation)
    return S3Store.from_url(
        storage_location,
        region=region,
        credential_provider=provider,
    )
# --8<-- [end:uc-credential-provider]


async def _run(full_name: str, uc_url: str, region: str) -> None:
    """Resolve the Volume, open a store against it, and round-trip an object."""
    async with ApiClient(Configuration(host=uc_url)) as api_client:
        volume = await VolumesApi(api_client).get_volume(name=full_name)
        assert volume.volume_id is not None, "Volume has no id"
        assert volume.storage_location is not None, "Volume has no storage location"
        print(f"{full_name} -> {volume.storage_location} (id={volume.volume_id})")

        store = volume_store(
            api_client,
            volume.volume_id,
            volume.storage_location,
            region=region,
            operation=VolumeOperation.WRITE_VOLUME,
        )

        payload = b"hello from a credential-vended obstore client\n"
        await store.put_async("greeting.txt", payload)
        result = await store.get_async("greeting.txt")
        assert await result.bytes_async() == payload, "round-trip mismatch"
        print("wrote and read back greeting.txt via vended credentials")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "volume",
        help="three-level Volume name, e.g. catalog.schema.volume",
    )
    parser.add_argument(
        "--uc-url",
        default="http://localhost:8080/api/2.1/unity-catalog",
        help="base URL of the Unity Catalog API",
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region the Volume's bucket lives in",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.volume, args.uc_url, args.region))


if __name__ == "__main__":
    main()
