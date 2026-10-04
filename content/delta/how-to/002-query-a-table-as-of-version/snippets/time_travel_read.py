# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake>=0.20", "pyarrow>=14", "docs-factory-seed"]
#
# [tool.uv.sources]
# docs-factory-seed = { path = "../../../../../seed/python", editable = true }
# ///
"""Query a Delta table as of an earlier version (time travel), with deltalake.

``seed_dataset`` writes a sample table with several versions, so there is
history to travel through. The asserts at the end check each read, so a run
that finishes means the example works.
"""


def time_travel_read() -> tuple[int, int]:
    # --8<-- [start:time-travel-read]
    from deltalake import DeltaTable
    from docs_factory_seed import seed_dataset

    path = seed_dataset("orders")  # deterministic; returns the table path

    latest = DeltaTable(path)  # newest version
    v0 = DeltaTable(path, version=0)  # travel back to the first commit

    latest_rows = latest.to_pyarrow_table().num_rows
    v0_rows = v0.to_pyarrow_table().num_rows
    print(f"v0 had {v0_rows} rows; latest has {latest_rows}")
    # --8<-- [end:time-travel-read]
    return v0_rows, latest_rows


if __name__ == "__main__":
    v0_rows, latest_rows = time_travel_read()
    assert v0_rows == 1000, f"expected 1000 rows at v0, got {v0_rows}"
    assert latest_rows == 950, f"expected 950 rows at latest, got {latest_rows}"
    assert v0_rows > latest_rows
