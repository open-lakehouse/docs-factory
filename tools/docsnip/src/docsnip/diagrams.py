"""Trestle diagram embeds: ``![alt](<stem>.png "trestle=<ref>")``.

A diagram is a graph snapshot (``<stem>.trestle-graph.json``, the envelope
``@open-lakehouse/trestle-diagram`` draws) and the PNG beside it, which GitHub,
the ``.md`` twins, and no-JS readers see. ``<ref>`` names a generated
environment, whose snapshot ``docsnip envs --fix`` writes from its ``plan.json``
(``envs/<name>/diagram.trestle-graph.json``), or a snapshot file relative to the
page, exported from Trestle's editor.

``just trestle-diagrams`` renders the PNGs in a browser, so their bytes differ
across machines. Each PNG instead carries the SHA-256 of the snapshot it was
drawn from in a ``tEXt`` chunk, and a PNG is stale when that digest no longer
matches the snapshot.
"""

from __future__ import annotations

import hashlib
import json
import re
import struct
from pathlib import Path

SNAPSHOT_FORMAT = "trestle-graph"
SNAPSHOT_VERSIONS = (1,)
SUFFIX = ".trestle-graph.json"
ENV_STEM = "diagram"
GENERATOR = "docs-factory"
# Mirrors DIGEST_KEY in emit/trestle/render.mjs.
DIGEST_KEY = "trestle-graph-sha256"

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# A standalone image line; the title is what marks it a Trestle diagram.
_EMBED_RE = re.compile(
    r'^!\[(?P<alt>[^\]]*)\]\((?P<url>\S+) "trestle=(?P<ref>\S+)"\)\s*$'
)
_FENCE_RE = re.compile(r"^\s*(```|~~~)")


def env_snapshot_path(name: str) -> Path:
    return Path("envs") / name / f"{ENV_STEM}{SUFFIX}"


def png_for(snapshot: Path) -> Path:
    return snapshot.with_name(snapshot.name.removesuffix(SUFFIX) + ".png")


def render_env_snapshot(plan: dict, title: str | None) -> str:
    """The snapshot of a plan's graph, formatted as Trestle's ``stringifyGraphSnapshot``."""
    snapshot: dict[str, object] = {
        "format": SNAPSHOT_FORMAT,
        "version": SNAPSHOT_VERSIONS[-1],
        "generator": GENERATOR,
    }
    if title:
        snapshot["title"] = title
    snapshot["graph"] = plan["graph"]
    return json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n"


def snapshot_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_digest(path: Path) -> str | None:
    """The snapshot digest a rendered PNG records, or None if it has none."""
    return png_digest_bytes(path.read_bytes())


def png_digest_bytes(data: bytes) -> str | None:
    if not data.startswith(_PNG_SIGNATURE):
        return None
    at = len(_PNG_SIGNATURE)
    while at + 8 <= len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        kind = data[at + 4 : at + 8]
        body = data[at + 8 : at + 8 + length]
        if kind == b"tEXt":
            key, _, value = body.partition(b"\0")
            if key.decode("latin-1") == DIGEST_KEY:
                return value.decode("latin-1")
        if kind == b"IEND":
            return None
        at += 12 + length
    return None


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


def check_png(root: Path, snapshot: Path) -> list[str]:
    """The PNG beside ``snapshot`` (both repo-relative) exists and is current."""
    png = png_for(snapshot)
    if not (root / png).is_file():
        return [f"{png} is missing; run `just trestle-diagrams`"]
    if png_digest(root / png) != snapshot_digest(root / snapshot):
        return [f"{png} is stale for {snapshot.name}; run `just trestle-diagrams`"]
    return []


def embeds(md_path: Path) -> list[tuple[int, str, str, str]]:
    """``(line, alt, url, ref)`` for every Trestle diagram outside code fences."""
    found = []
    fenced = False
    for number, line in enumerate(md_path.read_text().splitlines(), start=1):
        if _FENCE_RE.match(line):
            fenced = not fenced
            continue
        if not fenced and "trestle=" in line and (m := _EMBED_RE.match(line)):
            found.append((number, m["alt"], m["url"], m["ref"]))
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
    for line, alt, url, ref in embeds(md_path):
        where = f"{shown}:{line}"
        if not alt.strip():
            errors.append(f"{where}: a Trestle diagram needs alt text")
        snapshot = resolve(root, md_path, ref, envs)
        if snapshot is None:
            errors.append(
                f"{where}: trestle={ref} names no generated environment and no "
                f"{SUFFIX} file"
            )
            continue
        if not (root / snapshot).is_file():
            errors.append(f"{where}: {snapshot} is missing")
            continue
        errors += _check_snapshot(root / snapshot, where)
        image = (md_path.parent / url).resolve()
        if image != (root / png_for(snapshot)).resolve():
            errors.append(
                f"{where}: the image must be {png_for(snapshot).name} beside {snapshot}"
            )
            continue
        if not snapshot.is_relative_to("envs"):
            errors += [f"{where}: {e}" for e in check_png(root, snapshot)]
    return errors


def check(root: Path, pages: list[Path], envs: list[str]) -> list[str]:
    """Every embed on ``pages`` resolves, and every environment's PNG is current."""
    known = set(envs)
    errors = []
    for page in pages:
        errors += check_page(root, page, known)
    for name in envs:
        snapshot = env_snapshot_path(name)
        if (root / snapshot).is_file():
            errors += check_png(root, snapshot)
    return errors


def snapshots(root: Path, pages: list[Path], envs: list[str]) -> list[Path]:
    """Every snapshot a PNG is rendered for: each environment's, and each embedded one."""
    found = {
        env_snapshot_path(n) for n in envs if (root / env_snapshot_path(n)).is_file()
    }
    known = set(envs)
    for page in pages:
        for _, _, _, ref in embeds(page):
            snapshot = resolve(root, page, ref, known)
            if snapshot is not None and (root / snapshot).is_file():
                found.add(snapshot)
    return sorted(found)
