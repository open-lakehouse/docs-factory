"""Shared setup for the Iceberg REST scripts: a `retail` catalog with managed storage on S3.

Each script imports this module, so save it beside the script you run. It calls
the Unity Catalog REST API with the standard library only, as an admin would
once: a storage credential, an external location over `s3://uc-docs/retail`,
and a fresh `retail` catalog whose managed storage is under it, with a `sales`
schema.
"""

import json
import os
import urllib.error
import urllib.request

API = "http://localhost:8080/api/2.1/unity-catalog"

# PyIceberg doesn't read AWS_ENDPOINT_URL. This hands the local environment's
# endpoint to the `retail` catalog; import this module before pyiceberg.
if "AWS_ENDPOINT_URL" in os.environ:
    os.environ.setdefault(
        "PYICEBERG_CATALOG__RETAIL__S3__ENDPOINT", os.environ["AWS_ENDPOINT_URL"]
    )


def _call(method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        text = response.read()
    # A delete's body isn't always JSON, and nothing here reads it.
    return json.loads(text) if method != "DELETE" else {}


def _create_once(path: str, body: dict) -> None:
    try:
        _call("POST", path, body)
    except urllib.error.HTTPError as err:
        # Left from an earlier run. The server answers 400, not 409, for these.
        if "ALREADY_EXISTS" not in err.read().decode():
            raise


def setup_retail() -> None:
    _create_once(
        "/credentials",
        {
            "name": "retail_storage",
            "purpose": "STORAGE",
            "aws_iam_role": {"role_arn": "arn:aws:iam::123456789012:role/uc-retail"},
        },
    )
    _create_once(
        "/external-locations",
        {
            "name": "retail_data",
            "url": "s3://uc-docs/retail",
            "credential_name": "retail_storage",
        },
    )
    try:
        _call("DELETE", "/catalogs/retail?force=true")
    except urllib.error.HTTPError as err:
        if err.code != 404:
            raise
    _call(
        "POST",
        "/catalogs",
        {"name": "retail", "storage_root": "s3://uc-docs/retail/managed"},
    )
    _call("POST", "/schemas", {"name": "sales", "catalog_name": "retail"})


def table_info(full_name: str) -> dict:
    """The table as Unity Catalog records it, for the scripts' asserts."""
    return _call("GET", f"/tables/{full_name}")
