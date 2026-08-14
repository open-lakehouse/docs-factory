"""Parse and validate YAML frontmatter on blog drafts (``blogs/*/index.md``).

Blog frontmatter has its own required fields and tag registry (``blogs/tags.yml``),
but shares the single canonical status vocabulary with content pages. An idea is
just an early blog folder at ``status: idea`` — the earliest reviewable artifact,
where structural feedback is still expected. See :data:`docsnip.frontmatter.STATUSES`.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from .frontmatter import STATUSES, Page, parse

BLOG_STATUSES = STATUSES


def load_tag_registry(blogs_root: Path) -> set[str]:
    """Return the set of known tag names from ``blogs/tags.yml``."""
    tags_path = blogs_root / "tags.yml"
    if not tags_path.is_file():
        return set()
    data = yaml.safe_load(tags_path.read_text()) or {}
    return {k for k in data if isinstance(k, str) and k != "description"}


def validate_tag_registry(blogs_root: Path, model_ids: set[str]) -> list[str]:
    """Validate optional ``element:`` / ``externalRefs:`` on tag registry entries."""
    tags_path = blogs_root / "tags.yml"
    if not tags_path.is_file():
        return []
    data = yaml.safe_load(tags_path.read_text()) or {}
    errors: list[str] = []
    for tag, entry in data.items():
        if not isinstance(tag, str) or not isinstance(entry, dict):
            continue
        element = entry.get("element")
        if element is not None:
            if not isinstance(element, str):
                errors.append(f"tags.yml: tag '{tag}' element must be a string")
            elif element not in model_ids:
                errors.append(
                    f"tags.yml: tag '{tag}' element '{element}' not found in the estate model"
                )
        refs = entry.get("externalRefs")
        if refs is None:
            continue
        if not isinstance(refs, list):
            errors.append(f"tags.yml: tag '{tag}' externalRefs must be a list")
            continue
        for i, ref in enumerate(refs):
            if not isinstance(ref, dict):
                errors.append(
                    f"tags.yml: tag '{tag}' externalRefs[{i}] must be an object"
                )
                continue
            if not ref.get("role") or not ref.get("url"):
                errors.append(
                    f"tags.yml: tag '{tag}' externalRefs[{i}] must have role and url"
                )
    return errors


def iter_blog_drafts(blogs_root: Path):
    """Yield parsed :class:`Page` objects for every ``blogs/*/index.md``."""
    if not blogs_root.is_dir():
        return
    for path in sorted(blogs_root.glob("*/index.md")):
        yield parse(path)


def validate_blog(page: Page, known_tags: set[str]) -> list[str]:
    """Return validation errors for one blog draft (empty if valid)."""
    errors: list[str] = []
    m = page.meta

    def require(key: str) -> object | None:
        if key not in m:
            errors.append(f"missing required field '{key}'")
            return None
        return m[key]

    if not require("title"):
        pass
    slug = require("slug")
    if slug is not None and slug != page.path.parent.name:
        errors.append(
            f"slug '{slug}' does not match folder name '{page.path.parent.name}'"
        )
    status = require("status")
    if status is not None and status not in BLOG_STATUSES:
        errors.append(f"status '{status}' not in {sorted(BLOG_STATUSES)}")
    if not require("author"):
        pass
    # An idea is the earliest folder: it hasn't chosen a publish target yet, so
    # `target` is only required once the post is a real draft. Everything else
    # (title/slug/author/tags) is required even for ideas. Publish timing lives
    # in RevOps (`target_release_date`) and content_version (`created_at`), not
    # git frontmatter.
    if status != "idea" and not require("target"):
        pass

    tags = m.get("tags")
    if tags is None:
        errors.append("missing required field 'tags'")
    elif not isinstance(tags, list):
        errors.append("'tags' must be a list")
    else:
        for tag in tags:
            if tag not in known_tags:
                errors.append(f"tag '{tag}' not in blogs/tags.yml")

    return [f"{page.path}: {e}" for e in errors]
