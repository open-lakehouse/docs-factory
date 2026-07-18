"""Read a Delta table with DuckDB.

DuckDB can't easily *write* multi-version Delta, so it consumes a table that was
materialized up front — the reader runs ``docs-factory-seed orders`` (the CLI)
and passes the printed path. The seed CLI invocation is shown so the snippet is
still runnable end to end.
"""


def read_delta_table(path: str) -> int:
    # --8<-- [start:read-delta-table]
    import duckdb

    duckdb.sql("INSTALL delta; LOAD delta;")
    rel = duckdb.sql(f"SELECT * FROM delta_scan('{path}')")
    rows = rel.fetchall()
    print(f"{len(rows)} rows")
    # --8<-- [end:read-delta-table]
    return len(rows)


if __name__ == "__main__":
    from docs_factory_seed import seed_dataset

    read_delta_table(seed_dataset("orders"))
