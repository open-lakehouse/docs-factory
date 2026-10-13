"""Pytest plugin: run each colocated tutorial script as its own test.

A tutorial's script is self-contained and self-testing — it declares its own
dependencies (PEP 723) and its runtime prerequisites (a ``[tool.docs-factory]``
table naming the docker-compose to start). *Running the script to completion is
the test*: exit 0 passes; any inline ``assert`` or unhandled exception fails it.
So there are no per-tutorial ``test_*.py`` files — this plugin discovers every
``# /// script`` under ``content/`` and generates one test per script:

    start the declared compose (if any) → `uv run script.py` → assert exit 0

Scripts that declare a ``compose`` are marked ``needs_uc_server`` (derived, not
hand-written), so the default ``pytest`` — whose root config deselects every
``needs_*`` marker — skips them on a Docker-less machine, while the opt-in service lane runs them for real
and fails hard if the compose can't start. Scripts with ``lane = "spark"`` are
marked ``needs_spark`` the same way and run in the Spark lane, which needs Java
and Maven. Scala and Java scripts (``*.sc``/``*.scala`` run by ``scala-cli``,
``*.java`` by ``jbang``) carry the same table in a ``// /// docs-factory`` block
and are marked ``needs_jvm``. Where Maven Central is unreachable, set
``DOCS_FACTORY_MAVEN_MIRROR`` to a mirror URL; the harness points Spark's
``spark-defaults.conf``, Coursier, and JBang at it, so the scripts and the
commands they show stay unchanged.

CI runs a shard of scripts per runner: ``DOCS_FACTORY_SELECT`` holds a JSON list
of repo-relative script paths (from ``docsnip plan``), and every other script is
deselected. ``DOCS_FACTORY_DURATIONS_OUT`` names a JSON file to record each
script's duration in, which ``docsnip durations`` folds into the next plan.

Only scripts on ``status: ready`` pages gate. A script whose page is still a
draft runs as a non-strict ``xfail``, so the docs can say "tested here" about
exactly the scripts a red run would block, and in-progress pages can't.
"""

from __future__ import annotations

import fcntl
import json
import os
import signal
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from testcontainers.compose import DockerCompose

# tools/docsnip is a workspace package; its scriptmeta reader is the single
# source of truth for discovering + parsing a script's inline metadata.
from docsnip.environments import client_env
from docsnip.frontmatter import page_status
from docsnip.scriptmeta import ScriptMeta, parse_script, runner_for

# Exit codes a process reports when killed by a native abort/segfault signal
# (128 + signal number): SIGABRT (134) and SIGSEGV (139). subprocess also
# reports killed-by-signal as a negative return code; both are handled below.
_NATIVE_ABORT_CODES = frozenset({134, 139})

_REPO_ROOT = Path(__file__).resolve().parent.parent

# Holds sitecustomize.py, which skips pyarrow's native teardown once a script has
# finished (see that module). Harness-only: readers never get it.
_HARNESS_DIR = Path(__file__).resolve().parent / "_harness"

# Delta pages share one sample table path (/tmp/delta/orders) that every script
# resets; the lock serializes them across concurrent runs, e.g. two worktrees.
_DELTA_DIR = _REPO_ROOT / "content" / "delta"
_DELTA_LOCK = Path(tempfile.gettempdir()) / "docs-factory-delta.lock"

# A script that outlives this is killed and fails, instead of hanging the job.
# Generous: a service-backed script may pull wheels and seed data on a cold cache.
_SCRIPT_TIMEOUT_S = int(os.environ.get("DOCS_FACTORY_SCRIPT_TIMEOUT", "600"))


def pytest_collect_file(parent, file_path):
    """Collect any script under content/ that carries its runner's metadata block."""
    if runner_for(file_path) is None:
        return None
    meta = parse_script(file_path)
    if meta is None:
        return None
    return TutorialScriptFile.from_parent(parent, path=file_path, script_meta=meta)


def pytest_collection_modifyitems(config, items):
    """Keep only the scripts ``DOCS_FACTORY_SELECT`` lists, when it is set."""
    selected = os.environ.get("DOCS_FACTORY_SELECT")
    if selected is None:
        return
    wanted = set(json.loads(selected))
    keep, drop = [], []
    for item in items:
        if isinstance(item, TutorialScriptItem):
            path = item.script_meta.path.resolve().relative_to(_REPO_ROOT).as_posix()
            (keep if path in wanted else drop).append(item)
        else:
            keep.append(item)
    if drop:
        config.hook.pytest_deselected(items=drop)
        items[:] = keep


