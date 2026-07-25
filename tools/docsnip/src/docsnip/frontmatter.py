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

from . import vocab

# Controlled vocabularies come from the single-source content/vocab.json (shared
# with the site via site/src/content-core/vocab.mjs), so docsnip and the site
# can no longer drift. `open-lakehouse` holds estate-wide, engine-neutral
# explanations of the reference model — concepts not specific to one upstream
# project; it mirrors the site's implicit "all" scope (site/src/scope.ts).
DIATAXIS = vocab.diataxis()
PROJECTS = vocab.projects()
# Git authoring intent — orthogonal to the DB-canonical review lifecycle
# (review_state). This is the single canonical status vocabulary, shared by both
# content pages and blog drafts (blog.py re-exports it):
#   `idea`  = earliest reviewable stage; structural feedback still welcome, the
#             angle isn't committed to. Visible to reviewers, never public.
#   `draft` = being written (reviewers can see it, not in llms.txt, never shown
#             to anonymous site visitors).
#   `ready` = the author asserts it is publishable.
# `ready` gates llms.txt inclusion, but a page is shown to anonymous visitors
# ONLY when it is `ready` AND its DB review_state is `released` — publication is
# the intersection of author intent (git) and review outcome (DB), never git
# alone. The old intermediate blog stages (brief/drafting/refining/
# publish-ready/published) collapse into these three; "which stage of draft" is
# now signalled by which files exist (brief.md vs draft.md) and by the DB review
# lifecycle, not a frontmatter enum. See server/src/services/review.ts.
STATUSES = {"idea", "draft", "ready"}


# Content pages are Markdown (``.md``) or MDX (``.mdx``). MDX pages may embed
# site components but still carry the same YAML frontmatter and snippet fences,
# so all tooling scans both extensions uniformly.
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


# Element kinds that are "page-worthy" — the concepts that warrant a long-form
# explanation page. From the shared vocab (site/src/explain.ts EXPLAIN_KINDS).
PAGE_WORTHY_KINDS = vocab.page_worthy_kinds()


def load_page_worthy_elements(model_json: Path) -> dict[str, str]:
    """Map ``element id -> title`` for every page-worthy element in the model.

    Used to report coverage: which concepts have no ``explains:`` content page.
    Returns an empty dict if the model has not been built.
    """
    if not model_json.is_file():
        return {}
    data = json.loads(model_json.read_text())
    elements = data.get("elements") or {}
    return {
        eid: (el.get("title") or eid)
        for eid, el in elements.items()
        if el.get("kind") in PAGE_WORTHY_KINDS
    }


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


@dataclasses.dataclass
class PageValidation:
    """Outcome of validating one page, split into two tiers.

    ``errors`` are hard failures (tier 1) that fail CI: bad vocabulary,
    malformed metadata, or a ``references:`` / inline ``model:`` id that does
    not resolve against the estate model. ``coverage_gaps`` are the tier-2
    ratchet: well-formed pages that carry *zero* effective model references.
    They are tracked as coverage, surfaced as warnings, and never fail CI — so
    authoring ahead of the model and model rework stay unblocked.
    """

    errors: list[str] = dataclasses.field(default_factory=list)
    coverage_gaps: list[str] = dataclasses.field(default_factory=list)


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


def effective_reference_ids(meta: dict) -> set[str]:
    """Model element ids a page effectively references.

    The union of explicit ``references:`` frontmatter and the ``explains:``
    element. Mirrors the site's ``effectiveRefIds`` (minus the blog tag-element
    join, which lives in the site because tag metadata is loaded there) so the
    coverage count matches what the navigation surfaces. (An ``engines:``-derived
    join was dropped along with the engine machinery — see
    docs/design/build-pipeline.md.)
    """
    ids = set(_as_str_list(meta.get("references")))
    # The element a page is the canonical explanation of (``explains:``) is a
    # first-class reference: it binds the page to that node the way the old
    # ``explainDoc`` metadata used to, so an explanation page is never a
    # coverage gap and shows up in the model's backlinks / related content.
    explains = meta.get("explains")
    if isinstance(explains, str) and explains:
        ids.add(explains)
    return ids


def validate(page: Page, model_ids: set[str] | None = None) -> PageValidation:
    """Validate a page into tier-1 errors and tier-2 coverage gaps.

    When ``model_ids`` is a non-empty set, every ``references:`` frontmatter id
    and every inline ``[label](model:<id>)`` link is checked to resolve against
    the estate model (tier 1 — unresolved ids fail CI). Pass ``None`` (or an
    empty set) to skip that check, e.g. when the model has not been built.

    A well-formed page with zero effective references (see
    :func:`effective_reference_ids`) is recorded as a tier-2 coverage gap, not
    an error: every page *should* relate to at least one model node, but the
    gate ratchets toward that rather than blocking on it.
    """
    errors: list[str] = []
    coverage_gaps: list[str] = []
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

    # The `engines:` field (and the engine→implementation coverage machinery it
    # fed) was removed — its language↔engine↔implementation mapping was unsound
    # (see docs/design/build-pipeline.md). A leftover `engines:` is stale.
    if "engines" in m:
        errors.append(
            "frontmatter 'engines:' is no longer used — remove it "
            "(the engine coverage machinery was dropped)"
        )

    # Snippets are no longer declared in frontmatter — the inline ``file=`` fences
    # in the body are the single source of truth (validated by snippetcheck and
    # scanned by manifest.py). A leftover ``snippets:`` array is stale metadata.
    if "snippets" in m:
        errors.append(
            "frontmatter 'snippets:' array is no longer used — remove it; "
            "the inline file= fences are the source of truth"
        )

    # ``explains:`` binds this page to the single model element it canonically
    # explains. It must be one string (not a list) and resolve against the model.
    explains = m.get("explains")
    if explains is not None and not isinstance(explains, str):
        errors.append(
            "explains must be a single model element id (string), not a list — "
            "use references: for secondary correlations"
        )

    if model_ids:
        for ref in _as_str_list(m.get("references")):
            if ref not in model_ids:
                errors.append(f"references id '{ref}' not found in the estate model")
        if isinstance(explains, str) and explains and explains not in model_ids:
            errors.append(f"explains id '{explains}' not found in the estate model")
        for ref in MODEL_LINK_RE.findall(page.body):
            if ref not in model_ids:
                errors.append(
                    f"inline model link 'model:{ref}' not found in the estate model"
                )

    # Tier 2 — coverage ratchet. A page with no explicit references and no
    # engine-derived ones relates to no model node; track it, but never fail.
    if not effective_reference_ids(m):
        coverage_gaps.append("no model references (coverage gap)")

    return PageValidation(
        errors=[f"{page.path}: {e}" for e in errors],
        coverage_gaps=[f"{page.path}: {g}" for g in coverage_gaps],
    )


def iter_pages(content_root: Path):
    """Yield parsed :class:`Page` objects for every content page under ``content_root``.

    Scans ``*.md`` and ``*.mdx``. Navigational files (``README.md``) are skipped —
    only frontmatter-bearing content pages are yielded.
    """
    for path in iter_content_files(content_root):
        yield parse(path)
