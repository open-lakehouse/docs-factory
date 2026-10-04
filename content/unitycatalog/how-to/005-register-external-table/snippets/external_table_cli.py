# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "deltalake==1.6.6", "pyarrow>=18"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "external_table.sh"
# ///
"""Run external_table.sh task by task and check what each command changed."""

import os
import shutil
import sys
from pathlib import Path

import pyarrow as pa
from deltalake import DeltaTable, write_deltalake
from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("external_table.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
ROOT = Path(os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs"))

if __name__ == "__main__":
    location = ROOT / "orders"
    shutil.rmtree(location, ignore_errors=True)
    write_deltalake(
        str(location),
        pa.table(
            {
                "order_id": pa.array([1, 2, 3], pa.int64()),
                "customer": ["ada", "grace", "linus"],
                "amount": [9.5, 20.0, 3.25],
            }
        ),
    )
    log_before = sorted(p.name for p in (location / "_delta_log").iterdir())

    run(SCRIPT, "prep")
    run(SCRIPT, "register")
    table = get(BASE_URL, "tables/retail.sales.orders")
    assert table["table_type"] == "EXTERNAL", table
    assert table["storage_location"] == f"file://{location}", table
    # Registering an existing table must not rewrite its Delta log.
    assert sorted(p.name for p in (location / "_delta_log").iterdir()) == log_before

    assert "order_id" in run(SCRIPT, "view")
    out = run(SCRIPT, "read")
    assert "grace" in out and "20.0" in out, out

    run(SCRIPT, "drop")
    assert get(BASE_URL, "tables/retail.sales.orders") is None
    assert DeltaTable(str(location)).to_pyarrow_table().num_rows == 3
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
