"""One docs environment stack at a time, on the whole machine.

Every environment under ``envs/`` publishes the same host ports (the Unity
Catalog server on ``:8080``, object storage on ``:9000``), and the ones that
share a compose project name (``uc-docs``) also share ``container_name:
unitycatalog``. Two stacks can't run side by side, so two checkouts (or two
agent sessions) that each start one tear the other's down mid-run.

This module serializes them, and is the one place that drives ``docker
compose``. The tutorial-script harness (``content/conftest.py``) holds
:func:`lock` from starting a script's compose until it stops it, and
``docsnip stack up|down|status`` (``just env-up|env-down|env-status``) use the
same lock for a stack started by hand. A stack is never replaced silently: a
run that finds another environment up fails and names it.
"""

from __future__ import annotations

import dataclasses
import fcntl
import json
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

# Per user, like the harness's Delta lock: $TMPDIR is shared by every checkout.
LOCK = Path(tempfile.gettempdir()) / "docs-factory-services.lock"


@dataclasses.dataclass(frozen=True)
class Stack:
    """A running compose project whose file is a docs environment."""

    project: str
    status: str
    compose: Path

    @property
    def env(self) -> str:
        return self.compose.parent.name


@contextmanager
def lock() -> Iterator[None]:
    """Hold the machine-wide environment lock, waiting for it if it's taken."""
    with LOCK.open("w") as fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # The real stderr: under pytest, sys.stderr is captured until the
            # test ends, and a silent wait reads as a hang.
            print(
                f"waiting for {LOCK}: another checkout is running a docs environment",
                file=sys.__stderr__,
                flush=True,
            )
            fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def locked() -> bool:
    """Whether some process holds the lock right now."""
    with LOCK.open("w") as fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(fh, fcntl.LOCK_UN)
        return False


class ComposeError(RuntimeError):
    """A ``docker compose`` command failed; carries its command and output."""


def _docker_compose(compose: Path, *args: str, capture: bool = True) -> str:
    """Run ``docker compose -f <compose> <args>``; return its output.

    Captured by default so a failure reports what compose said. ``capture=False``
    streams progress to the terminal, for a stack started by hand.
    """
    cmd = ["docker", "compose", "-f", str(compose), *args]
    out = subprocess.PIPE if capture else None
    proc = subprocess.run(
        cmd, stdout=out, stderr=subprocess.STDOUT if capture else None, text=True
    )
    if proc.returncode != 0:
        raise ComposeError(
            f"`{' '.join(cmd)}` exited {proc.returncode}\n{proc.stdout or ''}"
        )
    return proc.stdout or ""


def compose_up(compose: Path, *, pull: bool = False, capture: bool = True) -> None:
    """Start ``compose`` and wait until its services are healthy."""
    if pull:
        # Built images (the UC server's) come from `up`, not a registry.
        _docker_compose(
            compose, "pull", "--quiet", "--ignore-buildable", capture=capture
        )
    _docker_compose(compose, "up", "--detach", "--wait", capture=capture)


def compose_down(compose: Path, *, capture: bool = True) -> None:
    """Stop ``compose`` and drop its volumes, so the next start is fresh."""
    _docker_compose(compose, "down", "--volumes", capture=capture)


def compose_logs(compose: Path, service: str, lines: int) -> str:
    return _docker_compose(compose, "logs", "--no-color", "--tail", str(lines), service)


def base_url(compose: Path) -> str:
    """Where a client on the host reaches the stack's Unity Catalog server.

    A generated environment's plan says, through a gateway or not; any other
    compose publishes the server's own port.
    """
    plan = compose.parent / "plan.json"
    if plan.is_file():
        return json.loads(plan.read_text())["client"]["host"]["UNITY_CATALOG_URL"]
    host, _, port = (
        _docker_compose(compose, "port", "unitycatalog", "8080").strip().rpartition(":")
    )
    host = "localhost" if host in ("0.0.0.0", "::", "[::]") else host
    return f"http://{host}:{port}/api/2.1/unity-catalog"


def _is_env_compose(path: Path) -> bool:
    return path.name == "compose.yaml" and path.parent.parent.name == "envs"


def running() -> list[Stack]:
    """The docs environments up right now, from any checkout.

    Empty when Docker isn't reachable: the caller's own ``docker compose`` then
    fails with Docker's error, which says more than this could.
    """
    try:
        proc = subprocess.run(
            ["docker", "compose", "ls", "--format", "json"],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return []
    if proc.returncode != 0 or not proc.stdout.strip():
        return []
    stacks = []
    for entry in json.loads(proc.stdout):
        for config in str(entry.get("ConfigFiles", "")).split(","):
            path = Path(config.strip())
            if _is_env_compose(path):
                stacks.append(Stack(entry["Name"], entry.get("Status", ""), path))
                break
    return stacks


def busy_message(stacks: list[Stack]) -> str:
    listed = "\n".join(
        f"  {s.env} ({s.project}, {s.status}): {s.compose}" for s in stacks
    )
    return (
        "a docs environment is already up, and environments share host ports:\n"
        f"{listed}\n"
        "stop it with `just env-down` (from any checkout), then retry"
    )


def _compose(root: Path, name: str) -> Path:
    path = root / "envs" / name / "compose.yaml"
    if not path.is_file():
        names = sorted(p.parent.name for p in (root / "envs").glob("*/compose.yaml"))
        raise SystemExit(f"no environment {name!r}; one of: {', '.join(names)}")
    return path


def up(root: Path, name: str) -> int:
    """Start ``envs/<name>`` for working by hand, if no environment is up."""
    compose = _compose(root, name).resolve()
    with lock():
        stacks = running()
        if [s.compose.resolve() for s in stacks] == [compose]:
            print(f"{name} is already up: {compose}")
            return 0
        if stacks:
            print(busy_message(stacks), file=sys.stderr)
            return 1
        try:
            compose_up(compose, capture=False)
        except ComposeError as exc:
            print(exc, file=sys.stderr)
            return 1
        print(f"{name} is up: UNITY_CATALOG_URL={base_url(compose)}")
    print("stop it with `just env-down` before running scripts")
    return 0


def down() -> int:
    """Stop every docs environment that is up, like the harness does after a run."""
    with lock():
        stacks = running()
        if not stacks:
            print("no docs environment is up")
            return 0
        code = 0
        for stack in stacks:
            try:
                compose_down(stack.compose, capture=False)
            except ComposeError as exc:
                print(exc, file=sys.stderr)
                code = 1
        return code


def status() -> int:
    """Which docs environment is up, and whether a run holds the lock."""
    stacks = running()
    if stacks:
        for s in stacks:
            print(f"up: {s.env} ({s.project}, {s.status}): {s.compose}")
    else:
        print("no docs environment is up")
    print(
        f"lock {LOCK}: {'held by a running script or env-up' if locked() else 'free'}"
    )
    return 0
