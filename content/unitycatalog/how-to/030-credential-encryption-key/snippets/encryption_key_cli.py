# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# lane = "jvm"
# verifies = "encryption_key.sh"
# ///
"""Run encryption_key.sh step by step: store a credential, rotate the key, re-supply the secret."""

import json
import os
import signal
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from docsnip.shellregions import get, regions, run

SCRIPT = Path(__file__).with_name("encryption_key.sh")
BASE_URL = "http://localhost:8080/api/2.1/unity-catalog"
# The first start downloads the server's dependencies.
STARTUP_S = 300
LOCATION = "s3://lake/data"
WARNING = "Cannot read the stored secret of storage credential 'lake-storage'"

# The page assumes a server that keeps its metadata and logs to etc/logs, as
# the container image does. The JBang server does neither without these files.
HIBERNATE = """\
hibernate.connection.driver_class=org.h2.Driver
hibernate.connection.url=jdbc:h2:file:./etc/db/h2db;DB_CLOSE_DELAY=-1
hibernate.hbm2ddl.auto=update
"""
LOG4J = """\
appenders = file
appender.file.type = File
appender.file.name = File
appender.file.fileName = etc/logs/server.log
appender.file.layout.type = PatternLayout
appender.file.layout.pattern = %d{HH:mm:ss.SSS} %-5level %logger{36} - %msg%n
rootLogger.level = info
rootLogger.appenderRefs = file
rootLogger.appenderRef.file.ref = File
"""


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


def _post(path: str, body: dict) -> dict:
    request = urllib.request.Request(
        f"{BASE_URL}/{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as resp:
        return json.load(resp)


def _vend() -> dict:
    """A static-key vend, the one client request that decrypts the stored secret."""
    return _post(
        "temporary-path-credentials", {"url": f"{LOCATION}/x", "operation": "PATH_READ"}
    )


def _vend_fails() -> bool:
    try:
        _vend()
    except urllib.error.HTTPError as exc:
        return exc.code == 500
    return False


def _warnings(workdir: Path) -> int:
    log = workdir / "uc-server/etc/logs/server.log"
    return log.read_text().count(WARNING)


def _old_key_unreadable(workdir: Path) -> None:
    """The server reads with one key only: values stored under the new key don't
    decrypt with the old one, and the server takes no list of previous keys."""
    (workdir / "credential-key").rename(workdir / "credential-key.new")
    (workdir / "credential-key.old").rename(workdir / "credential-key")
    server = _start(workdir)
    try:
        assert _vend_fails()
    finally:
        _stop(server)


if __name__ == "__main__":
    os.environ.update(
        S3_ACCESS_KEY_ID="AKIDEXAMPLE",
        S3_SECRET_ACCESS_KEY="docs-example-secret",
        # Vend the key pair itself, so a client request proves the secret decrypts.
        UC_SERVER_S3_COMPATIBLE_STORAGE_STATIC_KEY_VENDING="static-key",
    )
    workdir = Path(tempfile.mkdtemp(prefix="uc-key-"))
    conf = workdir / "uc-server/etc/conf"
    conf.mkdir(parents=True)
    (conf / "hibernate.properties").write_text(HIBERNATE)
    (conf / "server.log4j2.properties").write_text(LOG4J)
    server = None
    try:
        run(SCRIPT, "generate", cwd=workdir)
        assert (workdir / "credential-key").stat().st_mode & 0o077 == 0
        server = _start(workdir)
        created = json.loads(run(SCRIPT, "create", cwd=workdir))
        assert "secret_access_key" not in created["s3_compatible_access_key"]
        _post(
            "external-locations",
            {
                "name": "lake",
                "url": LOCATION,
                "credential_name": "lake-storage",
                "endpoint": "http://localhost:9000",
                "skip_validation": True,
            },
        )
        assert (
            _vend()["aws_temp_credentials"]["secret_access_key"]
            == "docs-example-secret"
        )

        # A new key leaves the stored secret unreadable until it is supplied again.
        _stop(server)
        run(SCRIPT, "rotate", cwd=workdir)
        server = _start(workdir)
        assert _vend_fails()
        assert "lake-storage" in run(SCRIPT, "unreadable", cwd=workdir)

        run(SCRIPT, "resupply", cwd=workdir)
        assert (
            _vend()["aws_temp_credentials"]["secret_access_key"]
            == "docs-example-secret"
        )
        before = _warnings(workdir)
        _stop(server)
        server = _start(workdir)
        assert _warnings(workdir) == before
        _stop(server)
        server = None

        _old_key_unreadable(workdir)
    finally:
        if server is not None:
            _stop(server)
