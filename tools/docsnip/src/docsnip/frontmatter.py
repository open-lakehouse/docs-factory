"""Parse and validate YAML frontmatter on content pages.

Frontmatter is the machine-readable contract every ``content/**/*.md`` page
carries. It drives the generated llms.txt and example manifest, and its
controlled vocabularies are validated in CI so pages stay consistent and
agent-discoverable.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

import yaml

DIATAXIS = {"tutorial", "how-to", "reference", "explanation"}
PROJECTS = {"delta", "unitycatalog"}
ENGINES = {"python", "polars", "duckdb", "rust", "spark"}
STATUSES = {"draft", "published"}


@dataclasses.dataclass
class Page:
    """A parsed content page: its path, frontmatter dict, and body text."""

    path: Path
    meta: dict
    body: str


def parse(path: Path) -> Page:
    """Parse a Markdown file into frontmatter + body.

    Raises:
        ValueError: if the file has no ``---`` delimited frontmatter block.
    """
    text = path.read_text()
    if not text.startswith("---"):
        raise ValueError(f"{path}: missing frontmatter (must start with '---')")
    _, _, rest = text.partition("---\n")
    fm_text, sep, body = rest.partition("\n---")
    if not sep:
        raise ValueError(f"{path}: unterminated frontmatter block")
    meta = yaml.safe_load(fm_text) or {}
    return Page(path=path, meta=meta, body=body.lstrip("\n"))


def validate(page: Page) -> list[str]:
    """Return a list of human-readable validation errors (empty if valid)."""
    errors: list[str] = []
    m = page.meta

    def require(key: str) -> object | None:
        if key not in m:
            errors.append(f"missing required field '{key}'")
            return None
        return m[key]

    if not require("title"):
        pass
    diataxis = require("diataxis")
    if diataxis is not None and diataxis not in DIATAXIS:
        errors.append(f"diataxis '{diataxis}' not in {sorted(DIATAXIS)}")
    project = require("project")
    if project is not None and project not in PROJECTS:
        errors.append(f"project '{project}' not in {sorted(PROJECTS)}")
    status = m.get("status", "draft")
    if status not in STATUSES:
        errors.append(f"status '{status}' not in {sorted(STATUSES)}")

    for eng in m.get("engines", []) or []:
        if eng not in ENGINES:
            errors.append(f"engine '{eng}' not in {sorted(ENGINES)}")

    for snip in m.get("snippets", []) or []:
        for key in ("file", "start", "end"):
            if key not in snip:
                errors.append(f"snippet entry missing '{key}': {snip}")
        eng = snip.get("engine")
        if eng is not None and eng not in ENGINES:
            errors.append(f"snippet engine '{eng}' not in {sorted(ENGINES)}")

    return [f"{page.path}: {e}" for e in errors]


def iter_pages(content_root: Path):
    """Yield parsed :class:`Page` objects for every content ``*.md`` under ``content_root``.

    Navigational files (``README.md``) are skipped — only frontmatter-bearing
    content pages are yielded.
    """
    for path in sorted(content_root.rglob("*.md")):
        if path.name == "README.md":
            continue
        yield parse(path)
