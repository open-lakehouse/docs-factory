"""Vocab single-source drift test (Python side).

docsnip's controlled vocabularies are derived from content/vocab.json via
docsnip.vocab. This asserts the derived constants match the JSON exactly — the
same file the site derives from (site/src/content-core/vocab.mjs). If someone
re-hardcodes a vocabulary in frontmatter.py, this fails loudly.
"""

from __future__ import annotations

import json
from pathlib import Path

from docsnip import frontmatter, vocab


def _repo_root() -> Path:
    # tools/docsnip/tests/test_vocab.py -> repo root
    return Path(__file__).resolve().parents[3]


def _json() -> dict:
    return json.loads((_repo_root() / "content" / "vocab.json").read_text())


def test_vocab_json_has_expected_keys() -> None:
    data = _json()
    for key in ("diataxis", "projects", "statuses", "pageWorthyKinds"):
        assert isinstance(data[key], list) and data[key], f"{key} missing/empty"


def test_frontmatter_constants_match_vocab_json() -> None:
    data = _json()
    assert frontmatter.DIATAXIS == set(data["diataxis"])
    assert frontmatter.PROJECTS == set(data["projects"])
    assert frontmatter.STATUSES == set(data["statuses"])
    assert frontmatter.PAGE_WORTHY_KINDS == set(data["pageWorthyKinds"])


def test_vocab_accessors_match_json() -> None:
    data = _json()
    assert vocab.diataxis() == set(data["diataxis"])
    assert vocab.diataxis_ordered() == list(data["diataxis"])
    assert vocab.projects() == set(data["projects"])
    assert vocab.statuses() == set(data["statuses"])
    assert vocab.page_worthy_kinds() == set(data["pageWorthyKinds"])
