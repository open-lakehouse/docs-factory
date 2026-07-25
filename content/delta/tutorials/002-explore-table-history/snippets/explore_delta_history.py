# /// script
# requires-python = ">=3.11"
# dependencies = ["deltalake>=0.20", "pyarrow>=14", "docs-factory-seed"]
#
# [tool.uv.sources]
# docs-factory-seed = { path = "../../../../../seed/python", editable = true }
# ///
"""Explore a Delta table's version history end to end, with the deltalake package.

A multi-step *journey* example: one runnable, tested file whose named regions
render as ordered steps on the docs page (open -> inspect history -> time-travel
-> compare). Seeding and the ``main`` wrapper live outside the regions so the
file runs in CI, while each region stays a self-contained, copy/paste-runnable
snippet (each imports what it needs).

Running this file to completion is its test (content/conftest.py runs it via
`uv run`): the asserts below fail the build if the numbers ever drift.
"""

from docs_factory_seed import seed_dataset


def open_table() -> str:
    path = seed_dataset("orders")
    # --8<-- [start:open]
    from deltalake import DeltaTable

    dt = DeltaTable(path)
    print(f"table at version {dt.version()}")
    # --8<-- [end:open]
    return path


def inspect_history(path: str) -> int:
    # --8<-- [start:history]
    from deltalake import DeltaTable

    dt = DeltaTable(path)
    history = dt.history()  # newest commit first
    for commit in history:
        print(commit.get("operation"), commit.get("version"))
    # --8<-- [end:history]
    return len(history)


def read_as_of(path: str) -> tuple[int, int]:
    # --8<-- [start:time-travel]
    from deltalake import DeltaTable

    latest = DeltaTable(path)  # newest version
    v0 = DeltaTable(path, version=0)  # the first commit

    latest_rows = latest.to_pyarrow_table().num_rows
    v0_rows = v0.to_pyarrow_table().num_rows
    print(f"v0 had {v0_rows} rows; latest has {latest_rows}")
    # --8<-- [end:time-travel]
    return v0_rows, latest_rows


def explore_delta_history() -> tuple[int, int, int]:
    """Run the whole journey and return (n_commits, v0_rows, latest_rows)."""
    path = open_table()
    n_commits = inspect_history(path)
    v0_rows, latest_rows = read_as_of(path)
    return n_commits, v0_rows, latest_rows


if __name__ == "__main__":
    n_commits, v0_rows, latest_rows = explore_delta_history()
    assert n_commits == 2, f"expected 2 commits (write, delete), got {n_commits}"
    assert v0_rows == 1000, f"expected 1000 rows at v0, got {v0_rows}"
    assert latest_rows == 950, f"expected 950 rows at latest, got {latest_rows}"
