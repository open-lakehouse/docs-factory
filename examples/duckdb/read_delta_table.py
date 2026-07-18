"""Read a Delta table with DuckDB. STUB — not yet built out or tested in CI.

DuckDB can't easily *write* multi-version Delta, so it consumes a table that was
materialized up front — the reader runs ``docs-factory-seed orders`` (the CLI)
and passes the printed path. The seed CLI invocation is shown so the snippet is
still runnable end to end.
"""


def read_delta_table(path: str) -> None:
    # --8<-- [start:read-delta-table]
    import duckdb

    duckdb.sql("INSTALL delta; LOAD delta;")
    rel = duckdb.sql(f"SELECT * FROM delta_scan('{path}') LIMIT 5")
    print(rel.fetchall())
    # --8<-- [end:read-delta-table]


if __name__ == "__main__":
    from docs_factory_seed import seed_dataset

    read_delta_table(seed_dataset("orders"))
