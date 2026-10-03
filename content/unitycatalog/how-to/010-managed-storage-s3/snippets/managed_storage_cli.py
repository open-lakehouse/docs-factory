# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Run managed_storage.sh task by task and check where managed data lands."""

import os
from pathlib import Path

from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("managed_storage.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")

if __name__ == "__main__":
    run(SCRIPT, "prep")
    run(SCRIPT, "location")

    run(SCRIPT, "catalog-root")
    sales = get(BASE_URL, "catalogs/sales")
    assert sales["storage_location"] == (
        f"s3://uc-docs/lake/sales/__unitystorage/catalogs/{sales['id']}"
    ), sales

    run(SCRIPT, "schema-root")
    assert get(BASE_URL, "schemas/sales.raw")["storage_root"] is None
    curated = get(BASE_URL, "schemas/sales.curated")

    run(SCRIPT, "managed-volume")
    drops = get(BASE_URL, "volumes/sales.raw.drops")["storage_location"]
    reports = get(BASE_URL, "volumes/sales.curated.reports")["storage_location"]
    assert drops.startswith(f"{sales['storage_location']}/volumes/"), drops
    assert reports.startswith(
        f"s3://uc-docs/lake/curated/__unitystorage/schemas/{curated['schema_id']}/volumes/"
    ), reports

    out = run(SCRIPT, "reserved-prefix", expect_failure=True)
    assert "contains managed storage prefix __unitystorage" in out, out

    run(SCRIPT, "clean-up")
    assert get(BASE_URL, "catalogs/sales") is None
