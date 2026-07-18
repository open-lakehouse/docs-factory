"""Query a Delta table as of an earlier version (time travel), with deltalake.

Unlike ``read_delta_table``, the seed call stays *inside* the shown region: the
example reads a *pre-existing* multi-version table, so a reader must be able to
bootstrap that history to run the snippet. ``seed_dataset`` is that one-liner —
the same code path CI runs.
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
    time_travel_read()
