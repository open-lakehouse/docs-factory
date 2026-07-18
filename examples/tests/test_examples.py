"""Tests for the tested-engine examples (deltalake, DuckDB, Polars).

These assert the examples actually run and produce correct results — the same
code path a reader of the docs runs after copy/pasting. This is what keeps the
published snippets from drifting into being wrong. Engines covered here are the
ones marked ``built`` in docsnip's BUILT_ENGINES.
"""

from __future__ import annotations

from conftest import load_example
from docs_factory_seed import seed_dataset


def test_read_delta_table_returns_all_rows() -> None:
    mod = load_example("python", "read_delta_table")
    path = seed_dataset("orders")
    n = mod.read_delta_table(path)
    assert n == 950  # latest version (v1) after the deterministic delete


def test_time_travel_sees_history() -> None:
    mod = load_example("python", "time_travel_read")
    v0_rows, latest_rows = mod.time_travel_read()
    assert v0_rows == 1000  # initial load
    assert latest_rows == 950  # after delete
    assert v0_rows > latest_rows


def test_explore_delta_history_journey() -> None:
    # The multi-step journey example: every region runs as one file.
    mod = load_example("python", "explore_delta_history")
    n_commits, v0_rows, latest_rows = mod.explore_delta_history()
    assert n_commits == 2  # the orders table has two commits (write, delete)
    assert v0_rows == 1000  # first commit
    assert latest_rows == 950  # after delete


def test_duckdb_read_delta_table_returns_all_rows() -> None:
    mod = load_example("duckdb", "read_delta_table")
    path = seed_dataset("orders")
    n = mod.read_delta_table(path)
    assert n == 950  # latest version, same table the deltalake reader sees


def test_polars_read_delta_table_returns_all_rows() -> None:
    mod = load_example("polars", "read_delta_table")
    n = mod.read_delta_table()
    assert n == 950  # latest version
