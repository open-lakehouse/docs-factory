"""Shared fixtures for colocated tutorial tests under ``content/``.

Tutorials colocate a runnable, self-describing script with their prose and a
``test_*.py`` beside it. The script's PEP 723 ``[tool.docs-factory]`` metadata
declares its runtime prerequisites (which docker-compose file to start, the env
var to hand it the server URL); these fixtures read that metadata — via the same
``docsnip.scriptmeta`` reader ``docsnip check`` uses — and provision accordingly.

Fixtures:
- ``load_sibling`` — import a script that sits next to the test file, by path.
- ``uv_run`` — run a script standalone with ``uv run`` (the reader's path).
- ``uc_server`` — start the compose the colocated script declares (testcontainers),
  wait for health, and yield its base URL. Gated ``needs_uc_server``; on a machine
  without Docker it raises (never skips) so an opted-in CI run can't quietly pass.

Prereq gating is opt-in-then-fail-hard: tests carrying ``needs_uc_server`` /
``needs_docker`` are deselected by default (see the root pytest config's default
``-m`` filter), so a doc author's plain ``pytest`` stays green with no Docker.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

import pytest

# tools/docsnip is a workspace package; its scriptmeta reader is the single
# source of truth for discovering + parsing a script's inline metadata.
from docsnip.scriptmeta import ScriptMeta, parse_script


def _colocated_script(test_file: Path) -> ScriptMeta:
    """The single ``# /// script`` tutorial script sitting next to a test file."""
    candidates = [
        parsed
        for py in sorted(test_file.parent.glob("*.py"))
        if py.name != test_file.name
        for parsed in (parse_script(py),)
        if parsed is not None
    ]
    if not candidates:
        raise RuntimeError(f"no PEP 723 tutorial script found beside {test_file}")
    if len(candidates) > 1:
        names = ", ".join(c.path.name for c in candidates)
        raise RuntimeError(f"multiple tutorial scripts beside {test_file}: {names}")
    return candidates[0]


@pytest.fixture
def load_sibling():
    """Return a loader that imports a script by absolute path (not as a package).

    Tutorial scripts are intentionally standalone files, not installed modules,
    so we import them by location — mirroring ``examples/tests/conftest.py``'s
    ``load_example`` but keyed on a path rather than an engine/name layout.
    """

    def _load(script_path: Path) -> ModuleType:
        script_path = Path(script_path)
        mod_name = f"tutorial_{script_path.parent.name}_{script_path.stem}"
        spec = importlib.util.spec_from_file_location(mod_name, script_path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[mod_name] = module
        spec.loader.exec_module(module)
        return module

    return _load


@dataclass
class UvRunResult:
    returncode: int
    stdout: str
    stderr: str


@pytest.fixture
def uv_run():
    """Return a runner that executes a script via ``uv run`` (the reader's path).

    ``uv run --no-project`` resolves the script's own PEP 723 dependencies in an
    ephemeral env, so this exercises exactly what a reader gets from copy-pasting
    the tutorial's ``uv run catalog_flow.py`` command.
    """

    def _run(script_path: Path, env: dict[str, str] | None = None) -> UvRunResult:
        import os

        proc = subprocess.run(
            ["uv", "run", "--no-project", str(script_path)],
            capture_output=True,
            text=True,
            env={**os.environ, **(env or {})},
        )
        return UvRunResult(proc.returncode, proc.stdout, proc.stderr)

    return _run


@pytest.fixture
def uc_server(request):
    """Start the compose the colocated tutorial script declares; yield its base URL.

    Reads ``[tool.docs-factory]`` from the script beside the requesting test,
    starts that compose with testcontainers (``wait=True`` → ``docker compose up
    --wait``, honoring the healthcheck), and yields the server base URL. Raising
    on a missing Docker daemon is deliberate: these tests are opt-in
    (``needs_uc_server``), so once selected they must run for real or fail loudly.
    """
    from testcontainers.compose import DockerCompose

    meta = _colocated_script(Path(str(request.fspath)))
    cfg = meta.docs_factory
    if not cfg.compose:
        raise RuntimeError(
            f"{meta.path.name} declares no [tool.docs-factory].compose; "
            "uc_server has nothing to start"
        )

    compose_path = meta.compose_path()
    assert compose_path is not None  # guaranteed by the cfg.compose check above
    compose = DockerCompose(
        context=str(compose_path.parent),
        compose_file_name=compose_path.name,
        pull=True,
        wait=True,
    )
    compose.start()
    try:
        host, port = compose.get_service_host_and_port("unitycatalog", 8080)
        yield f"http://{host}:{port}/api/2.1/unity-catalog"
    finally:
        compose.stop()
