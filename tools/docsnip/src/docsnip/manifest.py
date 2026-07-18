"""Generate the machine-readable example manifest from inline snippet fences.

The manifest lets agents (and the downstream site) discover which examples exist,
which engine each targets, which model implementation each engine maps to, which
Delta features and datasets they exercise, and — crucially — which engine tabs
are real vs. still stubs (``engine_status``).

The manifest is *derived from the inline ``file=`` fences* on content pages
(parsed via :func:`docsnip.snippetcheck.iter_fences`), not from a hand-maintained
``snippets:`` frontmatter array. The rendered fence is the single source of
truth, so the manifest can never drift from what the site actually shows.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .frontmatter import iter_pages
from .snippetcheck import iter_fences

# Engines whose examples are actually built + tested today. Everything else is a
# stub, surfaced as engine_status="stub" so consumers don't treat it as ready.
BUILT_ENGINES = {"python"}

# Maps an example's engine (its examples/<engine>/ dir) to the LikeC4 model
# implementation id it exercises. Lets consumers tie a snippet to the concrete
# software behind it — the same ids content pages reference via `references:`.
IMPL_BY_ENGINE = {
    "python": "deltaRs",
    "rust": "deltaRs",
    "polars": "polars",
    "duckdb": "duckdb",
    "spark": "deltaSpark",
    "typescript": "unityCatalogOSS",
}

# Extracts the engine segment from a snippet path, e.g.
# ``../../../examples/python/read_delta_table.py`` -> ``python``.
_ENGINE_RE = re.compile(r"(?:^|/)examples/(?P<engine>[^/]+)/")


def _engine_of(src: str) -> str | None:
    m = _ENGINE_RE.search(src)
    return m.group("engine") if m else None


def build(content_root: Path, examples_root: Path) -> dict:
    """Build the manifest dict from the inline snippet fences on content pages."""
    # Records keyed by (engine, region) so the same example referenced from
    # several pages collapses to one record with a merged referenced_by list.
    by_id: dict[str, dict] = {}
    for page in iter_pages(content_root):
        rel_page = page.path.relative_to(content_root.parent).as_posix()
        for fence in iter_fences(page.path):
            engine = _engine_of(fence.file)
            region = fence.region
            # Only examples/<engine>/ fences with a named region are manifest
            # entries; whole-file or non-example fences are skipped.
            if engine is None or region is None:
                continue
            resolved = (page.path.parent / fence.file).resolve()
            try:
                rel_src = resolved.relative_to(content_root.parent).as_posix()
            except ValueError:
                rel_src = fence.file
            exists = resolved.is_file()

            example_id = f"{engine}/{region}"
            rec = by_id.get(example_id)
            if rec is None:
                by_id[example_id] = {
                    "id": example_id,
                    "engine": engine,
                    "implements": IMPL_BY_ENGINE.get(engine),
                    "diataxis": page.meta.get("diataxis"),
                    "delta_features": page.meta.get("delta_features", []),
                    "datasets": (page.meta.get("prerequisites", {}) or {}).get(
                        "datasets", []
                    ),
                    "source": rel_src,
                    "start": fence.start,
                    "end": fence.end,
                    "referenced_by": [rel_page],
                    "tested": engine in BUILT_ENGINES and exists,
                    "engine_status": "built" if engine in BUILT_ENGINES else "stub",
                }
            elif rel_page not in rec["referenced_by"]:
                rec["referenced_by"].append(rel_page)

    records = sorted(by_id.values(), key=lambda r: r["id"])
    return {"schema_version": 2, "examples": records}


def write(content_root: Path, examples_root: Path, out_path: Path) -> Path:
    manifest = build(content_root, examples_root)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return out_path
