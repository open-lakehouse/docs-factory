"""Trestle diagram markers: a ``trestle`` fence naming the diagram, alt text as its body.

    ```trestle <ref>
    Clients reach Envoy on port 8080, which routes …
    ```

A diagram is a graph snapshot (``<stem>.trestle-graph.json``, the envelope
``@open-lakehouse/trestle-diagram`` draws). ``<ref>`` names a generated
environment, whose snapshot ``docsnip envs --fix`` writes from its ``plan.json``
(``envs/<name>/diagram.trestle-graph.json``), or a snapshot file relative to the
page, exported from Trestle's editor. The sites draw the snapshot as the
interactive canvas; the ``.md`` twins get Trestle's Mermaid flowchart instead,
an environment's from its README's ``## Architecture``, an exported snapshot's
from its ``mermaid`` field (site/src/plugins/lib/trestle-ref.mjs).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

SNAPSHOT_FORMAT = "trestle-graph"
SNAPSHOT_VERSIONS = (1,)
SUFFIX = ".trestle-graph.json"
ENV_STEM = "diagram"
GENERATOR = "docs-factory"

_FENCE_RE = re.compile(r"^\s*(?P<fence>`{3,}|~{3,})\s*(?P<info>.*)$")
# The retired embed: a PNG titled with the ref.
_IMAGE_RE = re.compile(r'^!\[[^\]]*\]\(\S+ "trestle=\S+"\)\s*$')
_MERMAID_RE = re.compile(r"^```mermaid[^\n]*\n.*?\n```[ \t]*$", re.S | re.M)


def env_snapshot_path(name: str) -> Path:
    return Path("envs") / name / f"{ENV_STEM}{SUFFIX}"


def png_for(snapshot: Path) -> Path:
    return snapshot.with_name(snapshot.name.removesuffix(SUFFIX) + ".png")


def render_env_snapshot(plan: dict, title: str | None) -> str:
    """The snapshot of a plan's graph, its viewable files, and its deployment
    steps, formatted as Trestle's ``stringifyGraphSnapshot``."""
    snapshot: dict[str, object] = {
        "format": SNAPSHOT_FORMAT,
        "version": SNAPSHOT_VERSIONS[-1],
        "generator": GENERATOR,
    }
    if title:
        snapshot["title"] = title
    snapshot["graph"] = plan["graph"]
    # The diagram opens only listed paths, so a sensitive file stays unlisted.
    files = [str(f["path"]) for f in plan.get("files") or [] if not f.get("sensitive")]
    if files:
        snapshot["files"] = files
    if plan.get("deploy"):
        snapshot["deploy"] = plan["deploy"]
    return json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n"


def _check_snapshot(path: Path, where: str) -> list[str]:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        return [f"{where}: {path.name} is not a graph snapshot ({exc})"]
    if not isinstance(data, dict) or data.get("format") != SNAPSHOT_FORMAT:
        return [f"{where}: {path.name}: format must be {SNAPSHOT_FORMAT!r}"]
    if data.get("version") not in SNAPSHOT_VERSIONS:
        return [f"{where}: {path.name}: unsupported version {data.get('version')!r}"]
    graph = data.get("graph")
    if not isinstance(graph, dict) or not all(
        isinstance(graph.get(k), list) for k in ("nodes", "edges")
    ):
        return [f"{where}: {path.name}: graph needs nodes and edges arrays"]
    return []


def _has_mermaid(root: Path, snapshot: Path) -> bool:
    """Trestle's Mermaid is there for the twins to inline."""
    if snapshot.is_relative_to("envs"):
        readme = root / snapshot.parent / "README.md"
        if not readme.is_file():
            return False
        text = readme.read_text()
        at = re.search(r"^## Architecture\s*$", text, re.M)
        return bool(at and _MERMAID_RE.search(text, at.end()))
    mermaid = json.loads((root / snapshot).read_text()).get("mermaid")
    return isinstance(mermaid, str) and bool(mermaid.strip())


def embeds(md_path: Path) -> list[tuple[int, str, str]]:
    """``(line, alt, ref)`` for every Trestle marker not inside another fence."""
    found = []
    lines = md_path.read_text().splitlines()
    i = 0
    while i < len(lines):
        m = _FENCE_RE.match(lines[i])
        if not m:
            i += 1
            continue
        fence, info = m["fence"], m["info"].split(maxsplit=1)
        body = []
        j = i + 1
        while j < len(lines):
            close = _FENCE_RE.match(lines[j])
            if (
                close
                and close["fence"][0] == fence[0]
                and len(close["fence"]) >= len(fence)
            ):
                if not close["info"].strip():
                    break
            body.append(lines[j])
            j += 1
        if info and info[0] == "trestle":
            ref = info[1].strip() if len(info) > 1 else ""
            found.append((i + 1, " ".join(" ".join(body).split()), ref))
        i = j + 1
    return found


def retired_embeds(md_path: Path) -> list[int]:
    """Lines still using the PNG embed, outside fences."""
    found = []
    fence = None
    for number, line in enumerate(md_path.read_text().splitlines(), start=1):
        if m := _FENCE_RE.match(line):
            if fence is None:
                fence = m["fence"]
            elif m["fence"][0] == fence[0] and len(m["fence"]) >= len(fence):
                fence = None
            continue
        if fence is None and "trestle=" in line and _IMAGE_RE.match(line):
            found.append(number)
    return found


def resolve(root: Path, md_path: Path, ref: str, envs: set[str]) -> Path | None:
    """The repo-relative snapshot a ref names, or None if it names nothing."""
    if ref in envs:
        return env_snapshot_path(ref)
    if ref.endswith(SUFFIX):
        path = (md_path.parent / ref).resolve()
        try:
            return path.relative_to(root.resolve())
        except ValueError:
            return None
    return None


def check_page(root: Path, md_path: Path, envs: set[str]) -> list[str]:
    errors = []
    try:
        shown = md_path.relative_to(root)
    except ValueError:
        shown = md_path
    for line in retired_embeds(md_path):
        errors.append(
            f"{shown}:{line}: Trestle diagrams are ```trestle <ref> blocks now, with "
            "the alt text as the body"
        )
    for line, alt, ref in embeds(md_path):
        where = f"{shown}:{line}"
        if not alt:
            errors.append(
                f"{where}: a Trestle diagram needs alt text (the block's body)"
            )
        snapshot = resolve(root, md_path, ref, envs) if ref else None
        if snapshot is None:
            errors.append(
                f"{where}: trestle {ref or '(no ref)'} names no generated environment "
                f"and no {SUFFIX} file"
            )
            continue
        if not (root / snapshot).is_file():
            errors.append(f"{where}: {snapshot} is missing")
            continue
        snapshot_errors = _check_snapshot(root / snapshot, where)
        errors += snapshot_errors
        if not snapshot_errors and not _has_mermaid(root, snapshot):
            source = (
                f"{snapshot.parent / 'README.md'} has no Architecture Mermaid block; "
                f"run `just env-render {snapshot.parent.name}`"
                if snapshot.is_relative_to("envs")
                else f"{snapshot.name} has no mermaid field; re-export it from Trestle"
            )
            errors.append(f"{where}: {source}")
    return errors


def check(root: Path, pages: list[Path], envs: list[str]) -> list[str]:
    """Every Trestle marker on ``pages`` resolves to a snapshot with Mermaid."""
    known = set(envs)
    errors = []
    for page in pages:
        errors += check_page(root, page, known)
    return errors
