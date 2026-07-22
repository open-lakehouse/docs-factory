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

from pathlib import Path

from .frontmatter import iter_pages

# Order the Diátaxis quadrants the way a newcomer reads them.
_SECTION_ORDER = ["tutorial", "how-to", "reference", "explanation"]
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


def _page_url(url_base: str, project: str, page_path: Path, content_root: Path) -> str:
    # content/<project>/<quadrant>/<slug>.md -> <url_base>/<quadrant>/<slug>
    rel = page_path.relative_to(content_root / project).with_suffix("")
    return f"{url_base.rstrip('/')}/{rel.as_posix()}"


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
        url = _page_url(url_base, project, page.path, content_root)
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
