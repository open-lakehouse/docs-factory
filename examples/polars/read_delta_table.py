"""Read a Delta table with Polars. STUB — not yet built out or tested in CI.

The region markers and the seed one-liner are in place so the docs can reference
this file and the test harness can pick it up once implemented. Polars reuses the
Python ``docs_factory_seed`` helper to materialize the table.
"""


def read_delta_table() -> None:
    # --8<-- [start:read-delta-table]
    import polars as pl
    from docs_factory_seed import seed_dataset

    path = seed_dataset("orders")
    df = pl.read_delta(path)
    print(df.head())
    # --8<-- [end:read-delta-table]


if __name__ == "__main__":
    read_delta_table()
