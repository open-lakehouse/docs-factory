"""Load the single-source content vocabulary from ``content/vocab.json``.

This is the Python half of the shared vocabulary contract: the JS side reads the
same file via ``site/src/content-core/vocab.mjs``. Keeping the controlled
vocabularies in one committed JSON means the site and docsnip can no longer
drift apart (the old hand-maintained "mirror in engine-map.ts" comments are
gone). Model element ids are NOT here — they come from the LikeC4 model
(``architecture/dist/model.json``), a separate authority.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import yaml


def _vocab_path() -> Path:
    # tools/docsnip/src/docsnip/vocab.py -> repo root -> content/vocab.json
    return Path(__file__).resolve().parents[4] / "content" / "vocab.json"


@lru_cache(maxsize=1)
def _load() -> dict:
    return json.loads(_vocab_path().read_text())


def diataxis() -> set[str]:
    return set(_load()["diataxis"])


def diataxis_ordered() -> list[str]:
    """The Diátaxis quadrants in reading order (for llms.txt sectioning)."""
    return list(_load()["diataxis"])


def projects() -> set[str]:
    return set(_load()["projects"])


def post_types() -> set[str]:
    return set(_load()["postTypes"])


def blog_targets() -> set[str]:
    return set(_load()["blogTargets"])


def statuses() -> set[str]:
    return set(_load()["statuses"])


def page_worthy_kinds() -> set[str]:
    return set(_load()["pageWorthyKinds"])


@lru_cache(maxsize=1)
def spec_features() -> dict[str, set[str]]:
    """Obligation names per spec, from architecture/journeys/obligations/."""
    root = _vocab_path().parents[1] / "architecture" / "journeys" / "obligations"
    found: dict[str, set[str]] = {}
    for path in sorted(root.glob("*.yml")):
        raw = yaml.safe_load(path.read_text()) or {}
        found[str(raw.get("spec"))] = set(raw.get("obligations") or {})
    return found


def delta_topics() -> set[str]:
    return set(_load()["deltaTopics"])
