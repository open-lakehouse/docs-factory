"""Read a Delta table from S3 (or an S3-compatible endpoint) using DuckDB.

DuckDB reads Delta tables natively via its ``delta`` extension.  S3 access is
provided by the ``httpfs`` extension, which is also bundled with DuckDB 1.1+.

Credentials and the table path are read exclusively from environment variables
so that no secrets are ever hard-coded:

    AWS_ACCESS_KEY_ID        – required
    AWS_SECRET_ACCESS_KEY    – required
    AWS_REGION               – optional, defaults to ``us-east-1``
    AWS_ENDPOINT_URL         – optional; set this to use any S3-compatible
                               storage (MinIO, Garage, Cloudflare R2, …).
                               Example: ``http://localhost:9000``
    DELTA_TABLE_S3_PATH      – required; the S3 URI of the Delta table,
                               e.g. ``s3://my-bucket/path/to/table``

Example usage
-------------
Run directly::

    AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \\
    DELTA_TABLE_S3_PATH=s3://my-bucket/my-table python duckdb.py

Or import and call from a test::

    from examples.read_delta_table_s3 import duckdb as duckdb_example
    result = duckdb_example.run()
"""

from __future__ import annotations

import os
import pathlib


def run() -> list[tuple] | None:
    """Read a Delta table from S3 with DuckDB and return all rows.

    Credentials and path are sourced entirely from environment variables (see
    module docstring).  If any required variable is missing the function prints
    a descriptive message and returns ``None`` without raising.

    Returns
    -------
    list[tuple] | None
        All rows from the table as a list of tuples, or ``None`` when required
        environment variables are absent.
    """
    import sys
    import importlib

    # ------------------------------------------------------------------
    # Read configuration from environment
    # ------------------------------------------------------------------
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    region = os.environ.get("AWS_REGION", "us-east-1")
    # AWS_ENDPOINT_URL lets you point DuckDB at any S3-compatible service
    # (e.g. MinIO, Garage, Cloudflare R2).  Leave unset for real AWS S3.
    endpoint_url = os.environ.get("AWS_ENDPOINT_URL")
    table_s3_path = os.environ.get("DELTA_TABLE_S3_PATH")

    missing: list[str] = []
    if not access_key:
        missing.append("AWS_ACCESS_KEY_ID")
    if not secret_key:
        missing.append("AWS_SECRET_ACCESS_KEY")
    if not table_s3_path:
        missing.append("DELTA_TABLE_S3_PATH")

    if missing:
        print(
            "Cannot run example — the following environment variables are not set:\n"
            + "\n".join(f"  {v}" for v in missing)
        )
        return None

    # ------------------------------------------------------------------
    # Import duckdb without shadowing by this file's own name.
    # This file is named duckdb.py, which would normally shadow the installed
    # package.  We temporarily remove this file's directory from sys.path,
    # import the real duckdb package, then restore sys.path.
    # ------------------------------------------------------------------
    _this_dir = str(pathlib.Path(__file__).parent)
    _saved = [
        p for p in sys.path
        if pathlib.Path(p).resolve() == pathlib.Path(_this_dir).resolve()
    ]
    for _p in _saved:
        sys.path.remove(_p)
    try:
        duckdb = importlib.import_module("duckdb")
    finally:
        sys.path.extend(_saved)

    # ------------------------------------------------------------------
    # Install and load required extensions (no-op if already loaded)
    # ------------------------------------------------------------------
    con = duckdb.connect()
    con.execute("INSTALL delta")
    con.execute("LOAD delta")
    con.execute("INSTALL httpfs")
    con.execute("LOAD httpfs")

    # ------------------------------------------------------------------
    # Configure S3 credentials via DuckDB SET statements.
    # Using SET keeps credentials out of query strings and avoids
    # accidentally logging them.
    # ------------------------------------------------------------------
    con.execute(f"SET s3_access_key_id='{access_key}'")
    con.execute(f"SET s3_secret_access_key='{secret_key}'")
    con.execute(f"SET s3_region='{region}'")

    if endpoint_url:
        # Strip the scheme so DuckDB receives only host[:port].
        # AWS_ENDPOINT_URL is typically "http://host:port" or "https://host".
        # DuckDB's s3_endpoint expects "host:port" (no scheme).
        endpoint_host = endpoint_url.rstrip("/")
        for scheme in ("https://", "http://"):
            if endpoint_host.startswith(scheme):
                endpoint_host = endpoint_host[len(scheme):]
                break
        con.execute(f"SET s3_endpoint='{endpoint_host}'")
        # Many S3-compatible services use path-style URLs (e.g. MinIO, Garage).
        con.execute("SET s3_url_style='path'")
        # Local / self-hosted endpoints often use plain HTTP.
        if endpoint_url.startswith("http://"):
            con.execute("SET s3_use_ssl=false")

    # ------------------------------------------------------------------
    # Read the Delta table using delta_scan().
    # delta_scan() understands Delta protocol including deletion vectors and
    # column mapping.  DuckDB transparently reads Parquet files from S3.
    # ------------------------------------------------------------------
    result = con.execute(
        f"SELECT * FROM delta_scan('{table_s3_path}')"
    ).fetchall()

    con.close()

    print(f"S3 path : {table_s3_path}")
    print(f"Rows    : {len(result)}")

    return result


# ---------------------------------------------------------------------------
# Allow running directly: python duckdb.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    rows = run()
    if rows is not None:
        print("\nAll rows:")
        for row in rows:
            print(" ", row)
