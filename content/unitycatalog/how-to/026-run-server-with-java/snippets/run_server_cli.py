# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# lane = "jvm"
# verifies = "run_server.sh"
# ///
"""Run run_server.sh step by step: start, restart, and persist a JBang server."""

import json
import os
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from docsnip.shellregions import get, regions, run

SCRIPT = Path(__file__).with_name("run_server.sh")
BASE_URL = "http://localhost:8080/api/2.1/unity-catalog"
# The first start downloads the server's dependencies.
STARTUP_S = 300


def _start(cwd: Path) -> subprocess.Popen:
    """Start the `start` region in the background, as a reader's own terminal would."""
    server = subprocess.Popen(
        ["bash", "-euo", "pipefail", "-c", regions(SCRIPT)["start"]],
        cwd=cwd,
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + STARTUP_S
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise AssertionError(f"server exited with {server.returncode}")
        try:
            if get(BASE_URL, "catalogs") is not None:
                return server
        except OSError:
            pass
        time.sleep(2)
    raise AssertionError(f"server not up after {STARTUP_S}s")


def _stop(server: subprocess.Popen) -> None:
    """Ctrl+C, for the whole group: bash, JBang, and the JVM."""
    if server.poll() is None:
        os.killpg(server.pid, signal.SIGINT)
        try:
            server.wait(timeout=60)
        except subprocess.TimeoutExpired:
            os.killpg(server.pid, signal.SIGKILL)
            server.wait()


def _catalogs(cwd: Path) -> list[str]:
    return [c["name"] for c in json.loads(run(SCRIPT, "check", cwd=cwd))["catalogs"]]


if __name__ == "__main__":
    workdir = Path(tempfile.mkdtemp(prefix="uc-server-"))
    server = None
    try:
        server = _start(workdir)
        home = workdir / "uc-server"
        # A fresh server starts empty and writes its keys and admin token.
        assert _catalogs(workdir) == []
        for name in ("private_key.der", "public_key.der", "key_id.txt", "token.txt"):
            assert (home / "etc/conf" / name).is_file(), name
        run(SCRIPT, "create", cwd=workdir)
        assert _catalogs(workdir) == ["retail"]

        # Without hibernate.properties the metadata is in memory only.
        _stop(server)
        server = _start(workdir)
        assert _catalogs(workdir) == []

        _stop(server)
        run(SCRIPT, "persist", cwd=workdir)
        server = _start(workdir)
        run(SCRIPT, "create", cwd=workdir)
        _stop(server)
        server = _start(workdir)
        assert _catalogs(workdir) == ["retail"]
        assert (home / "etc/db/h2db.mv.db").is_file()
    finally:
        if server is not None:
            _stop(server)
