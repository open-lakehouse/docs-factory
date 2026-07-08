"""Read a Delta table with the deltalake package.

The region between the ``docs-read-delta-table`` markers is what the docs show;
everything outside it (the seeding, the ``main`` wrapper) is here so the example
is directly runnable and testable but stays out of the published snippet.
"""

from docs_factory_seed import seed_dataset


def main() -> None:
    path = seed_dataset("orders")
    read_delta_table(path)


def read_delta_table(path: str) -> int:
    # docs-read-delta-table-start
    from deltalake import DeltaTable

    dt = DeltaTable(path)
    df = dt.to_pandas()
    print(df.head())
    print(f"{len(df)} rows")
    # docs-read-delta-table-end
    return len(df)


if __name__ == "__main__":
    main()
