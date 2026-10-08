"""Stand-ins for the artifacts of a release that isn't out yet.

Pages under ``release.yml``'s ``next:`` block show the commands a reader runs
once the release ships: pull ``unitycatalog/unitycatalog:vX.Y.Z``, install the
chart from its OCI registry. Until those artifacts exist, the harness builds
them from the upstream release branch so the same commands run in CI. Each
helper first tries the published artifact, so the shim retires itself as the
release lands (and checks the published artifacts from then on).
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path

from . import versions

UPSTREAM = "https://github.com/unitycatalog/unitycatalog"
IMAGE = "unitycatalog/unitycatalog"
CHART = "oci://ghcr.io/unitycatalog/charts/unitycatalog"


def upcoming(repo_root: Path, script: Path) -> versions.Next | None:
    """The ``next`` channel if ``script`` sits under one of its paths."""
    channel = versions.load_next(repo_root)
    rel = script.resolve().relative_to(repo_root).as_posix()
    return channel if channel and channel.covers(rel) else None


def _branch(release: str) -> str:
    major, minor, _ = release.split(".")
    return f"branch-{major}.{minor}"


def _ok(*args: str) -> bool:
    return subprocess.run(args, capture_output=True).returncode == 0


def ensure_image(release: str) -> str:
    """``unitycatalog/unitycatalog:v<release>``, pulled or built from the branch."""
    ref = f"{IMAGE}:v{release}"
    if _ok("docker", "image", "inspect", ref) or _ok("docker", "pull", ref):
        return ref
    # A git build context: Docker fetches the branch itself, no checkout.
    args = ["docker", "build", "-t", ref]
    if proxy := os.environ.get("MAVEN_PROXY_URL"):
        args += ["--build-arg", f"MAVEN_PROXY_URL={proxy}"]
    subprocess.run([*args, f"{UPSTREAM}.git#{_branch(release)}"], check=True)
    return ref


def chart_package(release: str, chart_version: str, out: Path) -> Path | None:
    """A local ``.tgz`` of the branch's chart, or ``None`` if the chart is
    published at ``chart_version`` (then the page's ``helm`` commands run as is).
    """
    if _ok("helm", "show", "chart", CHART, "--version", chart_version):
        return None
    archive = f"{UPSTREAM}/archive/refs/heads/{_branch(release)}.tar.gz"
    src = out / "chart-src"
    shutil.rmtree(src, ignore_errors=True)
    with urllib.request.urlopen(archive) as resp:
        data = io.BytesIO(resp.read())
    with tarfile.open(fileobj=data) as tar:
        members = [m for m in tar.getmembers() if "/helm/" in m.name]
        tar.extractall(src, members=members, filter="data")
    [chart] = list(src.glob("*/helm"))
    subprocess.run(
        [
            "helm",
            "package",
            str(chart),
            "--version",
            chart_version,
            # Image tags carry the v; the chart defaults its tag to appVersion.
            "--app-version",
            f"v{release}",
            "--destination",
            str(out),
        ],
        check=True,
        capture_output=True,
    )
    return out / f"unitycatalog-{chart_version}.tgz"


def helm_prelude(package: Path | None) -> str:
    """Shell that points the page's OCI chart reference at ``package``."""
    if package is None:
        return ""
    return f"""helm() {{
  local args=() a
  for a in "$@"; do
    [[ $a == {CHART} ]] && a={package}
    args+=("$a")
  done
  command helm "${{args[@]}}"
}}
"""
