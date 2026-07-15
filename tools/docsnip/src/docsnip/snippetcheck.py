"""Validate remark-code-snippets fences without running the Astro build.

Astro resolves ``file=... start=... end=...`` fences live at site build via the
`remark-code-snippets` plugin, which fails the build if a marker is missing or
duplicated. We mirror those failure conditions here so the *content* repo's CI
catches snippet drift on its own, independent of the downstream build.
"""

from __future__ import annotations

import re
from pathlib import Path

# Matches a fence info string carrying file= meta (start/end optional).
_FENCE_FILE_RE = re.compile(r"^```[^\n]*\bfile=(?P<file>\S+)", re.MULTILINE)
_START_RE = re.compile(r"\bstart=(?P<start>\S+)")
_END_RE = re.compile(r"\bend=(?P<end>\S+)")


class SnippetError(Exception):
    """Raised when a snippet fence cannot be resolved."""


def _count_marker(text: str, marker: str) -> int:
    return sum(1 for line in text.splitlines() if marker in line)


def check_page(md_path: Path) -> list[str]:
    """Return validation errors for every snippet fence in one markdown file."""
    errors: list[str] = []
    text = md_path.read_text()
    for line in text.splitlines():
        if not line.startswith("```") or "file=" not in line:
            continue
        file_m = _FENCE_FILE_RE.match(line)
        if not file_m:
            continue
        rel_file = file_m.group("file")
        start_m = _START_RE.search(line)
        end_m = _END_RE.search(line)
        src = (md_path.parent / rel_file).resolve()

        if not src.is_file():
            errors.append(f"{md_path}: snippet source not found: {rel_file}")
            continue

        if start_m and end_m:
            src_text = src.read_text()
            start = start_m.group("start")
            end = end_m.group("end")
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
        elif start_m or end_m:
            errors.append(
                f"{md_path}: snippet fence must include both start= and end=, or neither "
                f"(whole-file inlining): {rel_file}"
            )
        # file= without start/end: whole-file inlining — source existence is enough.
    return errors


def check_blogs(blogs_root: Path) -> list[str]:
    """Check snippet fences in every ``blogs/*/draft.md``."""
    errors: list[str] = []
    if not blogs_root.is_dir():
        return errors
    for md_path in sorted(blogs_root.glob("*/draft.md")):
        errors.extend(check_page(md_path))
    return errors


def check_content(content_root: Path) -> list[str]:
    """Check every content page (``*.md`` / ``*.mdx``) under ``content_root``."""
    from .frontmatter import iter_content_files

    errors: list[str] = []
    for md_path in iter_content_files(content_root):
        errors.extend(check_page(md_path))
    return errors
