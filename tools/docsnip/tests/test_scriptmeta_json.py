"""The `docsnip scripts --json` build contract (Phase 3 of agentic-docs).

The site's build-script-index.mjs shells out to this command and asserts the
`version`, so its shape is a contract. This covers: the versioned wrapper, the
required keys on every entry, that a known script's parsed deps match its PEP 723
block, and the tutorial-slug derivation (NNN- prefix stripped).
"""

from __future__ import annotations

from pathlib import Path

from docsnip.cli import SCRIPTS_JSON_VERSION, _paths, _tutorial_slug, cmd_scripts
from docsnip.scriptmeta import discover


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _payload(capsys):
    p = _paths(_repo_root())
    rc = cmd_scripts(p, as_json=True)
    assert rc == 0
    import json

    return json.loads(capsys.readouterr().out)


def test_versioned_wrapper(capsys) -> None:
    payload = _payload(capsys)
    assert payload["version"] == SCRIPTS_JSON_VERSION
    assert isinstance(payload["scripts"], list)


def test_every_entry_has_required_keys(capsys) -> None:
    payload = _payload(capsys)
    assert payload["scripts"], "expected at least one discovered PEP 723 script"
    required = {
        "path",
        "requires_python",
        "dependencies",
        "compose",
        "services",
        "base_url_env",
        "tutorial_slug",
    }
    for entry in payload["scripts"]:
        assert required <= set(entry), f"missing keys in {entry}"
        assert entry["path"].startswith("content/")  # repo-relative POSIX


def test_json_matches_discover(capsys) -> None:
    payload = _payload(capsys)
    root = _repo_root()
    discovered = discover(root / "content")
    json_paths = sorted(e["path"] for e in payload["scripts"])
    disc_paths = sorted(m.path.resolve().relative_to(root).as_posix() for m in discovered)
    assert json_paths == disc_paths


def test_tutorial_slug_strips_order_prefix(tmp_path) -> None:
    content = tmp_path / "content"
    script = content / "delta" / "tutorials" / "002-explore-history" / "snippets" / "x.py"
    script.parent.mkdir(parents=True)
    script.write_text("# /// script\n# ///\n")
    assert _tutorial_slug(script, content) == "explore-history"
