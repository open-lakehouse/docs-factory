"""Pytest plugin: run each colocated tutorial script as its own test.

A tutorial's script is self-contained and self-testing — it declares its own
dependencies (PEP 723) and its runtime prerequisites (a ``[tool.docs-factory]``
table naming the docker-compose to start). *Running the script to completion is
the test*: exit 0 passes; any inline ``assert`` or unhandled exception fails it.
So there are no per-tutorial ``test_*.py`` files — this plugin discovers every
``# /// script`` under ``content/`` and generates one test per script:

    start the declared compose (if any) → `uv run script.py` → assert exit 0

Scripts that declare a ``compose`` are marked ``needs_uc_server`` (derived, not
hand-written), so the default ``pytest`` — which the root config filters with
``-m "not needs_docker and not needs_uc_server"`` — skips them on a Docker-less
machine, while the opt-in service lane runs them for real and fails hard if the
compose can't start.
"""

from __future__ import annotations

import os
import subprocess
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from testcontainers.compose import DockerCompose

# tools/docsnip is a workspace package; its scriptmeta reader is the single
# source of truth for discovering + parsing a script's inline metadata.
from docsnip.scriptmeta import ScriptMeta, parse_script


def pytest_collect_file(parent, file_path):
    """Collect any ``*.py`` under content/ that carries a PEP 723 script block."""
    if file_path.suffix != ".py":
        return None
    meta = parse_script(file_path)
    if meta is None:
        return None
    return TutorialScriptFile.from_parent(parent, path=file_path, script_meta=meta)


class TutorialScriptFile(pytest.File):
    """A discovered tutorial script, collected as a single runnable test."""

    def __init__(self, *args, script_meta: ScriptMeta, **kwargs):
        super().__init__(*args, **kwargs)
        self.script_meta = script_meta

    def collect(self):
        yield TutorialScriptItem.from_parent(
            self, name="run", script_meta=self.script_meta
        )


class TutorialScriptItem(pytest.Item):
    """Run one tutorial script with ``uv run`` and assert it exits 0."""

    def __init__(self, *args, script_meta: ScriptMeta, **kwargs):
        super().__init__(*args, **kwargs)
        self.script_meta = script_meta
        # A script needing services is Docker-gated; derive the marker so the
        # default lane's -m filter deselects it without any hand-marking.
        if script_meta.docs_factory.needs_services:
            self.add_marker(pytest.mark.needs_uc_server)

    def runtest(self):
        env = dict(os.environ)
        base_url = _start_services(self.script_meta)
        try:
            if base_url is not None and self.script_meta.docs_factory.base_url_env:
                env[self.script_meta.docs_factory.base_url_env] = base_url
            proc = subprocess.run(
                ["uv", "run", "--no-project", str(self.script_meta.path)],
                capture_output=True,
                text=True,
                env=env,
            )
            if proc.returncode != 0:
                raise TutorialScriptFailure(self.script_meta, proc)
        finally:
            _stop_services(self.script_meta)

    def repr_failure(self, excinfo, style=None):
        if isinstance(excinfo.value, TutorialScriptFailure):
            return str(excinfo.value)
        return super().repr_failure(excinfo, style=style)

    def reportinfo(self):
        return self.path, 0, f"tutorial script: {self.path.name}"


class TutorialScriptFailure(Exception):
    """A tutorial script exited non-zero; carries its captured output."""

    def __init__(self, meta: ScriptMeta, proc: subprocess.CompletedProcess):
        self.meta = meta
        self.proc = proc

    def __str__(self) -> str:
        return (
            f"`uv run {self.meta.path.name}` exited {self.proc.returncode}\n"
            f"--- stdout ---\n{self.proc.stdout}\n"
            f"--- stderr ---\n{self.proc.stderr}"
        )


# --- compose lifecycle, keyed on the script's [tool.docs-factory] --------------
#
# Cached per compose file so several scripts sharing one compose start it once.
_ACTIVE: dict[str, DockerCompose] = {}


def _start_services(meta: ScriptMeta) -> str | None:
    """Start the compose the script declares (if any); return the server base URL.

    Raising on a missing Docker daemon is deliberate: these tests are opt-in
    (``needs_uc_server``), so once selected they must run for real or fail loudly
    — never skip.
    """
    compose_path = meta.compose_path()
    if compose_path is None:
        return None

    from testcontainers.compose import DockerCompose

    key = str(compose_path)
    compose = DockerCompose(
        context=str(compose_path.parent),
        compose_file_name=compose_path.name,
        pull=True,
        wait=True,
    )
    compose.start()
    _ACTIVE[key] = compose
    host, port = compose.get_service_host_and_port("unitycatalog", 8080)
    return f"http://{host}:{port}/api/2.1/unity-catalog"


def _stop_services(meta: ScriptMeta) -> None:
    compose_path = meta.compose_path()
    if compose_path is None:
        return
    compose = _ACTIVE.pop(str(compose_path), None)
    if compose is not None:
        compose.stop()
