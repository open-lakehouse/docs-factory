"""Trestle diagram embeds: snapshot resolution, the sibling PNG, digest freshness."""

from __future__ import annotations

import hashlib
import json
import struct
import zlib
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


def _chunk(kind: bytes, body: bytes) -> bytes:
    return (
        struct.pack(">I", len(body))
        + kind
        + body
        + struct.pack(">I", zlib.crc32(kind + body))
    )


def _png(digest: str | None) -> bytes:
    out = b"\x89PNG\r\n\x1a\n" + _chunk(
        b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    )
    if digest is not None:
        out += _chunk(b"tEXt", f"{diagrams.DIGEST_KEY}\0{digest}".encode("latin-1"))
    return out + _chunk(b"IEND", b"")


def _snapshot(path: Path, *, stamped: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = diagrams.render_env_snapshot({"graph": _GRAPH}, "Demo")
    path.write_text(text)
    if stamped:
        digest = hashlib.sha256(text.encode()).hexdigest()
        diagrams.png_for(path).write_bytes(_png(digest))


def _repo(tmp_path: Path) -> Path:
    (tmp_path / "envs" / "demo").mkdir(parents=True)
    (tmp_path / "envs" / "demo" / "env.toml").write_text("")
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


def test_png_digest_reads_the_text_chunk():
    assert diagrams.png_digest_bytes(_png("abc")) == "abc"
    assert diagrams.png_digest_bytes(_png(None)) is None
    assert diagrams.png_digest_bytes(b"not a png") is None


def test_env_embed_resolves(tmp_path):
    root = _repo(tmp_path)
    page = _page(
        root, '![The demo stack](../../../../envs/demo/diagram.png "trestle=demo")\n'
    )
    assert diagrams.check(root, [page], ["demo"]) == []
    assert diagrams.snapshots(root, [page], ["demo"]) == [
        diagrams.env_snapshot_path("demo")
    ]


def test_page_snapshot_embed_resolves(tmp_path):
    root = _repo(tmp_path)
    page = _page(
        root, '![A stack](./assets/s.png "trestle=./assets/s.trestle-graph.json")\n'
    )
    _snapshot(page.parent / "assets" / "s.trestle-graph.json")
    assert diagrams.check(root, [page], ["demo"]) == []
    assert Path(
        "content/uc/how-to/demo/assets/s.trestle-graph.json"
    ) in diagrams.snapshots(root, [page], ["demo"])


def test_unknown_env_and_missing_alt(tmp_path):
    root = _repo(tmp_path)
    page = _page(root, '![](../../../../envs/demo/diagram.png "trestle=nope")\n')
    errors = diagrams.check(root, [page], ["demo"])
    assert any("needs alt text" in e for e in errors)
    assert any("trestle=nope names no generated environment" in e for e in errors)


def test_image_must_be_the_sibling_png(tmp_path):
    root = _repo(tmp_path)
    page = _page(root, '![The demo stack](./assets/copy.png "trestle=demo")\n')
    errors = diagrams.check(root, [page], ["demo"])
    assert len(errors) == 1 and "the image must be diagram.png" in errors[0]


def test_stale_and_missing_pngs(tmp_path):
    root = _repo(tmp_path)
    snapshot = root / diagrams.env_snapshot_path("demo")
    snapshot.write_text(snapshot.read_text().replace("Demo", "Renamed"))
    errors = diagrams.check(root, [], ["demo"])
    assert errors == [
        f"{Path('envs/demo/diagram.png')} is stale for diagram.trestle-graph.json; run `just trestle-diagrams`"
    ]
    diagrams.png_for(snapshot).unlink()
    assert "is missing" in diagrams.check(root, [], ["demo"])[0]


def test_embeds_inside_code_fences_are_examples(tmp_path):
    root = _repo(tmp_path)
    page = _page(root, '```md\n![x](./nope.png "trestle=nope")\n```\n')
    assert diagrams.embeds(page) == []
    assert diagrams.check(root, [page], ["demo"]) == []
