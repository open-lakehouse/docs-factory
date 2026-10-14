# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "catalogs.sh"
# claims.cli = [
#   { journey = "catalog.create", region = "create-catalog", api = "uc catalog create" },
#   { journey = "catalog.list", region = "view-catalogs", api = "uc catalog list" },
#   { journey = "catalog.update", region = "update-catalog", api = "uc catalog update" },
#   { journey = "schema.create", region = "create-schema", api = "uc schema create" },
#   { journey = "schema.list", region = "view-schemas", api = "uc schema list" },
#   { journey = "schema.update", region = "update-schema", api = "uc schema update" },
#   { journey = "schema.delete", region = "delete-inward", api = "uc schema delete" },
#   { journey = "catalog.delete", region = "delete-force", api = "uc catalog delete --force" },
# ]
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
