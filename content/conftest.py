"""Pytest plugin: run each colocated tutorial script as its own test.

A tutorial's script is self-contained and self-testing — it declares its own
dependencies (PEP 723) and its runtime prerequisites (a ``[tool.docs-factory]``
table naming the docker-compose to start). *Running the script to completion is
the test*: exit 0 passes; any inline ``assert`` or unhandled exception fails it.
So there are no per-tutorial ``test_*.py`` files — this plugin discovers every
``# /// script`` under ``content/`` and generates one test per script:

    start the declared compose (if any) → `uv run script.py` → assert exit 0

Every script belongs to one lane, the toolchain it needs
(:func:`docsnip.ciplan.lane_of`): ``services`` for a script that declares a
``compose`` (Docker; the run fails hard if the compose can't start), ``spark``
for ``lane = "spark"`` (Java and Maven), ``jvm`` for Scala and Java scripts
(``*.sc``/``*.scala`` run by ``scala-cli``, ``*.java`` by ``jbang``, with the
same table in a ``// /// docs-factory`` block), ``rust`` for the snippets
crate's examples (``content/_rust``, run with ``cargo run --example``), and
``default`` for the rest. A run keeps the lane ``DOCS_FACTORY_LANE`` names
(``default`` when unset, so a bare ``pytest`` needs neither Docker nor Java;
``all`` keeps every lane). Where Maven Central is unreachable, set
``DOCS_FACTORY_MAVEN_MIRROR`` to a mirror URL; the harness points Spark's
``spark-defaults.conf``, Coursier, and JBang at it, so the scripts and the
commands they show stay unchanged.

CI runs a shard of scripts per runner: ``DOCS_FACTORY_SELECT`` holds a JSON list
of repo-relative script paths (from ``docsnip plan``), and every other script is
deselected, whatever its lane. ``DOCS_FACTORY_DURATIONS_OUT`` names a JSON file to record each
script's duration in; the next run's ``docsnip plan`` packs shards by it.

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

import pytest

# tools/docsnip is a workspace package; its scriptmeta reader is the single
# source of truth for discovering + parsing a script's inline metadata.
from docsnip import stacks
from docsnip.ciplan import LANES, lane_of
from docsnip.environments import client_env
from docsnip.frontmatter import page_status
from docsnip.scriptmeta import ScriptMeta, parse_script, runner_for

_REPO_ROOT = Path(__file__).resolve().parent.parent

# Holds sitecustomize.py, which skips pyarrow's native teardown once a script has
# finished (see that module). Harness-only: readers never get it.
_HARNESS_DIR = Path(__file__).resolve().parent / "_harness"

# Delta pages share one sample table path (/tmp/delta/orders) that every script
# resets; the lock serializes them across concurrent runs, e.g. two worktrees.
_DELTA_DIR = _REPO_ROOT / "content" / "delta"
_DELTA_LOCK = Path(tempfile.gettempdir()) / "docs-factory-delta.lock"

# A script that outlives this is killed and fails, instead of hanging the job.
# About 3x the slowest healthy script, which may pull wheels on a cold cache.
_SCRIPT_TIMEOUT_S = int(os.environ.get("DOCS_FACTORY_SCRIPT_TIMEOUT", "300"))


def pytest_collect_file(parent, file_path):
    """Collect any script under content/ that carries its runner's metadata block."""
    if runner_for(file_path) is None:
        return None
    meta = parse_script(file_path)
    if meta is None:
        return None
    return TutorialScriptFile.from_parent(parent, path=file_path, script_meta=meta)


def pytest_collection_modifyitems(config, items):
    """Keep the scripts ``DOCS_FACTORY_SELECT`` lists, or else those of the
    lane ``DOCS_FACTORY_LANE`` names.

    A ``DOCS_FACTORY_SELECT`` entry is a script path or a folder
    (``just test-snippet <page dir>``), repo-relative, which selects every
    script under it.
    """
    selected = os.environ.get("DOCS_FACTORY_SELECT")
    if selected is not None:
        wanted = {Path(w).as_posix().rstrip("/") for w in json.loads(selected)}

        def keep_script(item: TutorialScriptItem) -> bool:
            path = item.script_meta.path.resolve().relative_to(_REPO_ROOT)
            return not wanted.isdisjoint(
                {path.as_posix(), *map(Path.as_posix, path.parents)}
            )
    else:
        lane = os.environ.get("DOCS_FACTORY_LANE", "default")
        if lane not in (*LANES, "all"):
            raise pytest.UsageError(
                f"DOCS_FACTORY_LANE={lane!r}; one of: {', '.join(LANES)}, all"
            )

        def keep_script(item: TutorialScriptItem) -> bool:
            return lane in ("all", item.lane)

    keep, drop = [], []
    for item in items:
        if isinstance(item, TutorialScriptItem) and not keep_script(item):
            drop.append(item)
        else:
            keep.append(item)
    if drop:
        config.hook.pytest_deselected(items=drop)
        items[:] = keep


