"""Read a Delta table from S3 using delta-rs (deltalake Python bindings).

This example demonstrates:
- Opening a Delta table stored on S3 (or any S3-compatible object store)
- Passing credentials via environment variables — no hardcoded secrets
- Overriding the S3 endpoint for use with Garage, MinIO, or other
  S3-compatible services (set AWS_ENDPOINT_URL)
- Inspecting schema and table metadata
- Reading all data into an Arrow table

Journey: read-delta-table-s3
Engine:  delta-rs (deltalake >= 1.0)

Environment variables
---------------------
DELTA_TABLE_S3_PATH      Required. S3 URI for the Delta table,
                         e.g. ``s3://my-bucket/path/to/table``.
AWS_ACCESS_KEY_ID        Required. AWS (or compatible) access key.
AWS_SECRET_ACCESS_KEY    Required. AWS (or compatible) secret key.
AWS_REGION               Optional. Defaults to ``us-east-1``.
AWS_ENDPOINT_URL         Optional. Override the S3 endpoint URL to use an
                         S3-compatible service such as Garage or MinIO,
                         e.g. ``http://localhost:3900``.  When this variable
                         is set, delta-rs will route all object-store requests
                         to that URL instead of AWS S3.  This is how the CI
                         fixture (Wave 5) connects to the in-process Garage
                         instance — no code change is needed between real AWS
                         runs and local/CI fixture runs.
"""

from __future__ import annotations

import os

import pyarrow as pa
from deltalake import DeltaTable

# ---------------------------------------------------------------------------
# Required / optional env var names
# ---------------------------------------------------------------------------

_ENV_TABLE_PATH = "DELTA_TABLE_S3_PATH"
_ENV_ACCESS_KEY = "AWS_ACCESS_KEY_ID"
_ENV_SECRET_KEY = "AWS_SECRET_ACCESS_KEY"
_ENV_REGION = "AWS_REGION"
_ENV_ENDPOINT_URL = "AWS_ENDPOINT_URL"  # optional — S3-compatible endpoint override

_REQUIRED_VARS = (_ENV_TABLE_PATH, _ENV_ACCESS_KEY, _ENV_SECRET_KEY)


def _missing_vars() -> list[str]:
    """Return a list of required env vars that are not set."""
    return [v for v in _REQUIRED_VARS if not os.environ.get(v)]


def _build_storage_options() -> dict[str, str]:
    """Build the storage_options dict expected by delta-rs for S3 access.

    delta-rs accepts standard AWS env var names when ``storage_options`` is not
    provided, but building it explicitly makes the mapping visible and allows
    us to inject the optional endpoint URL override in one place.
    """
    opts: dict[str, str] = {
        "AWS_ACCESS_KEY_ID": os.environ[_ENV_ACCESS_KEY],
        "AWS_SECRET_ACCESS_KEY": os.environ[_ENV_SECRET_KEY],
        "AWS_REGION": os.environ.get(_ENV_REGION, "us-east-1"),
    }

    # AWS_ENDPOINT_URL: when set, delta-rs routes requests to this URL instead
    # of real AWS S3.  Used for Garage / MinIO in CI (Wave 5 fixture) and for
    # local development against a containerised object store.
    endpoint = os.environ.get(_ENV_ENDPOINT_URL)
    if endpoint:
        opts["AWS_ENDPOINT_URL"] = endpoint
        # Allow path-style addressing, required by most S3-compatible servers
        opts["AWS_S3_ALLOW_UNSAFE_RENAME"] = "true"

    return opts


# ---------------------------------------------------------------------------
# Main example
# ---------------------------------------------------------------------------


def run() -> dict | None:
    """Read a Delta table from S3 and return summary information.

    Reads all configuration from environment variables (see module docstring).
    If any required variable is absent the function prints a diagnostic message
    and returns ``None`` — this allows syntax checking and import without live
    credentials, which is intentional for CI steps that only validate Python
    syntax.

    Returns
    -------
    dict | None
        On success: a dict with keys ``schema``, ``row_count``, ``version``,
        and ``sample`` (list of dicts, first 3 rows).
        Returns ``None`` when required env vars are missing.
    """
    missing = _missing_vars()
    if missing:
        print(
            "Skipping S3 example — the following required environment variables "
            f"are not set: {', '.join(missing)}\n"
            "Set DELTA_TABLE_S3_PATH, AWS_ACCESS_KEY_ID, and "
            "AWS_SECRET_ACCESS_KEY to run against a real table."
        )
        return None

    table_uri = os.environ[_ENV_TABLE_PATH]
    storage_options = _build_storage_options()

    print(f"Opening Delta table at: {table_uri}")
    endpoint = storage_options.get("AWS_ENDPOINT_URL", "<AWS S3>")
    print(f"S3 endpoint            : {endpoint}")

    # Open table -------------------------------------------------------------
    dt = DeltaTable(table_uri, storage_options=storage_options)

    # Schema inspection ------------------------------------------------------
    schema = dt.schema()
    print("\n=== Delta table schema ===")
    print(schema.to_arrow())

    # Table metadata ---------------------------------------------------------
    version = dt.version()
    metadata = dt.metadata()
    print(f"\nTable name   : {metadata.name or '(none)'}")
    print(f"Table version: {version}")
    print(f"Num files    : {len(dt.file_uris())}")

    # Read all data as an Arrow table ----------------------------------------
    arrow_table: pa.Table = dt.to_pyarrow_dataset().to_table()
    row_count = len(arrow_table)
    print(f"Row count    : {row_count}")

    # Show a few rows --------------------------------------------------------
    sample_rows = arrow_table.slice(0, 3).to_pylist()
    print("\n=== First 3 rows ===")
    for row in sample_rows:
        print(row)

    return {
        "schema": str(schema.to_arrow()),
        "row_count": row_count,
        "version": version,
        "sample": sample_rows,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    run()
