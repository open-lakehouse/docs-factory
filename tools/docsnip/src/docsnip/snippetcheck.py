"""Validate remark-code-snippets fences without running the Astro build.

Astro resolves ``file=... start=... end=...`` fences live at site build via the
`remark-code-snippets` plugin, which fails the build if a marker is missing or
duplicated. We mirror those failure conditions here so the *content* repo's CI
catches snippet drift on its own, independent of the downstream build.
"""

from __future__ import annotations

import dataclasses
import re
from collections.abc import Iterator
from pathlib import Path

# Matches a fence info string carrying file= meta (start/end optional).
_FENCE_FILE_RE = re.compile(r"^```[^\n]*\bfile=(?P<file>\S+)", re.MULTILINE)
_START_RE = re.compile(r"\bstart=(?P<start>\S+)")
_END_RE = re.compile(r"\bend=(?P<end>\S+)")
# Fence language token: ```python file=... -> "python".
_FENCE_LANG_RE = re.compile(r"^```(?P<lang>[A-Za-z0-9_-]+)")


class SnippetError(Exception):
    """Raised when a snippet fence cannot be resolved."""


@dataclasses.dataclass
class Fence:
    """One ``file=`` code fence parsed from a markdown page.

    The single source of truth for fence parsing: both snippet validation and
    the example manifest read fences through :func:`iter_fences`, so the two can
    never disagree about what a page references.
    """

    lang: str | None
    file: str
    start: str | None
    end: str | None

    @property
    def region(self) -> str | None:
        """The bare region name, e.g. ``start:read-delta-table`` -> ``read-delta-table``.

        Region markers use the mkdocs ``--8<-- [start:<region>]`` convention, so a
        fence's ``start=start:<region>`` token carries the region after the
        ``start:`` prefix. Returns ``None`` for whole-file fences (no ``start=``).
        """
        if not self.start:
            return None
        return self.start.split(":", 1)[1] if ":" in self.start else self.start


def iter_fences(md_path: Path) -> Iterator[Fence]:
    """Yield every ``file=`` code fence in a markdown page, in document order."""
    for line in md_path.read_text().splitlines():
        if not line.startswith("```") or "file=" not in line:
            continue
        file_m = _FENCE_FILE_RE.match(line)
        if not file_m:
            continue
        lang_m = _FENCE_LANG_RE.match(line)
        start_m = _START_RE.search(line)
        end_m = _END_RE.search(line)
        yield Fence(
            lang=lang_m.group("lang") if lang_m else None,
            file=file_m.group("file"),
            start=start_m.group("start") if start_m else None,
            end=end_m.group("end") if end_m else None,
        )


def _count_marker(text: str, marker: str) -> int:
    return sum(1 for line in text.splitlines() if marker in line)


def check_page(md_path: Path) -> list[str]:
    """Return validation errors for every snippet fence in one markdown file."""
    errors: list[str] = []
    for fence in iter_fences(md_path):
        rel_file = fence.file
        src = (md_path.parent / rel_file).resolve()

        if not src.is_file():
            errors.append(f"{md_path}: snippet source not found: {rel_file}")
            continue

        if fence.start and fence.end:
            src_text = src.read_text()
            for marker, kind in ((fence.start, "start"), (fence.end, "end")):
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
        elif fence.start or fence.end:
            errors.append(
                f"{md_path}: snippet fence must include both start= and end=, or neither "
                f"(whole-file inlining): {rel_file}"
            )
        # file= without start/end: whole-file inlining — source existence is enough.
    return errors


def check_blogs(blogs_root: Path) -> list[str]:
    """Check snippet fences in every ``blogs/*/index.md``."""
    errors: list[str] = []
    if not blogs_root.is_dir():
        return errors
    for md_path in sorted(blogs_root.glob("*/index.md")):
        errors.extend(check_page(md_path))
    return errors


def check_content(content_root: Path) -> list[str]:
    """Check every content page (``*.md`` / ``*.mdx``) under ``content_root``."""
    from .frontmatter import iter_content_files

    errors: list[str] = []
    for md_path in iter_content_files(content_root):
        errors.extend(check_page(md_path))
    return errors
