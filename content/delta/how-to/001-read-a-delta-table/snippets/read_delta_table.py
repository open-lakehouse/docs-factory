# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake>=0.20", "pandas>=2", "docs-factory-seed"]
#
# [tool.uv.sources]
# docs-factory-seed = { path = "../../../../../seed/python", editable = true }
# ///
"""Read a Delta table with the deltalake package.

The region between the ``docs-read-delta-table`` markers is what the docs show;
everything outside it (the seeding, the ``main`` wrapper) is here so the example
is directly runnable and testable but stays out of the published snippet.

Running this file to completion is its test (content/conftest.py runs it via
`uv run`): the asserts below fail the build if the numbers ever drift.
"""

from docs_factory_seed import seed_dataset


def main() -> None:
    path = seed_dataset("orders")
    n = read_delta_table(path)
    assert n == 950, f"expected 950 rows (latest version, after the delete), got {n}"


def read_delta_table(path: str) -> int:
    # --8<-- [start:read-delta-table]
    from deltalake import DeltaTable

    dt = DeltaTable(path)
    df = dt.to_pandas()
    print(df.head())
    print(f"{len(df)} rows")
    # --8<-- [end:read-delta-table]
    return len(df)


if __name__ == "__main__":
    main()
