"""Parse and validate YAML frontmatter on blog drafts (``blogs/*/draft.md``).

Blog frontmatter is separate from Diátaxis content frontmatter: different required
fields, status vocabulary, and tag registry (``blogs/tags.yml``).
"""

from __future__ import annotations

from pathlib import Path

import yaml

from .frontmatter import Page, parse

BLOG_STATUSES = {
    "idea",
    "brief",
    "drafting",
    "refining",
    "publish-ready",
    "published",
}


def load_tag_registry(blogs_root: Path) -> set[str]:
    """Return the set of known tag names from ``blogs/tags.yml``."""
    tags_path = blogs_root / "tags.yml"
    if not tags_path.is_file():
        return set()
    data = yaml.safe_load(tags_path.read_text()) or {}
    return {k for k in data if isinstance(k, str) and k != "description"}


def iter_blog_drafts(blogs_root: Path):
    """Yield parsed :class:`Page` objects for every ``blogs/*/draft.md``."""
    if not blogs_root.is_dir():
        return
    for path in sorted(blogs_root.glob("*/draft.md")):
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
    if not require("date"):
        pass
    if not require("author"):
        pass
    if not require("target"):
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
