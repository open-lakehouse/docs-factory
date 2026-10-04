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
# verifies = "volumes.sh"
# ///
"""Run volumes.sh task by task and check what each command changed."""

import os
import shutil
from pathlib import Path

from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("volumes.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
ROOT = Path(os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs"))

if __name__ == "__main__":
    shutil.rmtree(ROOT / "landing", ignore_errors=True)
    (ROOT / "landing" / "2026").mkdir(parents=True)
    (ROOT / "landing" / "README.txt").write_text("Partner order exports\n")
    (ROOT / "landing" / "2026" / "orders.csv").write_text("order_id,amount\n1,9.5\n")

    run(SCRIPT, "prep")
    run(SCRIPT, "managed-root")
    run(SCRIPT, "create-external")
    run(SCRIPT, "create-managed")
    reports = get(BASE_URL, "volumes/retail.files.reports")
    assert reports["storage_location"].startswith(
        f"file://{ROOT}/managed/__unitystorage/"
    ), reports

    assert "MANAGED" in run(SCRIPT, "view")
    out = run(SCRIPT, "list-files")
    assert "2026 [directory]" in out and "Partner order exports" in out, out

    run(SCRIPT, "update")
    listed = get(BASE_URL, "volumes?catalog_name=retail&schema_name=files")["volumes"]
    assert sorted(v["name"] for v in listed) == ["partner_landing", "reports"], listed
    assert get(BASE_URL, "volumes/retail.files.partner_landing")["comment"].startswith(
        "Partner"
    )

    managed_dir = Path(reports["storage_location"].removeprefix("file://"))
    old = os.umask(0)
    managed_dir.mkdir(parents=True)
    (managed_dir / "daily.csv").write_text("day,total\n")
    os.umask(old)

    run(SCRIPT, "delete")
    assert (ROOT / "landing" / "2026" / "orders.csv").exists()
    assert not managed_dir.exists()
