"""Interface tabs: `:::tab[<Engine> · <Language>]` groups agree with the matrix.

A project whose ``compatibility.yml`` labels interfaces ``<Engine> · <Language>``
names its page tabs after them, and the renderer picks such a group on two axes
(site/src/lib/tab-axes.ts). So in that project an axis label must be an
interface label, a group must keep the interfaces' order, and a group can't mix
axis labels with plain ones, which would quietly render it as one flat row.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

from .frontmatter import iter_content_files

SEPARATOR = " · "

_TAB_RE = re.compile(r"^(?P<colons>:{3,})tab\[(?P<label>[^\]]*)\]\s*$")
_FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})")


def groups(text: str) -> Iterator[tuple[int, list[str]]]:
    """Each run of adjacent tabs as (1-based line of its first tab, labels).

    Mirrors remark-tabs: only blank lines may sit between two tabs of a group.
    """
    lines = text.splitlines()
    fence: str | None = None
    group: list[str] = []
    start = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        fenced = _FENCE_RE.match(line)
        if fence is not None:
            if fenced and fenced.group(1).startswith(fence):
                fence = None
            i += 1
            continue
        if fenced:
            fence = fenced.group(1)
            i += 1
            continue
        tab = _TAB_RE.match(line)
        if tab is None:
            if line.strip() and group:
                yield start, group
                group = []
            i += 1
            continue
        if not group:
            start = i + 1
        group.append(tab.group("label"))
        close = tab.group("colons")
        i += 1
        inner: str | None = None
        while i < len(lines):
            fenced = _FENCE_RE.match(lines[i])
            if inner is not None:
                if fenced and fenced.group(1).startswith(inner):
                    inner = None
            elif fenced:
                inner = fenced.group(1)
            elif lines[i].strip() == close:
                break
            i += 1
        i += 1
    if group:
        yield start, group


def check_page(page: Path, labels: list[str], rel: str) -> list[str]:
    order = {label: n for n, label in enumerate(labels)}
    errors = []
    for line, group in groups(page.read_text()):
        at = f"{rel}:{line}"
        axis = [label for label in group if SEPARATOR in label]
        if not axis:
            continue
        if len(axis) != len(group):
            plain = ", ".join(label for label in group if SEPARATOR not in label)
            errors.append(
                f"{at}: tab group mixes interface tabs with plain ones ({plain})"
            )
            continue
        unknown = [label for label in group if label not in order]
        for label in unknown:
            errors.append(
                f"{at}: tab '{label}' is not an interface label in compatibility.yml"
            )
        known = [label for label in group if label in order]
        if not unknown and known != sorted(known, key=order.__getitem__):
            errors.append(
                f"{at}: tabs are out of order; compatibility.yml orders them "
                + ", ".join(sorted(known, key=order.__getitem__))
            )
    return errors


def check(repo_root: Path, labels_by_project: dict[str, list[str]]) -> list[str]:
    """Errors for every project whose interface labels name both axes."""
    content_root = repo_root / "content"
    errors = []
    for project, labels in sorted(labels_by_project.items()):
        if not any(SEPARATOR in label for label in labels):
            continue
        for page in iter_content_files(content_root / project):
            rel = page.relative_to(repo_root).as_posix()
            errors.extend(check_page(page, labels, rel))
    return errors
