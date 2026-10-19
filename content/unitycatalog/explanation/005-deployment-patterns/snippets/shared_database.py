# /// script
# requires-python = ">=3.11"
# dependencies = []
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-local/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The harness runs from the repo root, not the environment's folder.
# env = { UC_LOCAL_DIR = "envs/uc-local" }
# ///
"""Two Unity Catalog servers on one PostgreSQL database serve one catalog.

Run it from the folder of the `uc-local` environment (`uc-docs-env/uc-local`)
after `docker compose up -d --wait`. It starts a second server on port 8081
against the same database, creates a catalog through each server, checks that
the other server lists it, then restarts both servers and checks again. It
removes the catalogs and the second server when it finishes.
"""

import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

FIRST = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
SECOND = "http://localhost:8081/api/2.1/unity-catalog"
SECOND_NAME = "uc-local-second-server"
# The uc-local environment's folder, where `docker compose` finds the stack.
ENV = Path(os.environ.get("UC_LOCAL_DIR", "."))


def call(base: str, method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{base}/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        text = response.read()
    # DELETE answers with a bare `true`.
    return json.loads(text) if method != "DELETE" and text else {}


def catalogs(base: str) -> dict[str, str | None]:
    listed = call(base, "GET", "catalogs").get("catalogs", [])
    return {c["name"]: c.get("comment") for c in listed}


def wait_for(base: str, seconds: int = 120) -> None:
    deadline = time.monotonic() + seconds
    while True:
        try:
            catalogs(base)
            return
        except (urllib.error.URLError, ConnectionError, OSError):
            if time.monotonic() > deadline:
                raise
            time.sleep(2)


def docker(*args: str) -> str:
    done = subprocess.run(["docker", *args], cwd=ENV, capture_output=True, text=True)
    assert done.returncode == 0, f"docker {' '.join(args)}: {done.stderr}"
    return done.stdout.strip()


def first_server() -> str:
    """The stack's own server container, not a `docker compose run` one."""
    return docker(
        "ps",
        "-q",
        "--filter",
        "label=com.docker.compose.project=uc-local",
        "--filter",
        "label=com.docker.compose.service=unitycatalog",
        "--filter",
        "label=com.docker.compose.oneoff=False",
    )


def drop_catalogs() -> None:
    for name in ("from_a", "from_b"):
        try:
            call(FIRST, "DELETE", f"catalogs/{name}?force=true")
        except urllib.error.HTTPError as err:
            if err.code != 404:
                raise


if __name__ == "__main__":
    wait_for(FIRST)
    # The database outlives the stack, so a run cut short leaves its catalogs.
    drop_catalogs()
    docker(
        "compose", "run", "-d", "--no-deps", "--name", SECOND_NAME,
        "-p", "8081:8080", "unitycatalog",
    )
    try:
        wait_for(SECOND)

        call(FIRST, "POST", "catalogs", {"name": "from_a", "comment": "Created on 8080"})
        assert catalogs(SECOND).get("from_a") == "Created on 8080", catalogs(SECOND)

        call(SECOND, "POST", "catalogs", {"name": "from_b", "comment": "Created on 8081"})
        assert catalogs(FIRST).get("from_b") == "Created on 8081", catalogs(FIRST)

        first = first_server()
        assert first, "the stack's unitycatalog container isn't running"
        docker("restart", first, SECOND_NAME)
        wait_for(FIRST)
        wait_for(SECOND)
        for base in (FIRST, SECOND):
            listed = catalogs(base)
            assert {"from_a", "from_b"} <= listed.keys(), (base, listed)
    finally:
        subprocess.run(["docker", "rm", "-f", SECOND_NAME], capture_output=True)
        drop_catalogs()
