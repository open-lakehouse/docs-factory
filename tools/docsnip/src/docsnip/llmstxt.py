"""Generate per-project ``llms.txt`` files following the llmstxt.org convention.

An ``llms.txt`` gives agents a curated, link-first index of the ready docs:
an H1 title, a blockquote summary, then H2 sections grouped by Diátaxis quadrant.
Only ``status: ready`` pages are included — this keys on git authoring intent
alone so llms.txt stays build-time and DB-free (no live review DB at build).
A ``ready`` page therefore enters llms.txt as soon as the author marks it, which
may briefly precede its DB ``released`` state (the gate for anonymous site
visibility); that small skew is accepted to keep authoring and deploy decoupled.
URLs are built from a configurable ``url_base`` so the generator is independent
of the final site's routing.
"""

from __future__ import annotations

import re
from pathlib import Path

from . import vocab
from .frontmatter import Page, iter_pages

# The Diátaxis quadrants, in reading order, from the single-source vocab. The
# display titles are presentation (not vocabulary), so they stay local.
_SECTION_ORDER = vocab.diataxis_ordered()
_SECTION_TITLE = {
    "tutorial": "Tutorials",
    "how-to": "How-to guides",
    "reference": "Reference",
    "explanation": "Explanation",
}

_PROJECT_HEADER = {
    "delta": (
        "Delta Lake documentation",
        "Multi-engine, engine-neutral documentation for Delta Lake — usable from "
        "Spark, the deltalake Python package, delta-rs (Rust), DuckDB, and Polars.",
    ),
    "unitycatalog": (
        "Unity Catalog documentation",
        "Documentation for Unity Catalog, the open catalog for the lakehouse.",
    ),
}


def _page_url(url_base: str, project: str, page: Page, content_root: Path) -> str:
    """Build a page's published URL the way the site routes it.

    content/<project>/<bucket>/<slug>.md            -> <url_base>/<bucket>/<slug>
    content/<project>/<bucket>/<slug>/index.md      -> <url_base>/<bucket>/<slug>

    Folder mode drops the ``index`` filename, a leading ``NNN-`` order prefix is
    stripped from the slug segment, and a ``slug:`` frontmatter field overrides
    it — matching site/src/content-core/identity.docIdentity so the llms.txt
    links point at the same URLs the site serves.
    """
    rel = page.path.relative_to(content_root / project)
    parts = list(rel.parts)
    if re.fullmatch(r"index\.mdx?", parts[-1]):
        parts = parts[:-1]  # folder mode: the folder is the slug
    else:
        parts[-1] = re.sub(r"\.mdx?$", "", parts[-1])
    # Strip the NNN- order prefix from the slug-bearing (last) segment.
    parts[-1] = re.sub(r"^\d+-", "", parts[-1])
    fm_slug = page.meta.get("slug")
    if isinstance(fm_slug, str) and fm_slug:
        parts[-1] = fm_slug
    return f"{url_base.rstrip('/')}/{'/'.join(parts)}"


def render(project: str, content_root: Path, url_base: str) -> str:
    title, summary = _PROJECT_HEADER.get(project, (f"{project} documentation", ""))
    lines = [f"# {title}", "", f"> {summary}", ""]

    by_section: dict[str, list[str]] = {k: [] for k in _SECTION_ORDER}
    project_root = content_root / project
    for page in iter_pages(project_root):
        if page.meta.get("status", "draft") != "ready":
            continue
        quadrant = page.meta.get("diataxis")
        if quadrant not in by_section:
            continue
        url = _page_url(url_base, project, page, content_root)
        desc = page.meta.get("summary") or page.meta.get("title", "")
        by_section[quadrant].append(f"- [{page.meta.get('title', url)}]({url}): {desc}")

    for section in _SECTION_ORDER:
        entries = by_section[section]
        if not entries:
            continue
        lines.append(f"## {_SECTION_TITLE[section]}")
        lines.append("")
        lines.extend(sorted(entries))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write(project: str, content_root: Path, url_base: str, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(project, content_root, url_base))
    return out_path
