"""Parse and validate YAML frontmatter on content pages.

Frontmatter is the machine-readable contract every ``content/**/*.md`` page
carries. It drives the generated llms.txt and example manifest, and its
controlled vocabularies are validated in CI so pages stay consistent and
agent-discoverable.
"""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

import yaml

DIATAXIS = {"tutorial", "how-to", "reference", "explanation"}
PROJECTS = {"delta", "unitycatalog"}
ENGINES = {"python", "polars", "duckdb", "rust", "spark", "typescript"}
STATUSES = {"draft", "published"}


# Content pages are Markdown (``.md``) or MDX (``.mdx``). MDX pages may embed
# site components (e.g. ``<Tabs>``) but still carry the same YAML frontmatter and
# snippet fences, so all tooling scans both extensions uniformly.
CONTENT_SUFFIXES = (".md", ".mdx")

# Inline model reference in prose: ``[label](model:<id>)`` (see the site's
# remark-model-links plugin). We validate the id resolves against the estate
# model, the same way ``references:`` frontmatter is checked.
MODEL_LINK_RE = re.compile(r"\]\(model:([^)\s]+)\)")


def load_model_element_ids(model_json: Path) -> set[str]:
    """Element ids from the built LikeC4 model (``architecture/dist/model.json``).

    Returns an empty set if the model has not been built; callers should then
    skip model-id validation rather than flag every reference as unknown.
    """
    if not model_json.is_file():
        return set()
    data = json.loads(model_json.read_text())
    return set((data.get("elements") or {}).keys())


def _as_str_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    if isinstance(value, str):
        return [value]
    return []


def iter_content_files(content_root: Path):
    """Yield every content page path (``*.md`` / ``*.mdx``), sorted, skipping READMEs."""
    files = [
        p
        for suffix in CONTENT_SUFFIXES
        for p in content_root.rglob(f"*{suffix}")
        if p.name != "README.md"
    ]
    return sorted(files)


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


def validate(page: Page, model_ids: set[str] | None = None) -> list[str]:
    """Return a list of human-readable validation errors (empty if valid).

    When ``model_ids`` is a non-empty set, every ``references:`` frontmatter id
    and every inline ``[label](model:<id>)`` link is checked to resolve against
    the estate model. Pass ``None`` (or an empty set) to skip that check, e.g.
    when the model has not been built.
    """
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

    # Snippets are no longer declared in frontmatter — the inline ``file=`` fences
    # in the body are the single source of truth (validated by snippetcheck and
    # scanned by manifest.py). A leftover ``snippets:`` array is stale metadata.
    if "snippets" in m:
        errors.append(
            "frontmatter 'snippets:' array is no longer used — remove it; "
            "the inline file= fences are the source of truth"
        )

    if model_ids:
        for ref in _as_str_list(m.get("references")):
            if ref not in model_ids:
                errors.append(f"references id '{ref}' not found in the estate model")
        for ref in MODEL_LINK_RE.findall(page.body):
            if ref not in model_ids:
                errors.append(
                    f"inline model link 'model:{ref}' not found in the estate model"
                )

    return [f"{page.path}: {e}" for e in errors]


def iter_pages(content_root: Path):
    """Yield parsed :class:`Page` objects for every content page under ``content_root``.

    Scans ``*.md`` and ``*.mdx``. Navigational files (``README.md``) are skipped —
    only frontmatter-bearing content pages are yielded.
    """
    for path in iter_content_files(content_root):
        yield parse(path)
