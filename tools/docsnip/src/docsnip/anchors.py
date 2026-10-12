"""Heading ids for a Markdown page, as the sites generate them.

The JS authority is ``extractHeadings`` in ``site/src/content-core/slug.mjs``:
github-slugger over each top-level heading's plain text, one slugger per
document, so a repeated heading gets ``-1``, ``-2``. This port covers the
Markdown the content uses (ATX headings, inline code, links, emphasis), and
``tests/test_anchors.py`` checks it against the JS over every page.
"""

from __future__ import annotations

import dataclasses
import re

_ATX_RE = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$")
_FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
_LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_CODE_RE = re.compile(r"(`+)(.+?)\1")
_STRONG_RE = re.compile(r"(\*\*|(?<!\w)__)(\S(?:.*?\S)?)\1")
_EM_RE = re.compile(r"(\*|(?<!\w)_)(\S(?:.*?\S)?)\1")
_ESCAPE_RE = re.compile(r"\\([!-/:-@\[-`{-~])")
# github-slugger drops everything but letters, digits, `_`, `-`, and spaces.
_DROP_RE = re.compile(r"[^\w\- ]")


@dataclasses.dataclass(frozen=True)
class Heading:
    line: int  # 1-based
    level: int
    text: str
    id: str


def plain_text(markdown: str) -> str:
    """A heading's text the way mdast-util-to-string reads it."""
    text = _LINK_RE.sub(r"\1", markdown)
    text = _CODE_RE.sub(lambda m: m.group(2).strip(), text)
    text = _STRONG_RE.sub(r"\2", text)
    text = _EM_RE.sub(r"\2", text)
    return _ESCAPE_RE.sub(r"\1", text).strip()


def slug(text: str) -> str:
    return _DROP_RE.sub("", text.lower()).replace(" ", "-")


def headings(markdown: str) -> list[Heading]:
    """Every ATX heading outside code fences, with its id, in document order."""
    out: list[Heading] = []
    seen: dict[str, int] = {}
    fence: str | None = None
    for number, line in enumerate(markdown.splitlines(), start=1):
        fence_m = _FENCE_RE.match(line)
        if fence_m:
            marker = fence_m.group(1)
            if fence is None:
                fence = marker[0] * len(marker)
            elif marker.startswith(fence):
                fence = None
            continue
        if fence is not None:
            continue
        m = _ATX_RE.match(line)
        if not m:
            continue
        text = plain_text(m.group(2))
        if not text:
            continue
        base = slug(text)
        hid = base
        while hid in seen:
            seen[base] += 1
            hid = f"{base}-{seen[base]}"
        seen[hid] = 0
        out.append(Heading(line=number, level=len(m.group(1)), text=text, id=hid))
    return out
