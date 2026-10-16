"""The model-quality report over a small model.json."""

from __future__ import annotations

import json

from docsnip.frontmatter import Page, model_quality_gaps, publication_gaps


def test_reports_missing_description_link_and_anchor_edge(tmp_path):
    model = tmp_path / "model.json"
    model.write_text(
        json.dumps(
            {
                "elements": {
                    "cap": {"kind": "capability", "title": "Cap"},
                    "spec": {
                        "kind": "openSpecification",
                        "description": {"txt": "A spec."},
                        "links": [{"url": "https://spec.test"}],
                    },
                    "impl": {
                        "kind": "implementation",
                        "description": {"txt": "An impl."},
                    },
                    "person": {"kind": "person"},
                },
                "relations": {
                    "r1": {"kind": "specifies", "source": {"model": "spec"}},
                    "r2": {"kind": "consumes", "source": {"model": "impl"}},
                },
            }
        )
    )
    assert model_quality_gaps(model) == [
        "  - cap (capability): no description",
        "  - impl (implementation): no external link, no implements/realizes edge",
    ]


def test_concern_needs_an_applies_to_edge_but_no_link(tmp_path):
    model = tmp_path / "model.json"
    model.write_text(
        json.dumps(
            {
                "elements": {
                    "spanning": {"kind": "concern", "description": {"txt": "Spans."}},
                    "floating": {
                        "kind": "concern",
                        "description": {"txt": "Spans nothing."},
                    },
                },
                "relations": {
                    "r1": {"kind": "appliesTo", "source": {"model": "spanning"}},
                },
            }
        )
    )
    assert model_quality_gaps(model) == ["  - floating (concern): no appliesTo edge"]


def test_missing_model_reports_nothing(tmp_path):
    assert model_quality_gaps(tmp_path / "absent.json") == []


def test_publication_gaps_name_what_a_ready_page_cites_but_the_site_drops(tmp_path):
    model = tmp_path / "model.json"
    model.write_text(
        json.dumps(
            {
                "elements": {
                    "cap": {"kind": "capability", "tags": ["public"]},
                    "spec": {
                        "kind": "openSpecification",
                        "tags": ["public"],
                        "summary": {"txt": "A spec."},
                    },
                    "internal": {"kind": "implementation", "tags": ["service"]},
                    "linked": {"kind": "implementation"},
                }
            }
        )
    )
    content = tmp_path / "content"
    pages = [
        Page(
            content / "p" / "ready.md",
            {"status": "ready", "explains": "spec", "references": ["internal"]},
            "Uses [L](model:linked) and [S](model:spec).",
        ),
        Page(
            content / "p" / "draft.md",
            {"status": "draft", "references": ["internal"]},
            "",
        ),
    ]
    assert publication_gaps(model, pages, tmp_path) == [
        "  - content/p/ready.md: cites internal, which isn't #public, so the site drops it",
        "  - content/p/ready.md: cites linked, which isn't #public, so the site drops it",
        "  - cap: #public with no description",
    ]
    assert publication_gaps(tmp_path / "absent.json", pages, tmp_path) == []
