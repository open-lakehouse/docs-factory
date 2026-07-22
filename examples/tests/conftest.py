"""Shared pytest fixtures for the examples test suite.

The ``load_example`` loader lives in :mod:`_helpers` (a plain module) so test
modules import it by an unambiguous name; this conftest holds only fixtures.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def isolated_seed_dir(tmp_path_factory) -> Iterator[None]:
    """Point the seeder at a per-session temp dir so tests never touch the user cache."""
    seed_dir = tmp_path_factory.mktemp("seed")
    os.environ["DOCS_FACTORY_SEED_DIR"] = str(seed_dir)
    yield
    os.environ.pop("DOCS_FACTORY_SEED_DIR", None)