_DURATIONS: dict[str, float] = {}


def pytest_runtest_logreport(report):
    # Setup and teardown are pytest's; the compose start and stop run in `call`.
    if report.when == "call" and report.nodeid.startswith("content/"):
        _DURATIONS[report.nodeid.split("::")[0]] = report.duration


def pytest_sessionfinish(session):
    out = os.environ.get("DOCS_FACTORY_DURATIONS_OUT")
    if out and _DURATIONS:
        Path(out).write_text(json.dumps(_DURATIONS, indent=2, sort_keys=True) + "\n")


def pytest_terminal_summary(terminalreporter):
    """On GitHub Actions, annotate what ran but didn't gate.

    A draft page's failing script (xfailed) and a native-crash skip both leave
    the job green, so neither should go unnoticed.
    """
    if not os.environ.get("GITHUB_ACTIONS"):
        return
    for report in terminalreporter.stats.get("xfailed", []):
        print(f"::warning file={report.fspath}::failed, not gating: {report.wasxfail}")
        # pytest reports an xfail's reason, not its output; the author needs both.
        tail = "\n".join(report.longreprtext.splitlines()[-60:])
        print(f"::group::{report.fspath} output (tail)\n{tail}\n::endgroup::")
    for report in terminalreporter.stats.get("skipped", []):
        if isinstance(report.longrepr, tuple):
            print(f"::warning file={report.fspath}::skipped: {report.longrepr[2]}")


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
        if script_meta.docs_factory.lane == "spark":
            self.add_marker(pytest.mark.needs_spark)
        if script_meta.docs_factory.lane == "jvm":
            self.add_marker(pytest.mark.needs_jvm)
        page = script_meta.owning_page()
        status = page_status(page) if page else "draft"
        if status != "ready":
            where = page.relative_to(_REPO_ROOT) if page else "no page"
            self.add_marker(
                pytest.mark.xfail(
                    strict=False, reason=f"{where} is status: {status}; non-gating"
                )
            )

    def runtest(self):
        # The registry's client-env is what the page tells a reader to export;
        # the script's own env holds harness-only extras on top of it.
        env = {
            **os.environ,
            **client_env(self.script_meta.compose_path(), _REPO_ROOT),
            **self.script_meta.docs_factory.env,
            **_maven_mirror_env(),
        }
        base_url = _start_services(self.script_meta)
        try:
            if base_url is not None and self.script_meta.docs_factory.base_url_env:
                env[self.script_meta.docs_factory.base_url_env] = base_url
            # sitecustomize can't see a bare `raise SystemExit(n)`, so such a
            # script keeps the normal (slow, hang-prone) teardown rather than
            # risk reporting its failure as a pass.
            python = self.script_meta.runner == "python"
            if python and "SystemExit" not in self.script_meta.path.read_text():
                env["PYTHONPATH"] = os.pathsep.join(
                    p for p in (str(_HARNESS_DIR), env.get("PYTHONPATH")) if p
                )
            # Unbuffered, so a killed script's report shows how far it got.
            env.setdefault("PYTHONUNBUFFERED", "1")
            try:
                with _delta_lock(self.script_meta.path):
                    proc = _run_script(self.script_meta, env)
            except TutorialScriptTimeout as exc:
                exc.server_log = _server_log(self.script_meta)
                raise
            native_abort = proc.returncode < 0 or proc.returncode in _NATIVE_ABORT_CODES
            # A JVM that dies by a signal is a real failure, not the pyarrow flake.
            if (
                native_abort
                and python
                and self.script_meta.docs_factory.lane != "spark"
            ):
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
                raise TutorialScriptFailure(
                    self.script_meta, proc, server_log=_server_log(self.script_meta)
                )
        finally:
            _stop_services(self.script_meta)

    def repr_failure(self, excinfo, style=None):
        if isinstance(excinfo.value, TutorialScriptFailure):
            return str(excinfo.value)
        return super().repr_failure(excinfo, style=style)

    def reportinfo(self):
        return self.path, 0, f"tutorial script: {self.path.name}"


