"""Which tutorial scripts a CI run executes, and how they split across runners.

A script belongs to exactly one lane, the toolchain its job installs: ``services``
(it declares a compose), ``spark`` (``lane = "spark"``), ``jvm`` (a Scala or Java
script), ``rust`` (an example of the snippets crate), or ``default``. On a pull
request only the scripts whose inputs changed run; a change to anything every
script depends on (the harness, docsnip, the lockfile) selects them all. Each
lane's selection is then packed into shards by recorded duration, and every
shard runs on its own runner. That also lifts the Delta lock
(``content/conftest.py``): it serializes scripts on one machine, and shards don't
share one.

The harness reads a shard's scripts from ``DOCS_FACTORY_SELECT``, so the
assignment is computed once, here, and never re-derived on the runner.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Mapping
from pathlib import Path

from .scriptmeta import ScriptMeta

LANES = ("default", "spark", "jvm", "rust", "services")

# Per-lane shard cap. Every shard pays its own setup (the toolchain, the
# ~1 GB UC image build), so a shard should carry at least TARGET_S of scripts.
# One rust shard: building the snippets crate dominates, and every shard repeats it.
_MAX_SHARDS = {"default": 1, "spark": 2, "jvm": 2, "rust": 1, "services": 4}
TARGET_S = 120

# Seconds assumed for a script with no recorded duration.
DEFAULT_DURATION_S = 30

DURATIONS_FILE = Path(".github") / "script-durations.json"

# Changes here can break any script, so they select every script.
GLOBAL_INPUTS = (
    "content/conftest.py",
    "content/_harness/",
    "tools/docsnip/",
    "seed/",
    "pyproject.toml",
    "uv.lock",
    ".github/workflows/ci.yml",
    ".github/actions/",
)


def lane_of(meta: ScriptMeta) -> str:
    if meta.docs_factory.needs_services:
        return "services"
    if meta.docs_factory.lane in ("spark", "jvm", "rust"):
        return meta.docs_factory.lane
    return "default"


def _rel(path: Path, repo_root: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def inputs(meta: ScriptMeta, repo_root: Path) -> list[str]:
    """Repo-relative paths (a trailing ``/`` marks a directory) whose change
    should rerun the script, besides :data:`GLOBAL_INPUTS`.

    The page folder covers the script, its sibling helpers, and the snippets it
    verifies. A page that shows another page's snippet doesn't need it: the
    snippet's own verifier lives beside it.
    """
    page = meta.owning_page()
    folder = page.parent if page else meta.path.parent
    paths = [_rel(folder, repo_root) + "/"]
    content = (repo_root / "content").resolve()
    project = meta.path.resolve().relative_to(content).parts[0]
    paths.append(f"content/{project}/release.yml")
    if meta.docs_factory.needs_services:
        # Compose files include and extend each other across envs/.
        paths.append("envs/")
    if meta.runner == "rust":
        # The snippets crate's dependencies, and the workspace that locks them.
        paths += ["content/_rust/", "Cargo.toml", "Cargo.lock"]
    return paths


def _touches(changed: str, prefix: str) -> bool:
    return changed.startswith(prefix) if prefix.endswith("/") else changed == prefix


def select(
    scripts: Iterable[ScriptMeta], repo_root: Path, changed: list[str] | None
) -> list[ScriptMeta]:
    """The scripts a change set reruns; ``changed=None`` means all of them."""
    scripts = list(scripts)
    if changed is None or any(_touches(c, g) for c in changed for g in GLOBAL_INPUTS):
        return scripts
    return [
        s
        for s in scripts
        if any(_touches(c, i) for c in changed for i in inputs(s, repo_root))
    ]


def load_durations(repo_root: Path) -> dict[str, float]:
    path = repo_root / DURATIONS_FILE
    return json.loads(path.read_text()) if path.is_file() else {}


def shard(
    paths: list[str], durations: Mapping[str, float], max_shards: int
) -> list[list[str]]:
    """Pack paths into shards, longest first onto the least-loaded shard.

    Deterministic for a given input, so re-running a plan reproduces it.
    """
    if not paths:
        return []
    cost = {p: durations.get(p, DEFAULT_DURATION_S) for p in paths}
    count = min(max_shards, max(1, math.ceil(sum(cost.values()) / TARGET_S)))
    bins: list[list[str]] = [[] for _ in range(count)]
    loads = [0.0] * count
    for p in sorted(paths, key=lambda p: (-cost[p], p)):
        i = loads.index(min(loads))
        bins[i].append(p)
        loads[i] += cost[p]
    return [sorted(b) for b in bins]


def plan(
    scripts: Iterable[ScriptMeta], repo_root: Path, changed: list[str] | None
) -> dict[str, list[dict]]:
    """Per lane, the matrix of shards:
    ``[{"id": "spark-1", "shard": "1/2", "scripts": [...]}]``. The ``id`` is safe
    in artifact names, which can't hold the ``/`` of ``shard``.

    A lane with nothing selected maps to ``[]``, which the workflow skips.
    """
    durations = load_durations(repo_root)
    by_lane: dict[str, list[str]] = {lane: [] for lane in LANES}
    for meta in select(scripts, repo_root, changed):
        by_lane[lane_of(meta)].append(_rel(meta.path, repo_root))
    out: dict[str, list[dict]] = {}
    for lane, paths in by_lane.items():
        bins = shard(paths, durations, _MAX_SHARDS[lane])
        out[lane] = [
            {"id": f"{lane}-{i}", "shard": f"{i}/{len(bins)}", "scripts": b}
            for i, b in enumerate(bins, start=1)
        ]
    return out


def merge_durations(repo_root: Path, recorded: Iterable[Path]) -> dict[str, int]:
    """Fold per-shard duration files into :data:`DURATIONS_FILE` and return it.

    Scripts absent from ``recorded`` keep their old value; deleted scripts drop.
    """
    durations = load_durations(repo_root)
    for path in recorded:
        durations.update(json.loads(path.read_text()))
    merged = {
        p: round(s) for p, s in sorted(durations.items()) if (repo_root / p).is_file()
    }
    (repo_root / DURATIONS_FILE).write_text(json.dumps(merged, indent=2) + "\n")
    return merged
