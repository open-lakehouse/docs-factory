"""Run the region-marked shell snippets a docs page displays.

The Python snippet harness only executes Python, so a page that shows CLI
commands pairs its ``*.sh`` file with a small PEP 723 driver that calls
:func:`run` once per region, in page order, and asserts on server state between
calls. Each region runs in a fresh ``bash -euo pipefail`` with the file's
``setup`` region prepended (the page's shell alias), from the page folder, so
the commands are exactly the ones a reader copies.
"""

from __future__ import annotations

import json
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

SETUP = "setup"
_REGION_RE = re.compile(r"# --8<-- \[start:([\w-]+)\]\n(.*?)# --8<-- \[end:\1\]", re.S)


def regions(script: Path) -> dict[str, str]:
    """Map region name → body for every ``--8<--`` region in ``script``."""
    return dict(_REGION_RE.findall(script.read_text()))


def run(
    script: Path, name: str, *, expect_failure: bool = False, cwd: Path | None = None
) -> str:
    """Run one region and return its combined output.

    ``cwd`` defaults to the script's grandparent, the page folder: snippets live
    in ``<page>/snippets/``. Pass the folder the page tells the reader to run
    the region from when that differs, such as ``envs/unitycatalog``.
    """
    blocks = regions(script)
    proc = subprocess.run(
        ["bash", "-euo", "pipefail", "-c", blocks.get(SETUP, "") + blocks[name]],
        cwd=cwd or script.parent.parent,
        capture_output=True,
        text=True,
    )
    output = proc.stdout + proc.stderr
    if expect_failure:
        assert proc.returncode != 0, f"{name}: expected a non-zero exit\n{output}"
    else:
        assert proc.returncode == 0, f"{name}: exit {proc.returncode}\n{output}"
    return output


def get(base_url: str, path: str) -> dict | None:
    """GET ``{base_url}/{path}`` as JSON; ``None`` on 404."""
    try:
        with urllib.request.urlopen(f"{base_url}/{path}") as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