_DURATIONS: dict[str, float] = {}
# Scripts that timed out and were re-run under their `retries`, one entry a retry.
_RETRIED: list[Path] = []


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

    A draft page's failing script (xfailed) and a retried timeout both leave
    the job green, so neither should go unnoticed.
    """
    if not os.environ.get("GITHUB_ACTIONS"):
        return
    for report in terminalreporter.stats.get("xfailed", []):
        print(f"::warning file={report.fspath}::failed, not gating: {report.wasxfail}")
        # pytest reports an xfail's reason, not its output; the author needs both.
        tail = "\n".join(report.longreprtext.splitlines()[-60:])
        print(f"::group::{report.fspath} output (tail)\n{tail}\n::endgroup::")
    for path in _RETRIED:
        rel = path.resolve().relative_to(_REPO_ROOT)
        print(f"::warning file={rel}::timed out and was retried")


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
        self.lane = lane_of(script_meta)
        page = script_meta.owning_page()
        status = page_status(page) if page else "draft"
        if status != "ready":
            where = page.relative_to(_REPO_ROOT) if page else "no page"
            # Only the script's own failure is excused: a missing runner or a
            # harness error still fails the lane.
            self.add_marker(
                pytest.mark.xfail(
                    strict=False,
                    raises=TutorialScriptFailure,
                    reason=f"{where} is status: {status}; non-gating",
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
        retries = self.script_meta.docs_factory.retries
        for attempt in range(retries + 1):
            try:
                self._run_once(env)
                return
            except TutorialScriptTimeout:
                if attempt == retries:
                    raise
                _RETRIED.append(self.script_meta.path)

    def _run_once(self, env: dict[str, str]) -> None:
        """One run of the script on a fresh stack."""
        with _services_lock(self.script_meta):
            self._run_on_stack(env)

    def _run_on_stack(self, env: dict[str, str]) -> None:
        try:
            # Inside the try: a stack that fails to come up halfway still goes
            # down, or every later script would find it up and fail.
            base_url = _start_services(self.script_meta)
            if base_url is not None and self.script_meta.docs_factory.base_url_env:
                env[self.script_meta.docs_factory.base_url_env] = base_url
            try:
                with _delta_lock(self.script_meta.path):
                    proc = _run_script(self.script_meta, env)
            except TutorialScriptTimeout as exc:
                exc.server_log = _server_log(self.script_meta)
                raise
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
def _services_lock(meta: ScriptMeta):
    """Hold the machine-wide environment lock from compose start to stop.

    Every environment publishes the same host ports, so a second checkout's
    run would replace this stack mid-script. Under the lock, any docs
    environment still up was started by hand (``just env-up``) or left over
    from a killed run, and replacing it would be silent, so fail and name it.
    """
    if meta.compose_path() is None:
        yield
        return
    with stacks.lock():
        if running := stacks.running():
            pytest.fail(stacks.busy_message(running), pytrace=False)
        yield


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
    """The command that runs the script; :func:`_run_script` appends the path,
    except for a Rust script, whose example name already names it."""
    if meta.runner == "scala":
        # No Bloop daemon: it would outlive the run, holding the output pipes.
        return ["scala-cli", "run", "--server=false"]
    if meta.runner == "java":
        mirror = os.environ.get("DOCS_FACTORY_MAVEN_MIRROR")
        return ["jbang", "run", *([f"--repos={mirror}"] if mirror else [])]
    if meta.runner == "rust":
        # The lane builds the examples first, so this only links and runs.
        return [
            "cargo",
            "run",
            "--quiet",
            "--locked",
            "--manifest-path",
            str(_REPO_ROOT / "Cargo.toml"),
            "--package",
            "docs-factory-snippets",
            "--example",
            str(meta.cargo_example),
        ]
    return ["uv", "run", "--no-project"]


def _timeout_s(meta: ScriptMeta) -> int:
    return meta.docs_factory.timeout or _SCRIPT_TIMEOUT_S


def _run_script(meta: ScriptMeta, env: dict[str, str]) -> subprocess.CompletedProcess:
    """Run the script, killing its whole process group on timeout.

    ``subprocess.run(timeout=)`` would kill only the launcher (uv, scala-cli,
    jbang) and then block reading pipes the orphaned interpreter or JVM still
    holds open; a session of its own lets the harness kill that too.
    """
    args = [*_command(meta), *([] if meta.runner == "rust" else [str(meta.path)])]
    with subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        start_new_session=True,
    ) as proc:
        try:
            stdout, stderr = proc.communicate(timeout=_timeout_s(meta))
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
# Every script gets a fresh stack: up before it runs, down (with volumes) after.
# Compose files whose images this session already pulled; pulling once keeps a
# long run under Docker Hub's rate limit.
_PULLED: set[Path] = set()


def _start_services(meta: ScriptMeta) -> str | None:
    """Start the compose the script declares (if any); return the server base URL.

    Raising on a missing Docker daemon is deliberate: a script that declares a
    compose runs only in the ``services`` lane or when selected by path, so
    once selected it must run for real or fail loudly, never skip.
    """
    compose_path = meta.compose_path()
    if compose_path is None:
        return None
    stacks.compose_up(compose_path, pull=compose_path not in _PULLED)
    _PULLED.add(compose_path)
    return stacks.base_url(compose_path)


def _server_log(meta: ScriptMeta, lines: int = 80) -> str | None:
    """The last lines of the running server's log, for a failing script's report."""
    compose_path = meta.compose_path()
    if compose_path is None:
        return None
    try:
        return stacks.compose_logs(compose_path, "unitycatalog", lines)
    except Exception as exc:  # the report must not hide the script's own failure
        return f"(could not read the server log: {exc})"


def _stop_services(meta: ScriptMeta) -> None:
    compose_path = meta.compose_path()
    if compose_path is not None:
        stacks.compose_down(compose_path)


class TutorialScriptTimeout(TutorialScriptFailure):
    """A tutorial script ran past the harness timeout and was killed."""

    def __str__(self) -> str:
        text = (
            f"`{_command(self.meta)[0]} run {self.meta.path.name}` ran past "
            f"{_timeout_s(self.meta)}s and was "
            f"killed\n--- stdout ---\n{self.proc.stdout}\n"
            f"--- stderr ---\n{self.proc.stderr}"
        )
        if self.server_log:
            text += f"\n--- unitycatalog log (tail) ---\n{self.server_log}"
        return text
