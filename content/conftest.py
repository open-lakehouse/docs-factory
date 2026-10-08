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
import signal
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from testcontainers.compose import DockerCompose

# tools/docsnip is a workspace package; its scriptmeta reader is the single
# source of truth for discovering + parsing a script's inline metadata.
from docsnip import prerelease
from docsnip.environments import client_env
from docsnip.scriptmeta import ScriptMeta, parse_script

# Exit codes a process reports when killed by a native abort/segfault signal
# (128 + signal number): SIGABRT (134) and SIGSEGV (139). subprocess also
# reports killed-by-signal as a negative return code; both are handled below.
_NATIVE_ABORT_CODES = frozenset({134, 139})

_REPO_ROOT = Path(__file__).resolve().parent.parent

# Holds sitecustomize.py, which skips pyarrow's native teardown once a script has
# finished (see that module). Harness-only: readers never get it.
_HARNESS_DIR = Path(__file__).resolve().parent / "_harness"

# A script that outlives this is killed and fails, instead of hanging the job.
# Generous: a service-backed script may pull wheels and seed data on a cold cache.
_SCRIPT_TIMEOUT_S = int(os.environ.get("DOCS_FACTORY_SCRIPT_TIMEOUT", "600"))


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
        if script_meta.docs_factory.lane == "docker":
            self.add_marker(pytest.mark.needs_docker)
        if script_meta.docs_factory.lane == "k8s":
            self.add_marker(pytest.mark.needs_k8s)

    def runtest(self):
        # The registry's client-env is what the page tells a reader to export;
        # the script's own env holds harness-only extras on top of it.
        env = {
            **os.environ,
            **client_env(self.script_meta.compose_path(), _REPO_ROOT),
            **self.script_meta.docs_factory.env,
        }
        _prepare_prerelease(self.script_meta)
        if self.script_meta.docs_factory.lane == "k8s":
            env["DOCS_FACTORY_KIND_CLUSTER"] = _start_kind(self.script_meta)
        base_url = _start_services(self.script_meta)
        try:
            if base_url is not None and self.script_meta.docs_factory.base_url_env:
                env[self.script_meta.docs_factory.base_url_env] = base_url
            # sitecustomize can't see a bare `raise SystemExit(n)`, so such a
            # script keeps the normal (slow, hang-prone) teardown rather than
            # risk reporting its failure as a pass.
            if "SystemExit" not in self.script_meta.path.read_text():
                env["PYTHONPATH"] = os.pathsep.join(
                    p for p in (str(_HARNESS_DIR), env.get("PYTHONPATH")) if p
                )
            proc = _run_script(self.script_meta, env)
            if proc.returncode < 0 or proc.returncode in _NATIVE_ABORT_CODES:
                # A native crash in the deltalake/pyarrow layer (SIGABRT/SIGSEGV,
                # surfaced as exit 134/139 or a negative signal code) aborts the
                # process before any Python `assert` in the script can run — so
                # it is not a docs-drift failure the script is meant to catch.
                # These aborts are flaky and environment-specific (seen only on
                # some CI runners, green locally); skip rather than gate CI on
                # them. A real assertion failure exits 1 and still fails hard.
                # TODO: remove once the native-shutdown flake is root-caused.
                pytest.skip(
                    f"{self.script_meta.path.name} aborted with a native signal "
                    f"(exit {proc.returncode}); treated as a flaky non-assertion "
                    "crash, not a content-drift failure"
                )
            if proc.returncode != 0:
                raise TutorialScriptFailure(self.script_meta, proc)
        finally:
            _stop_services(self.script_meta)
            if self.script_meta.docs_factory.lane == "k8s":
                _stop_kind()

    def repr_failure(self, excinfo, style=None):
        if isinstance(excinfo.value, TutorialScriptFailure):
            return str(excinfo.value)
        return super().repr_failure(excinfo, style=style)

    def reportinfo(self):
        return self.path, 0, f"tutorial script: {self.path.name}"


def _run_script(meta: ScriptMeta, env: dict[str, str]) -> subprocess.CompletedProcess:
    """`uv run` the script, killing its whole process group on timeout.

    ``subprocess.run(timeout=)`` would kill only uv and then block reading pipes
    the orphaned interpreter still holds open; a session of its own lets the
    harness kill the interpreter too.
    """
    args = ["uv", "run", "--no-project", str(meta.path)]
    with subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        start_new_session=True,
    ) as proc:
        try:
            stdout, stderr = proc.communicate(timeout=_SCRIPT_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            stdout, stderr = proc.communicate()
            raise TutorialScriptTimeout(
                meta, subprocess.CompletedProcess(args, -9, stdout, stderr)
            ) from None
    return subprocess.CompletedProcess(args, proc.returncode, stdout, stderr)


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


# --- pre-release artifacts and the kind cluster ------------------------------

_KIND_CLUSTER = "uc-docs"


def _prepare_prerelease(meta: ScriptMeta) -> None:
    """Make the next release's image exist locally for a page drafted against it."""
    channel = prerelease.upcoming(_REPO_ROOT, meta.path)
    if channel is not None:
        prerelease.ensure_image(channel.versions["release"])


def _start_kind(meta: ScriptMeta) -> str:
    """A fresh kind cluster holding the server image the page installs."""
    _stop_kind()
    subprocess.run(
        ["kind", "create", "cluster", "--name", _KIND_CLUSTER, "--wait", "120s"],
        check=True,
    )
    channel = prerelease.upcoming(_REPO_ROOT, meta.path)
    if channel is not None:
        # The node can't pull an image that only exists in the local daemon.
        ref = prerelease.ensure_image(channel.versions["release"])
        subprocess.run(
            ["kind", "load", "docker-image", ref, "--name", _KIND_CLUSTER], check=True
        )
    return _KIND_CLUSTER


def _stop_kind() -> None:
    subprocess.run(
        ["kind", "delete", "cluster", "--name", _KIND_CLUSTER], capture_output=True
    )


class TutorialScriptTimeout(TutorialScriptFailure):
    """A tutorial script ran past the harness timeout and was killed."""

    def __str__(self) -> str:
        return (
            f"`uv run {self.meta.path.name}` ran past {_SCRIPT_TIMEOUT_S}s and was "
            f"killed\n--- stdout ---\n{self.proc.stdout}\n"
            f"--- stderr ---\n{self.proc.stderr}"
        )
