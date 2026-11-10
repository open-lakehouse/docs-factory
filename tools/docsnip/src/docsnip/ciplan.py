"""Which tutorial scripts a CI run executes, and how they split across runners.

A script belongs to exactly one lane, the toolchain its job installs: ``services``
(it declares a compose), ``spark`` (``lane = "spark"``), ``jvm`` (a Scala or Java
script), ``rust`` (an example of the snippets crate), or ``default``. On a pull
request only the scripts whose inputs changed run; a change to anything every
script depends on (the harness, docsnip, the lockfile) selects them all. Each
lane's selection is then packed into shards by the durations the last full run
on main recorded (the workflow downloads them), and every shard runs on its own
runner. That also lifts the Delta lock
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
_MAX_SHARDS = {"default": 1, "spark": 2, "jvm": 2, "rust": 1, "services": 8}
TARGET_S = 120

# Seconds assumed for a script with no recorded duration: about a service
# script's median, the lane where packing matters.
DEFAULT_DURATION_S = 45

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


def load_durations(recorded: Path | None) -> dict[str, float]:
    """Fold the per-shard duration files under ``recorded`` (a file or a dir of
    them, as ``gh run download`` lays out artifacts) into one map.

    ``None`` or a missing path means nothing is recorded: every script then
    costs :data:`DEFAULT_DURATION_S`.
    """
    if recorded is None or not recorded.exists():
        return {}
    files = sorted(recorded.rglob("*.json")) if recorded.is_dir() else [recorded]
    durations: dict[str, float] = {}
    for path in files:
        durations.update(json.loads(path.read_text()))
    return durations


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


# Lanes whose scripts start a JVM: Spark, scala-cli and JBang, and the PySpark
# and Java clients among the service scripts.
_JAVA_LANES = frozenset({"spark", "jvm", "services"})


def plan(
    scripts: Iterable[ScriptMeta],
    repo_root: Path,
    changed: list[str] | None,
    durations: Mapping[str, float] | None = None,
) -> list[dict]:
    """The CI matrix: one entry per shard, across every lane.

    ``{"id": "spark-1", "lane": "spark", "shard": "1/2", "scripts": [...],
    "java": True, "scala": False, "jbang": False, "rust": False}``. The ``id``
    is safe in artifact names, which can't hold the ``/`` of ``shard``. The
    toolchain flags say what the shard's runner installs: ``scala``, ``jbang``,
    and ``rust`` follow the runners of the shard's own scripts, so a services
    shard builds the snippets crate (before its scripts' timeouts start) only
    when it runs a Rust script.

    Nothing selected means ``[]``, which the workflow skips.
    """
    durations = durations or {}
    by_lane: dict[str, list[str]] = {lane: [] for lane in LANES}
    runner: dict[str, str] = {}
    for meta in select(scripts, repo_root, changed):
        rel = _rel(meta.path, repo_root)
        by_lane[lane_of(meta)].append(rel)
        runner[rel] = meta.runner
    out: list[dict] = []
    for lane, paths in by_lane.items():
        bins = shard(paths, durations, _MAX_SHARDS[lane])
        for i, b in enumerate(bins, start=1):
            runners = {runner[p] for p in b}
            out.append(
                {
                    "id": f"{lane}-{i}",
                    "lane": lane,
                    "shard": f"{i}/{len(bins)}",
                    "scripts": b,
                    "java": lane in _JAVA_LANES,
                    "scala": "scala" in runners,
                    "jbang": "java" in runners,
                    "rust": "rust" in runners,
                }
            )
    return out
