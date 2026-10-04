# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.postgres.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "backend_db.sh"
# ///
"""Run backend_db.sh task by task and check that metadata outlives the server."""

import os
import subprocess
from pathlib import Path

from docsnip.shellregions import get, run

HERE = Path(__file__).parent
SCRIPT = HERE / "backend_db.sh"
ENV = HERE.parents[4] / "envs" / "unitycatalog"
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")


def properties(path: Path) -> dict[str, str]:
    lines = path.read_text().splitlines()
    return dict(
        line.split("=", 1) for line in lines if line and not line.startswith("#")
    )


def check_production_config() -> None:
    """The page's SQL must run, and the page's properties must match it and the local stack."""
    sql = (HERE / "create-database.sql").read_text()
    subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            "compose.postgres.yaml",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "uc",
            "-d",
            "ucdb",
        ],
        cwd=ENV,
        input=sql,
        text=True,
        check=True,
        capture_output=True,
    )
    page = properties(HERE.parent / "hibernate.properties")
    local = properties(ENV / "hibernate.postgres.properties")
    assert page.keys() == local.keys(), page.keys() ^ local.keys()
    assert page["hibernate.connection.url"].split("?")[0].endswith("/unitycatalog")
    assert page["hibernate.connection.username"] == "unitycatalog"
    assert f"PASSWORD '{page['hibernate.connection.password']}'" in sql


if __name__ == "__main__":
    run(SCRIPT, "start-server", cwd=ENV)
    # A PostgreSQL-backed server starts without the image's sample catalogs.
    assert get(BASE_URL, "catalogs")["catalogs"] == []

    run(SCRIPT, "create-catalog")
    out = run(SCRIPT, "recreate-server", cwd=ENV)
    assert '"name" : "persisted"' in out, out
    assert (
        get(BASE_URL, "catalogs/persisted")["comment"]
        == "Survives a new server container"
    )

    assert "persisted" in run(SCRIPT, "inspect", cwd=ENV)

    try:
        run(SCRIPT, "backup", cwd=ENV)
        assert (
            "CREATE TABLE public.uc_catalogs" in (ENV / "uc-metadata.sql").read_text()
        )
    finally:
        (ENV / "uc-metadata.sql").unlink(missing_ok=True)

    check_production_config()

    run(SCRIPT, "reset", cwd=ENV)
