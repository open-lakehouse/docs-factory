# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "unitycatalog-client==0.6.0", "pyarrow>=18", "duckdb==1.5.4"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "file_formats.sh"
# ///
"""Run file_formats.sh task by task and check what each command changed."""

import os
import sys
from pathlib import Path

import file_formats as ff
from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("file_formats.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")

if __name__ == "__main__":
    ff._reset()
    ff.write_sample()

    run(SCRIPT, "prep")
    run(SCRIPT, "register")
    for fmt in ff.FORMATS:
        table = get(BASE_URL, f"tables/retail.sales.orders_{fmt}")
        assert table["data_source_format"] == fmt.upper(), table
        assert table["storage_location"] == f"file://{ff.ROOT}/orders_{fmt}", table
        # The CLI only creates files for Delta; the sample files stay as written.
        assert sorted(p.name for p in (ff.ROOT / f"orders_{fmt}").iterdir()) == [
            f"part-0.{fmt}"
        ]
        assert (
            ff.read_duckdb(fmt, table["storage_location"].removeprefix("file://")) == 3
        )

    assert '"CSV"' in run(SCRIPT, "view")

    run(SCRIPT, "drop")
    for fmt in ff.FORMATS:
        assert get(BASE_URL, f"tables/retail.sales.orders_{fmt}") is None
        assert (ff.ROOT / f"orders_{fmt}" / f"part-0.{fmt}").exists()
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
