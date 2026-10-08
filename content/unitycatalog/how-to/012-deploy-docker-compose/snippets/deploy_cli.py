# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "pyyaml"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# lane = "docker"
# verifies = "deploy.sh"
# ///
"""Run deploy.sh step by step from a fresh deployment folder, then upgrade a
server of the current release to the one the page pins."""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import yaml
from docsnip import versions
from docsnip.shellregions import get, run

HERE = Path(__file__).parent
SCRIPT = HERE / "deploy.sh"
REPO = HERE.parents[4]
BASE_URL = "http://localhost:8080/api/2.1/unity-catalog"


def deployment_folder() -> Path:
    # Under $HOME: Colima shares only the home directory with its VM, so a
    # bind mount from /tmp would arrive as an empty directory.
    cache = Path.home() / ".cache"
    cache.mkdir(exist_ok=True)
    folder = Path(tempfile.mkdtemp(prefix="uc-deploy-", dir=cache))
    for name in ("compose.yaml", "server.properties"):
        shutil.copy(HERE / name, folder)
    return folder


def check_steps(folder: Path) -> None:
    run(SCRIPT, "write-env", cwd=folder)
    assert (folder / ".env").stat().st_mode & 0o077 == 0
    run(SCRIPT, "start", cwd=folder)
    out = run(SCRIPT, "check", cwd=folder)
    assert '{"healthy":true}' in out, out
    # A PostgreSQL-backed server starts without the image's sample catalogs.
    assert get(BASE_URL, "catalogs")["catalogs"] == []

    run(SCRIPT, "create-catalog", cwd=folder)
    key_id = conf_file(folder, "key_id.txt")
    out = run(SCRIPT, "restart", cwd=folder)
    assert '"name" : "analytics"' in out, out
    assert get(BASE_URL, "catalogs/analytics")["comment"] == "Kept across restarts"
    # New containers reuse the signing keys, so issued tokens stay valid.
    assert conf_file(folder, "key_id.txt") == key_id

    run(SCRIPT, "backup", cwd=folder)
    assert "CREATE TABLE public.uc_catalogs" in (folder / "uc-metadata.sql").read_text()
    assert (folder / "uc-conf-backup" / "private_key.der").is_file()


def check_upgrade(folder: Path) -> None:
    """Start the current release on the same files, then follow the page's upgrade."""
    previous = versions.load(REPO)["release"]
    compose = yaml.safe_load((folder / "compose.yaml").read_text())
    server = compose["services"]["unitycatalog"]
    server["image"] = f"unitycatalog/unitycatalog:v{previous}"
    # The current release predates --obs-port and /readyz.
    server["command"] = ["./bin/start-uc-server"]
    server["healthcheck"]["test"] = [
        "CMD-SHELL",
        f"wget -q -O /dev/null {BASE_URL}/catalogs || exit 1",
    ]
    (folder / "compose.previous.yaml").write_text(yaml.safe_dump(compose))
    compose_cmd = ["docker", "compose", "-f", "compose.previous.yaml"]
    subprocess.run([*compose_cmd, "up", "-d", "--wait"], cwd=folder, check=True)
    subprocess.run(
        [
            *compose_cmd,
            "exec",
            "-T",
            "unitycatalog",
            "bin/uc",
            "catalog",
            "create",
            "--name",
            "upgraded",
        ],
        cwd=folder,
        check=True,
        capture_output=True,
    )
    run(SCRIPT, "upgrade", cwd=folder)
    assert get(BASE_URL, "catalogs/upgraded")["name"] == "upgraded"
    out = subprocess.run(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "unitycatalog",
            "wget",
            "-q",
            "-O",
            "-",
            "http://localhost:8090/readyz",
        ],
        cwd=folder,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert json.loads(out) == {"healthy": True}


def conf_file(folder: Path, name: str) -> str:
    return subprocess.run(
        ["docker", "compose", "exec", "-T", "unitycatalog", "cat", f"etc/conf/{name}"],
        cwd=folder,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


if __name__ == "__main__":
    folder = deployment_folder()
    try:
        check_steps(folder)
        run(SCRIPT, "remove", cwd=folder)
        check_upgrade(folder)
    finally:
        subprocess.run(
            ["docker", "compose", "down", "-v"], cwd=folder, capture_output=True
        )
        shutil.rmtree(folder, ignore_errors=True)
