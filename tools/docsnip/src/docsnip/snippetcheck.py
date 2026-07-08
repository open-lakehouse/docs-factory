"""Validate remark-code-snippets fences without running the Astro build.

Astro resolves ``file=... start=... end=...`` fences live at site build via the
`remark-code-snippets` plugin, which fails the build if a marker is missing or
duplicated. We mirror those failure conditions here so the *content* repo's CI
catches snippet drift on its own, independent of the downstream build.
"""

from __future__ import annotations

import re
from pathlib import Path

# Matches a fence info string carrying file/start/end meta, e.g.
#   ```python file=../../examples/python/read_delta_table.py start=foo end=bar
_FENCE_RE = re.compile(
    r"^```[^\n]*\bfile=(?P<file>\S+).*?\bstart=(?P<start>\S+).*?\bend=(?P<end>\S+)",
    re.MULTILINE,
)


class SnippetError(Exception):
    """Raised when a snippet fence cannot be resolved."""


def _count_marker(text: str, marker: str) -> int:
    return sum(1 for line in text.splitlines() if marker in line)


def check_page(md_path: Path) -> list[str]:
    """Return validation errors for every snippet fence in one markdown file."""
    errors: list[str] = []
    text = md_path.read_text()
    for match in _FENCE_RE.finditer(text):
        rel_file = match.group("file")
        start = match.group("start")
        end = match.group("end")
        src = (md_path.parent / rel_file).resolve()

        if not src.is_file():
            errors.append(f"{md_path}: snippet source not found: {rel_file}")
            continue

        src_text = src.read_text()
        for marker, kind in ((start, "start"), (end, "end")):
            n = _count_marker(src_text, marker)
            if n == 0:
                errors.append(
                    f"{md_path}: {kind} marker '{marker}' not found in {rel_file}"
                )
            elif n > 1:
                errors.append(
                    f"{md_path}: {kind} marker '{marker}' found {n}× in {rel_file} "
                    "(must be unique)"
                )
    return errors


def check_content(content_root: Path) -> list[str]:
    """Check every ``*.md`` under ``content_root``; return all errors."""
    errors: list[str] = []
    for md_path in sorted(content_root.rglob("*.md")):
        errors.extend(check_page(md_path))
    return errors
