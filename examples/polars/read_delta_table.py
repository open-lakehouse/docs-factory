"""Read a Delta table with Polars.

Polars reads Delta through delta-rs and reuses the Python ``docs_factory_seed``
helper to materialize the table so the snippet is runnable as shown.
"""


def read_delta_table() -> int:
    # --8<-- [start:read-delta-table]
    import polars as pl
    from docs_factory_seed import seed_dataset

    path = seed_dataset("orders")
    df = pl.read_delta(path)
    print(df.head())
    print(f"{df.height} rows")
    # --8<-- [end:read-delta-table]
    return df.height


if __name__ == "__main__":
    read_delta_table()
