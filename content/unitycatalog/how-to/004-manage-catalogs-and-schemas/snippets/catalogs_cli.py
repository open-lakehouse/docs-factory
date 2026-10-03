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
# verifies = "catalogs.sh"
# ///
"""Run catalogs.sh task by task and check what each command changed."""

import os
from pathlib import Path

from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("catalogs.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")

if __name__ == "__main__":
    if get(BASE_URL, "catalogs/retail"):
        run(SCRIPT, "delete-force")

    run(SCRIPT, "create-catalog")
    assert get(BASE_URL, "catalogs/retail")["properties"] == {
        "owner_team": "retail-analytics"
    }

    assert "Order and customer data" in run(SCRIPT, "view-catalogs")

    run(SCRIPT, "update-catalog")
    retail = get(BASE_URL, "catalogs/retail")
    assert retail["comment"] == "Curated retail data", retail
    assert retail["properties"] == {"owner_team": "retail-analytics", "tier": "gold"}, (
        retail
    )

    run(SCRIPT, "create-schema")
    assert "Raw order extracts" in run(SCRIPT, "view-schemas")

    run(SCRIPT, "update-schema")
    assert get(BASE_URL, "schemas/retail.staging") is None
    assert get(BASE_URL, "schemas/retail.sales")["comment"] == "Cleaned order data"

    assert "Cannot delete catalog with schemas" in run(
        SCRIPT, "delete-nonempty", expect_failure=True
    )

    run(SCRIPT, "delete-inward")
    assert get(BASE_URL, "catalogs/retail") is None

    run(SCRIPT, "create-catalog")
    run(SCRIPT, "create-schema")
    run(SCRIPT, "delete-force")
    assert get(BASE_URL, "catalogs/retail") is None
