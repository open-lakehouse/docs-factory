"""Generate the machine-readable example manifest from page frontmatter.

The manifest lets agents (and the downstream site) discover which examples exist,
which engine each targets, which Delta features and datasets they exercise, and —
crucially — which engine tabs are real vs. still stubs (``engine_status``).
"""

from __future__ import annotations

import json
from pathlib import Path

from .frontmatter import iter_pages

# Engines whose examples are actually built + tested today. Everything else is a
# stub, surfaced as engine_status="stub" so consumers don't treat it as ready.
BUILT_ENGINES = {"python"}


def build(content_root: Path, examples_root: Path) -> dict:
    """Build the manifest dict from content frontmatter + example sources."""
    records: list[dict] = []
    for page in iter_pages(content_root):
        rel_page = page.path.relative_to(content_root.parent).as_posix()
        for snip in page.meta.get("snippets", []) or []:
            engine = snip.get("engine")
            src = snip.get("file", "")
            # Resolve the snippet source relative to the page, for a repo-relative path.
            resolved = (page.path.parent / src).resolve()
            try:
                rel_src = resolved.relative_to(content_root.parent).as_posix()
                exists = resolved.is_file()
            except ValueError:
                rel_src = src
                exists = resolved.is_file()
            region = snip.get("start", "").removeprefix("docs-").removesuffix("-start")
            records.append(
                {
                    "id": f"{engine}/{region}",
                    "engine": engine,
                    "diataxis": page.meta.get("diataxis"),
                    "delta_features": page.meta.get("delta_features", []),
                    "datasets": (page.meta.get("prerequisites", {}) or {}).get(
                        "datasets", []
                    ),
                    "source": rel_src,
                    "start": snip.get("start"),
                    "end": snip.get("end"),
                    "referenced_by": [rel_page],
                    "tested": engine in BUILT_ENGINES and exists,
                    "engine_status": "built" if engine in BUILT_ENGINES else "stub",
                }
            )
    return {"schema_version": 1, "examples": records}


def write(content_root: Path, examples_root: Path, out_path: Path) -> Path:
    manifest = build(content_root, examples_root)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return out_path
