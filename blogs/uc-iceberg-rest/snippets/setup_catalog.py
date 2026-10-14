# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# setup_catalog.py — give the `retail` catalog managed storage on S3, as an admin would once.
# Run:      uv run setup_catalog.py
# Needs:    the Unity Catalog docs environment with simulated S3
#           (`docker compose -f compose.aws.yaml up -d --wait` in uc-docs-env/unitycatalog).
# Verified: unitycatalog v0.7.0 (docker image unitycatalog/unitycatalog:v0.7.0).
import json
import urllib.error
import urllib.request

API = "http://localhost:8080/api/2.1/unity-catalog"


def call(method: str, path: str, body: dict | None = None) -> None:
    request = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(request).close()
    except urllib.error.HTTPError as err:
        text = err.read().decode()
        # Reruns find the credential and location already there, and no old catalog.
        if "ALREADY_EXISTS" not in text and err.code != 404:
            raise


# --8<-- [start:setup]
call(
    "POST",
    "/credentials",
    {
        "name": "retail_storage",
        "purpose": "STORAGE",
        "aws_iam_role": {"role_arn": "arn:aws:iam::123456789012:role/uc-retail"},
    },
)
call(
    "POST",
    "/external-locations",
    {
        "name": "retail_data",
        "url": "s3://uc-docs/retail",
        "credential_name": "retail_storage",
    },
)
call("DELETE", "/catalogs/retail?force=true")
call(
    "POST",
    "/catalogs",
    {"name": "retail", "storage_root": "s3://uc-docs/retail/managed"},
)
call("POST", "/schemas", {"name": "sales", "catalog_name": "retail"})
# --8<-- [end:setup]
print("catalog retail ready, managed storage under s3://uc-docs/retail/managed")
