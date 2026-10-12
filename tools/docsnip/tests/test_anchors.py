"""Heading ids: the Python port against github-slugger, as the sites run it."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from docsnip.anchors import headings
from docsnip.frontmatter import iter_content_files, parse


def test_ids_follow_github_slugger() -> None:
    text = (
        "# Title\n\n"
        "## Create, change, and drop tables\n"
        "## Use `uc_catalog` with **DuckDB**\n"
        "## [Linked](https://x) heading\n"
        "```md\n## Not a heading\n```\n"
        "## Title\n"
        "## Title\n"
    )
    assert [(h.line, h.id) for h in headings(text)] == [
        (1, "title"),
        (3, "create-change-and-drop-tables"),
        (4, "use-uc_catalog-with-duckdb"),
        (5, "linked-heading"),
        (9, "title-1"),
        (10, "title-2"),
    ]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


_JS = """
import { readFileSync } from "node:fs";
import { extractHeadings } from "./src/content-core/slug.mjs";
const bodies = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(bodies.map((b) => extractHeadings(b).map((h) => h.id))));
"""


def test_ids_match_the_js_content_core() -> None:
    root = _repo_root()
    if shutil.which("node") is None or not (root / "site" / "node_modules").is_dir():
        pytest.skip("node or site/node_modules unavailable")
    pages = [parse(p) for p in iter_content_files(root / "content")]
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", _JS],
        cwd=root / "site",
        input=json.dumps([p.body for p in pages]),
        capture_output=True,
        text=True,
        check=True,
    )
    for page, js_ids in zip(pages, json.loads(proc.stdout), strict=True):
        assert [h.id for h in headings(page.body)] == js_ids, page.path
