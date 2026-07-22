"""Test the python-client tutorial script against a live Unity Catalog server.

Two complementary checks, both driven by the script's own PEP 723 metadata (the
``services`` fixture reads ``[tool.docs-factory]`` to know which compose to start
and which env var to hand the script):

- ``test_catalog_flow_uv_run`` runs the script exactly as a reader would
  (``uv run``), resolving its inline deps in an ephemeral env — the standalone
  path the tutorial documents.
- ``test_catalog_flow_effects`` imports ``main`` and asserts on observable
  server state (the catalog it created is listable) and on the expected
  ``NotFoundException``.

Both are gated ``needs_uc_server`` (the fixture derives this from the script
declaring a ``compose``), so a default ``pytest`` on a Docker-less machine never
collects them, but CI that opts in fails hard if the server can't start.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.needs_uc_server

SCRIPT = Path(__file__).parent / "catalog_flow.py"


def test_catalog_flow_uv_run(uc_server, uv_run) -> None:
    """The reader path: `uv run catalog_flow.py` exits 0 against the server."""
    result = uv_run(SCRIPT, env={"UC_BASE_URL": uc_server})
    assert result.returncode == 0, result.stderr


async def test_catalog_flow_effects(uc_server, load_sibling) -> None:
    """Import the script's `main`, run it, and assert every step succeeded.

    `main` only returns the full result dict if the catalog, schema, and table
    all created successfully and the `NotFoundException` branch fired — each
    return value is the server-confirmed name from a create call. So an equal
    dict is proof the whole SDK flow round-tripped against the live server (a
    failure anywhere raises before the return).
    """
    mod = load_sibling(SCRIPT)
    created = await mod.main(uc_server)
    assert created == {
        "catalog": "demo_catalog",
        "schema": "demo_catalog.demo_schema",
        "table": "demo_catalog.demo_schema.demo_table",
    }
