"""Parse and validate YAML frontmatter on content pages.

Frontmatter is the machine-readable contract every ``content/**/*.md`` page
carries. It drives the site build (the generated llms.txt is derived from it)
and its controlled vocabularies are validated in CI so pages stay consistent
and agent-discoverable.
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
# The single canonical status vocabulary, shared by content pages and blog
# drafts (blog.py re-exports it). Git `status` is the release signal; the DB
# review layer only tells the author when to set it (docs/decisions/ADR-0002):
#   `idea`    = earliest reviewable stage; structural feedback still welcome.
#   `draft`   = being written and reviewed. Never emitted (except `--drafts`
#               previews).
#   `ready`   = approved for release. Merging it to main IS the release: the
#               emitters and llms.txt select `ready` alone, DB-free.
#   `private` = reviewable in the factory app, never emitted or released (shared
#               reference state such as feature/compatibility lists).
# The old intermediate blog stages (brief/drafting/refining/publish-ready/
# published) collapse into these; "which stage of draft" is signalled by which
# files exist (brief.md vs index.md), not a frontmatter enum.
STATUSES = vocab.statuses()


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


# The edges that anchor an element to what it stands for. A spec or
# implementation with none floats free of the logical layer, so nothing can
# navigate to it from a capability; a concern with none spans nothing.
_ANCHOR_EDGES = {
    "concern": {"appliesTo"},
    "openSpecification": {"specifies"},
    "implementation": {"implements", "realizes"},
}

# Concrete elements point readers at their upstream home; abstract ones don't have one.
_LINKED_KINDS = {"openSpecification", "implementation"}


def model_quality_gaps(model_json: Path) -> list[str]:
    """Gaps in the model's reader-facing facts, one line per element.

    Emitted sites turn ``model:`` links into links to an element's explanation
    page or external ``link``, with its summary as the tooltip, so a page-worthy
    element needs a description, a spec or implementation needs an external
    link, both need an edge to the concept they realize, and a concern needs
    an edge to what it applies to. Reported, not
    failing: the model grows ahead of its facts.
    """
    if not model_json.is_file():
        return []
    data = json.loads(model_json.read_text())
    outgoing: dict[str, set[str]] = {}
    for rel in (data.get("relations") or {}).values():
        source = (rel.get("source") or {}).get("model")
        if source:
            outgoing.setdefault(source, set()).add(rel.get("kind") or "")
    gaps = []
    for eid, el in sorted((data.get("elements") or {}).items()):
        kind = el.get("kind")
        if kind not in PAGE_WORTHY_KINDS:
            continue
        missing = []
        if not el.get("description") and not el.get("summary"):
            missing.append("no description")
        if kind in _LINKED_KINDS and not el.get("links"):
            missing.append("no external link")
        if kind in _ANCHOR_EDGES:
            if not outgoing.get(eid, set()) & _ANCHOR_EDGES[kind]:
                edges = "/".join(sorted(_ANCHOR_EDGES[kind]))
                missing.append(f"no {edges} edge")
        if missing:
            gaps.append(f"  - {eid} ({kind}): {', '.join(missing)}")
    return gaps


# The positive selection the docs sites publish from (specification.likec4).
PUBLIC_TAG = "public"


def publication_gaps(model_json: Path, pages: list[Page], root: Path) -> list[str]:
    """What the docs sites will drop or publish bare, one line per finding.

    A ready page's ``explains:`` / ``references:`` / inline ``model:`` id that
    lacks ``#public`` unwraps to its label and stays out of JSON-LD and
    concepts.json. A ``#public`` element with no description publishes no
    summary. Reported, not failing: tagging an element public is a deliberate
    decision for the model's owner.
    """
    if not model_json.is_file():
        return []
    elements = json.loads(model_json.read_text()).get("elements") or {}
    public = {
        eid for eid, el in elements.items() if PUBLIC_TAG in (el.get("tags") or [])
    }
    gaps = []
    for page in pages:
        if page.meta.get("status") != "ready":
            continue
        cited = effective_reference_ids(page.meta) | set(
            MODEL_LINK_RE.findall(page.body)
        )
        for eid in sorted(cited & elements.keys() - public):
            rel = (
                page.path.relative_to(root)
                if page.path.is_relative_to(root)
                else page.path
            )
            gaps.append(
                f"  - {rel}: cites {eid}, which isn't #public, so the site drops it"
            )
    for eid in sorted(public):
        if not elements[eid].get("description") and not elements[eid].get("summary"):
            gaps.append(f"  - {eid}: #public with no description")
    return gaps


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


# Frontmatter block: a leading ``---`` line, the YAML body, then a CLOSING
# ``---`` that must be on its OWN line (newline before it, newline or EOF
# after). This is the SAME contract as the site's canonical JS splitter
# (site/src/content-core/frontmatter.mjs ``splitFrontmatter``): line-anchored
# ``---`` delimiters and CRLF tolerance. A plain ``partition("\n---")`` would
# instead close on ``\n---`` anywhere (``\n----``, ``\n---foo``, mid-value),
# diverging from JS and producing a different body/contentHash for such pages —
# the cross-language drift test guards the corpus, but matching the regex here
# closes the gap by construction rather than relying on the corpus exercising it.
_FRONTMATTER_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?")


def parse(path: Path) -> Page:
    """Parse a Markdown file into frontmatter + body.

    Raises:
        ValueError: if the file has no ``---`` delimited frontmatter block.
    """
    text = path.read_text()
    if not text.startswith("---"):
        raise ValueError(f"{path}: missing frontmatter (must start with '---')")
    match = _FRONTMATTER_RE.match(text)
    if match is None:
        raise ValueError(f"{path}: unterminated frontmatter block")
    meta = yaml.safe_load(match.group(1)) or {}
    body = text[match.end() :]
    return Page(path=path, meta=meta, body=body.lstrip("\n"))


def page_status(path: Path) -> str:
    """A page's ``status``, with the same ``draft`` default ``validate`` applies."""
    return str(parse(path).meta.get("status", "draft"))


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
