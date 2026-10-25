# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "unitycatalog-client==0.7.0", "obstore==0.11.1"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "temporary_credentials.sh"
# ///
"""Run temporary_credentials.sh request by request and check each response."""

import asyncio
import json
import os
import runpy
import time
from pathlib import Path

from docsnip.shellregions import get, run

HERE = Path(__file__).parent
SCRIPT = HERE / "temporary_credentials.sh"
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")


def vended(region: str) -> dict:
    response = json.loads(run(SCRIPT, region).splitlines()[-1])
    aws = response["aws_temp_credentials"]
    assert aws["access_key_id"] and aws["session_token"], response
    assert response["expiration_time"] / 1000 > time.time() + 55 * 60, response
    return response


if __name__ == "__main__":
    # The SDK script seeds the objects the requests name.
    sdk = runpy.run_path(str(HERE / "temporary_credentials.py"))
    sdk["config"].host = BASE_URL
    asyncio.run(sdk["main"]())

    table = get(BASE_URL, "tables/analytics.ops.trips")
    assert vended("table")["url"] == table["storage_location"]
    volume = get(BASE_URL, "volumes/analytics.ops.files")
    assert vended("volume")["url"] == volume["storage_location"]
    assert "/models/" in vended("model-version")["url"]
    assert vended("path")["url"] == "s3://amzn-s3-demo-bucket/lake/landing"
