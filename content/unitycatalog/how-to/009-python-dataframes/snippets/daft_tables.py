# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "daft[unity]==0.7.25",
#   "tenacity",
#   "deltalake==1.6.6",
#   "pyarrow>=18",
#   "unitycatalog-client==0.6.0",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.aws.yaml"
# services = ["unitycatalog"]
# ///
"""List and read a Unity Catalog table on local storage from Daft.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose -f compose.aws.yaml up -d --wait

Then run this script, with `_seed.py` from the same page beside it:

    uv run daft_tables.py
"""

import asyncio
import os
import shutil
import sys
from pathlib import Path

# --8<-- [start:connect]
import daft
from daft.catalog import Catalog
from daft.catalog.__unity import UnityCatalogClient

client = UnityCatalogClient("http://localhost:8080", token="not-used")
catalog = Catalog.from_unity(client)
# --8<-- [end:connect]

from _seed import seed_orders  # noqa: E402

ROOT = Path(os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs"))


def main() -> None:
    # --8<-- [start:list]
    print(catalog.list_tables("retail.sales"))
    # --8<-- [end:list]
    assert [str(t) for t in catalog.list_tables("retail.sales")] == [
        "retail.sales.orders"
    ]

    # --8<-- [start:read]
    orders = catalog.get_table("retail.sales.orders").read()
    orders.where(daft.col("amount") > 5).show()
    # --8<-- [end:read]
    assert orders.count_rows() == 3

    # Pins the documented limit: with no vended credentials (local storage), the
    # append has no io_config to write with.
    try:
        catalog.get_table("retail.sales.orders").append(
            daft.from_pydict({"order_id": [4], "customer": ["x"], "amount": [1.0]})
        )
    except ValueError as e:
        assert "io_config was not provided" in str(e), e
    else:
        raise AssertionError("Daft append to a local-storage table now works")


if __name__ == "__main__":
    shutil.rmtree(ROOT / "orders", ignore_errors=True)
    ROOT.mkdir(parents=True, exist_ok=True)
    asyncio.run(seed_orders(f"file://{ROOT}/orders"))
    main()
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
