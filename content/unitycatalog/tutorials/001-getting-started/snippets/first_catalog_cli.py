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
# verifies = "first_catalog.sh"
# ///
"""Run first_catalog.sh step by step and check what each command changed."""

import os
import subprocess
from pathlib import Path

from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("first_catalog.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")


def _reset() -> None:
    """Make a rerun against the same server start from the tutorial's first step."""
    if get(BASE_URL, "catalogs/quickstart"):
        run(SCRIPT, "clean-up")
    # A forced catalog delete keeps an external table's files.
    subprocess.run(
        ["docker", "exec", "unitycatalog", "rm", "-rf", "/tmp/uc/orders"],
        check=True,
    )


if __name__ == "__main__":
    _reset()

    browsed = run(SCRIPT, "browse")
    for name in ('"unity"', '"production"', '"unity.default"', '"numbers"'):
        assert name in browsed, name

    assert "as_int(integer)" in run(SCRIPT, "sample-rows")

    run(SCRIPT, "create-catalog")
    assert get(BASE_URL, "catalogs/quickstart")["comment"] == "My first catalog"

    run(SCRIPT, "create-schema")
    assert get(BASE_URL, "schemas/quickstart.sales")["comment"] == "Order data"

    run(SCRIPT, "create-table")
    orders = get(BASE_URL, "tables/quickstart.sales.orders")
    assert orders["table_type"] == "EXTERNAL", orders
    assert [c["name"] for c in orders["columns"]] == ["order_id", "customer", "amount"]

    assert "Table written to successfully" in run(SCRIPT, "write-rows")

    rows = run(SCRIPT, "read-rows")
    for header in ("order_id(integer)", "customer(string)", "amount(double)"):
        assert header in rows, rows

    run(SCRIPT, "clean-up")
    assert get(BASE_URL, "catalogs/quickstart") is None
