"""Trestle diagram markers: snapshot resolution, alt text, the twins' Mermaid."""

from __future__ import annotations

import json
from pathlib import Path

from docsnip import diagrams

_GRAPH = {
    "nodes": [
        {"id": "@clients", "kind": "clients"},
        {"id": "envoy", "kind": "gateway"},
    ],
    "edges": [
        {
            "kind": "access",
            "key": "access:@clients→envoy:8080",
            "from": "@clients",
            "to": "envoy",
        }
    ],
}

_README = """# Deploying `demo`

## Architecture

```mermaid
flowchart LR
    n0(["<b>Clients</b>"]):::clients
```
"""


def _snapshot(path: Path, **extra: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(diagrams.render_env_snapshot({"graph": _GRAPH}, "Demo"))
    path.write_text(json.dumps({**data, **extra}))


def _repo(tmp_path: Path) -> Path:
    env = tmp_path / "envs" / "demo"
    env.mkdir(parents=True)
    (env / "env.toml").write_text("")
    (env / "README.md").write_text(_README)
    _snapshot(tmp_path / diagrams.env_snapshot_path("demo"))
    return tmp_path


def _page(root: Path, body: str) -> Path:
    page = root / "content" / "uc" / "how-to" / "demo" / "index.md"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(body)
    return page


def test_env_snapshot_matches_trestle_format():
    text = diagrams.render_env_snapshot({"graph": _GRAPH, "other": 1}, "Demo")
    data = json.loads(text)
    assert list(data) == ["format", "version", "generator", "title", "graph"]
    assert data["format"] == "trestle-graph" and data["graph"] == _GRAPH
    assert "→" in text and text.endswith("}\n")  # JSON.stringify(_, null, 2) + "\n"


def test_env_snapshot_lists_viewable_files_and_deploy_steps():
    step = {
        "order": 1,
        "phase": "start",
        "id": "up",
        "title": "Start",
        "instructions": "x",
    }
    plan = {
        "graph": _GRAPH,
        "files": [
            {"path": "compose.yaml", "sensitive": False},
            {"path": "modules/postgres/secrets/password", "sensitive": True},
        ],
        "deploy": [step],
    }
    data = json.loads(diagrams.render_env_snapshot(plan, None))
    assert data["files"] == ["compose.yaml"]
    assert data["deploy"] == [step]


def test_env_marker_resolves(tmp_path):
    root = _repo(tmp_path)
    page = _page(root, "```trestle demo\nThe demo\nstack\n```\n")
    assert diagrams.embeds(page) == [(1, "The demo stack", "demo")]
    assert diagrams.check(root, [page], ["demo"]) == []


def test_page_snapshot_marker_needs_its_mermaid(tmp_path):
    root = _repo(tmp_path)
    page = _page(root, "```trestle ./assets/s.trestle-graph.json\nA stack\n```\n")
    snapshot = page.parent / "assets" / "s.trestle-graph.json"
    _snapshot(snapshot, mermaid="flowchart LR\n    a --> b\n")
    assert diagrams.check(root, [page], ["demo"]) == []
    _snapshot(snapshot)
    errors = diagrams.check(root, [page], ["demo"])
    assert len(errors) == 1 and "has no mermaid field" in errors[0]


def test_env_without_architecture_mermaid(tmp_path):
    root = _repo(tmp_path)
    (root / "envs" / "demo" / "README.md").write_text("# Deploying `demo`\n")
    page = _page(root, "```trestle demo\nThe demo stack\n```\n")
    errors = diagrams.check(root, [page], ["demo"])
    assert len(errors) == 1 and "has no Architecture Mermaid block" in errors[0]


def test_unknown_env_and_missing_alt(tmp_path):
    root = _repo(tmp_path)
    page = _page(root, "```trestle nope\n```\n\n```trestle\nAlt\n```\n")
    errors = diagrams.check(root, [page], ["demo"])
    assert any("needs alt text" in e for e in errors)
    assert any("trestle nope names no generated environment" in e for e in errors)
    assert any("trestle (no ref) names no generated environment" in e for e in errors)


def test_the_png_embed_is_retired(tmp_path):
    root = _repo(tmp_path)
    page = _page(
        root, '![The demo stack](../../../../envs/demo/diagram.png "trestle=demo")\n'
    )
    errors = diagrams.check(root, [page], ["demo"])
    assert len(errors) == 1 and "are ```trestle <ref> blocks now" in errors[0]


def test_markers_inside_other_fences_are_examples(tmp_path):
    root = _repo(tmp_path)
    page = _page(
        root,
        '````md\n```trestle nope\nx\n```\n![x](./n.png "trestle=nope")\n````\n',
    )
    assert diagrams.embeds(page) == []
    assert diagrams.check(root, [page], ["demo"]) == []
