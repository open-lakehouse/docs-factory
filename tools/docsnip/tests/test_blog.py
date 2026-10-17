"""Blog front matter: the brief's durable fields are optional but checked."""

from __future__ import annotations

from pathlib import Path

from docsnip.blog import blog_metadata_gaps, validate_blog
from docsnip.frontmatter import Page

_BASE = {
    "title": "T",
    "slug": "p",
    "status": "draft",
    "author": "A Person",
    "target": "unitycatalog",
    "tags": ["lakehouse"],
}


def _page(**meta) -> Page:
    return Page(path=Path("blogs/p/index.md"), meta={**_BASE, **meta}, body="")


def _errors(**meta) -> list[str]:
    return [e.split(": ", 1)[1] for e in validate_blog(_page(**meta), {"lakehouse"})]


def test_brief_fields_are_optional() -> None:
    assert _errors() == []


def test_valid_brief_fields_pass() -> None:
    assert (
        _errors(post_type="essay", audience="Platform engineers", summary="Short.")
        == []
    )


def test_post_type_must_be_in_the_vocabulary() -> None:
    assert _errors(post_type="rant") == [
        "post_type 'rant' not in ['announcement', 'benchmark', 'comparison', "
        "'deep-dive', 'essay', 'how-to']"
    ]


def test_summary_is_capped_and_audience_is_text() -> None:
    assert _errors(summary="x" * 161, audience=["a"]) == [
        "'audience' must be a non-empty string",
        "'summary' is 161 chars (max 160)",
    ]


def test_gaps_name_missing_fields_on_posts_headed_for_release() -> None:
    assert blog_metadata_gaps(_page(post_type="essay")) == [
        "blogs/p/index.md: missing audience, summary"
    ]
    assert blog_metadata_gaps(_page(status="idea")) == []
    assert blog_metadata_gaps(_page(status="private")) == []
