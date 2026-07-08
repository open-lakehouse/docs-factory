"""Shared pytest fixtures for the examples test suite."""

from __future__ import annotations

import importlib.util
import os
import sys
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType

import pytest

EXAMPLES_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def isolated_seed_dir(tmp_path_factory) -> Iterator[None]:
    """Point the seeder at a per-session temp dir so tests never touch the user cache."""
    seed_dir = tmp_path_factory.mktemp("seed")
    os.environ["DOCS_FACTORY_SEED_DIR"] = str(seed_dir)
    yield
    os.environ.pop("DOCS_FACTORY_SEED_DIR", None)


def load_example(engine: str, name: str) -> ModuleType:
    """Import an example module by engine dir + file stem (e.g. 'python', 'read_delta_table')."""
    path = EXAMPLES_ROOT / engine / f"{name}.py"
    mod_name = f"example_{engine}_{name}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module