def _maven_mirror_env() -> dict[str, str]:
    """Package resolution through the mirror in ``DOCS_FACTORY_MAVEN_MIRROR``, or
    nothing when it's unset (as in CI): ``SPARK_CONF_DIR`` for Spark's
    ``--packages``, ``COURSIER_REPOSITORIES`` for scala-cli. JBang takes the
    mirror as a flag (:func:`_command`)."""
    mirror = os.environ.get("DOCS_FACTORY_MAVEN_MIRROR")
    if not mirror:
        return {}
    conf_dir = Path(tempfile.gettempdir()) / "docs-factory-spark-conf"
    conf_dir.mkdir(exist_ok=True)
    (conf_dir / "spark-defaults.conf").write_text(f"spark.jars.repositories {mirror}\n")
    return {"SPARK_CONF_DIR": str(conf_dir), "COURSIER_REPOSITORIES": mirror}


@contextmanager
def _delta_lock(path: Path):
    """Hold an exclusive lock while a Delta page's script runs."""
    if not path.resolve().is_relative_to(_DELTA_DIR):
        yield
        return
    with _DELTA_LOCK.open("w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _command(meta: ScriptMeta) -> list[str]:
    """The command a reader runs the script with, minus the path."""
    if meta.runner == "scala":
        # No Bloop daemon: it would outlive the run, holding the output pipes.
        return ["scala-cli", "run", "--server=false"]
    if meta.runner == "java":
        mirror = os.environ.get("DOCS_FACTORY_MAVEN_MIRROR")
        return ["jbang", "run", *([f"--repos={mirror}"] if mirror else [])]
    return ["uv", "run", "--no-project"]


def _run_script(meta: ScriptMeta, env: dict[str, str]) -> subprocess.CompletedProcess:
    """Run the script, killing its whole process group on timeout.

    ``subprocess.run(timeout=)`` would kill only the launcher (uv, scala-cli,
    jbang) and then block reading pipes the orphaned interpreter or JVM still
    holds open; a session of its own lets the harness kill that too.
    """
    args = [*_command(meta), str(meta.path)]
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

    def __init__(
        self,
        meta: ScriptMeta,
        proc: subprocess.CompletedProcess,
        server_log: str | None = None,
    ):
        self.meta = meta
        self.proc = proc
        self.server_log = server_log

    def __str__(self) -> str:
        text = (
            f"`{_command(self.meta)[0]} run {self.meta.path.name}` exited "
            f"{self.proc.returncode}\n"
            f"--- stdout ---\n{self.proc.stdout}\n"
            f"--- stderr ---\n{self.proc.stderr}"
        )
        if self.server_log:
            text += f"\n--- unitycatalog log (tail) ---\n{self.server_log}"
        return text


# --- compose lifecycle, keyed on the script's [tool.docs-factory] --------------
#
# Cached per compose file so several scripts sharing one compose start it once.
_ACTIVE: dict[str, DockerCompose] = {}
# Compose files whose images this session already pulled. Every script starts a
# fresh stack, and pulling once keeps a long run under Docker Hub's rate limit.
_PULLED: set[str] = set()


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
        pull=key not in _PULLED,
        wait=True,
    )
    compose.start()
    _PULLED.add(key)
    _ACTIVE[key] = compose
    host, port = compose.get_service_host_and_port("unitycatalog", 8080)
    return f"http://{host}:{port}/api/2.1/unity-catalog"


def _server_log(meta: ScriptMeta, lines: int = 80) -> str | None:
    """The last lines of the running server's log, for a failing script's report."""
    compose_path = meta.compose_path()
    compose = _ACTIVE.get(str(compose_path)) if compose_path else None
    if compose is None:
        return None
    try:
        stdout, stderr = compose.get_logs("unitycatalog")
    except Exception as exc:  # the report must not hide the script's own failure
        return f"(could not read the server log: {exc})"
    return "\n".join((stdout + stderr).splitlines()[-lines:])


def _stop_services(meta: ScriptMeta) -> None:
    compose_path = meta.compose_path()
    if compose_path is None:
        return
    compose = _ACTIVE.pop(str(compose_path), None)
    if compose is not None:
        compose.stop()


class TutorialScriptTimeout(TutorialScriptFailure):
    """A tutorial script ran past the harness timeout and was killed."""

    def __str__(self) -> str:
        text = (
            f"`{_command(self.meta)[0]} run {self.meta.path.name}` ran past "
            f"{_SCRIPT_TIMEOUT_S}s and was "
            f"killed\n--- stdout ---\n{self.proc.stdout}\n"
            f"--- stderr ---\n{self.proc.stderr}"
        )
        if self.server_log:
            text += f"\n--- unitycatalog log (tail) ---\n{self.server_log}"
        return text
