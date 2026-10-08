# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# lane = "k8s"
# verifies = "deploy.sh"
# ///
"""Run deploy.sh step by step against the kind cluster the harness started."""

import subprocess
import tempfile
import time
from pathlib import Path

from docsnip import prerelease, versions
from docsnip.shellregions import get, regions, run

HERE = Path(__file__).parent
SCRIPT = HERE / "deploy.sh"
REPO = HERE.parents[4]
BASE_URL = "http://localhost:8080/api/2.1/unity-catalog"
# The page's pins: next's while the release is upcoming, the manifest's after.
CHANNEL = prerelease.upcoming(REPO, Path(__file__))
PINS = CHANNEL.versions if CHANNEL else versions.load(REPO)
CHART_VERSION = PINS["unitycatalog-chart"]


def port_forward(prelude: str) -> subprocess.Popen:
    """Run the page's port-forward in the foreground of a process we can kill."""
    body = regions(SCRIPT)["port-forward"].replace(" &\n", "\n")
    proc = subprocess.Popen(["bash", "-c", prelude + "exec " + body], cwd=HERE)
    for _ in range(30):
        try:
            if get(BASE_URL, "catalogs") is not None:
                return proc
        except OSError:
            time.sleep(1)
    proc.kill()
    raise AssertionError("port-forward never answered")


def check_routes(chart: str) -> None:
    """The routing values render, and route /api to the server Service."""
    for name, kind in (
        ("values-ingress.yaml", "Ingress"),
        ("values-httproute.yaml", "HTTPRoute"),
    ):
        rendered = subprocess.run(
            [
                "helm",
                "template",
                "unitycatalog",
                chart,
                "--version",
                CHART_VERSION,
                "-f",
                "values.yaml",
                "-f",
                name,
            ],
            cwd=HERE,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        assert f"kind: {kind}" in rendered, name
        route = rendered.split(f"kind: {kind}")[1]
        assert "/api" in route and "unitycatalog-server" in route, route


def secret_uid() -> str:
    return subprocess.run(
        [
            "kubectl",
            "-n",
            "unitycatalog",
            "get",
            "secret",
            "unitycatalog-server-jwt-key",
            "-o",
            "jsonpath={.metadata.uid}",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        package = None
        if CHANNEL is not None:
            package = prerelease.chart_package(
                PINS["release"],
                CHART_VERSION,
                Path(tmp),
            )
        prelude = prerelease.helm_prelude(package)
        check_routes(str(package) if package else prerelease.CHART)

        def step(name: str) -> str:
            return run(SCRIPT, name, cwd=HERE, prelude=prelude)

        step("create-secret")
        step("trial-postgres")
        step("install")
        out = step("check")
        assert "unitycatalog-server-" in out and "Running" in out, out

        step("create-catalog")
        forward = port_forward(prelude)
        try:
            assert get(BASE_URL, "catalogs/analytics")["comment"] == "Kept across pods"
        finally:
            forward.kill()

        out = step("restart")
        assert '"name" : "analytics"' in out, out
        assert "REVISION: 2" in step("upgrade")

        key = secret_uid()
        out = step("uninstall")
        assert "unitycatalog-server-jwt-key" in out, out
        # A reinstall keeps the signing key and finds the metadata in PostgreSQL.
        step("install")
        assert secret_uid() == key
        assert '"name" : "analytics"' in step("restart")
