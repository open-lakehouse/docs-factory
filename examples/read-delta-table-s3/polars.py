"""Read a Delta table from S3 (or any S3-compatible store) using Polars.

Demonstrates lazy scan with predicate pushdown, eager collect, and schema
inspection. Credentials and the target path are read exclusively from
environment variables so that no secrets are ever hardcoded.

Required environment variables
--------------------------------
DELTA_TABLE_S3_PATH   Full S3 URI of the Delta table root, e.g.
                      ``s3://my-bucket/path/to/table``
AWS_ACCESS_KEY_ID     AWS (or compatible) access key.
AWS_SECRET_ACCESS_KEY AWS (or compatible) secret key.

Optional environment variables
--------------------------------
AWS_REGION            AWS region (default: ``us-east-1``).
AWS_ENDPOINT_URL      Override the S3 endpoint for S3-compatible stores
                      such as MinIO, Garage, or Cloudflare R2.
                      Example: ``http://localhost:3900``
                      Pass this value via ``storage_options`` to
                      ``scan_delta()`` / ``read_delta()`` as the key
                      ``"aws_endpoint_url"``.

Polars uses the `deltalake` Python library as its Delta backend.
Install both::

    pip install polars deltalake

Usage
-----
Run directly::

    DELTA_TABLE_S3_PATH=s3://bucket/table \\
    AWS_ACCESS_KEY_ID=... \\
    AWS_SECRET_ACCESS_KEY=... \\
    python examples/read-delta-table-s3/polars.py

Or via the Makefile::

    make run EXAMPLE=read-delta-table-s3 ENGINE=polars
"""

from __future__ import annotations

import importlib
import os
import sys
import pathlib


def _import_polars():
    """Import the real polars package, bypassing any self-shadowing.

    When this file is run as a script, Python inserts the script's directory
    at the front of sys.path, which would make ``import polars`` resolve to
    this file instead of the installed package. We remove the shadowing entry
    temporarily so the correct package is loaded.
    """
    script_dir = str(pathlib.Path(__file__).parent)
    filtered = [p for p in sys.path if p != script_dir]
    original_path = sys.path[:]
    sys.path[:] = filtered
    try:
        pl = importlib.import_module("polars")
    finally:
        sys.path[:] = original_path
    return pl


def run() -> None:
    """Read a Delta table from S3 with Polars and print diagnostics.

    All configuration is sourced from environment variables. If any required
    variable is absent the function prints a clear message and returns without
    raising, so that CI can skip this example when the S3 fixture is not yet
    available.
    """
    pl = _import_polars()

    # ------------------------------------------------------------------
    # 1. Read configuration from environment — no hardcoded values.
    # ------------------------------------------------------------------
    table_path = os.environ.get("DELTA_TABLE_S3_PATH")
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    region = os.environ.get("AWS_REGION", "us-east-1")

    # AWS_ENDPOINT_URL allows targeting S3-compatible stores (MinIO, Garage,
    # Cloudflare R2, …). When set it is forwarded to scan_delta / read_delta
    # via ``storage_options`` as ``"aws_endpoint_url"``.
    endpoint_url = os.environ.get("AWS_ENDPOINT_URL")

    missing = [
        name
        for name, value in [
            ("DELTA_TABLE_S3_PATH", table_path),
            ("AWS_ACCESS_KEY_ID", access_key),
            ("AWS_SECRET_ACCESS_KEY", secret_key),
        ]
        if not value
    ]
    if missing:
        print(
            f"Skipping read-delta-table-s3/polars: missing env vars: {', '.join(missing)}"
        )
        return

    # Build the storage_options dict passed to Polars' Delta backend.
    # Keys map to the deltalake / object_store crate's S3 config names.
    storage_options: dict[str, str] = {
        "aws_access_key_id": access_key,  # type: ignore[assignment]
        "aws_secret_access_key": secret_key,  # type: ignore[assignment]
        "aws_region": region,
    }
    if endpoint_url:
        # Enable S3-compatible endpoint override (e.g. for Garage or MinIO).
        storage_options["aws_endpoint_url"] = endpoint_url
        # Required for path-style addressing used by most S3-compatible stores.
        storage_options["aws_allow_http"] = "true"

    # ------------------------------------------------------------------
    # 2. Lazy scan with scan_delta — returns a LazyFrame.
    #    Polars defers I/O and pushes predicates and projections down into
    #    the Parquet reader automatically.
    # ------------------------------------------------------------------
    lazy = pl.scan_delta(table_path, storage_options=storage_options)

    # Inspect the schema without triggering full I/O.
    print("Schema (from LazyFrame):")
    print(lazy.collect_schema())
    print()

    # ------------------------------------------------------------------
    # 3. Eager collect — materialise the full table into a DataFrame.
    #    Use this when you need the complete dataset in memory at once.
    # ------------------------------------------------------------------
    df = lazy.collect()

    print(f"Full table shape: {df.shape}")
    print(f"Columns: {df.columns}")
    print()

    # Detailed schema inspection on the collected DataFrame.
    print("Schema (from DataFrame):")
    for col_name, dtype in zip(df.columns, df.dtypes):
        print(f"  {col_name}: {dtype}")
    print()

    # ------------------------------------------------------------------
    # 4. Lazy scan with predicate pushdown — only rows matching the
    #    filter are read from storage; Parquet row-group statistics are
    #    used for file skipping when available.
    # ------------------------------------------------------------------
    columns = df.columns
    if columns:
        first_col = columns[0]
        sample_value = df[first_col][0] if len(df) > 0 else None
        if sample_value is not None:
            filtered = (
                pl.scan_delta(table_path, storage_options=storage_options)
                .filter(pl.col(first_col) == sample_value)
                .collect()
            )
            print(
                f"Rows where {first_col} == {sample_value!r} "
                f"(predicate-pushdown path): {len(filtered)}"
            )
            print()

    print("Done.")


if __name__ == "__main__":
    run()
