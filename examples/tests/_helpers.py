"""Shared loader for the engine-example test suite.

Kept in a plain module (not ``conftest``) so it imports unambiguously by name:
with two conftest files in the tree (this suite and ``content/``), a bare
``import conftest`` would be ambiguous under pytest's import machinery.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

EXAMPLES_ROOT = Path(__file__).resolve().parents[1]


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
