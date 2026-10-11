"""The model-quality report over a small model.json."""

from __future__ import annotations

import json

from docsnip.frontmatter import model_quality_gaps


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


def test_missing_model_reports_nothing(tmp_path):
    assert model_quality_gaps(tmp_path / "absent.json") == []
