"""Served scripts stay reader-facing: no repo paths or harness names."""

from __future__ import annotations

from pathlib import Path

from docsnip import published
from docsnip.scriptmeta import ScriptMeta, discover, parse_script

_HEADER = '# /// script\n# dependencies = []\n#\n# [tool.docs-factory]\n# compose = "../c.yaml"\n# ///\n'


def _meta(path: Path) -> ScriptMeta:
    meta = parse_script(path)
    assert meta is not None
    return meta


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_repo_scripts_are_reader_facing() -> None:
    errors, _ = published.check(discover(_repo_root() / "content"))
    assert errors == []


def test_harness_mentions_are_errors_but_the_metadata_block_is_not(tmp_path) -> None:
    script = tmp_path / "s.py"
    script.write_text(
        _HEADER + '"""Run me.\n\nuv run snippets/s.py\n"""\n# see conftest.py\n'
    )
    errors, _ = published.check([_meta(script)])
    assert [e.split(": ", 1)[0] for e in errors] == [f"{script}:9", f"{script}:11"]


def test_helpers_are_served_and_linted(tmp_path) -> None:
    script = tmp_path / "s.py"
    script.write_text(_HEADER + "from _seed import x\n")
    (tmp_path / "_seed.py").write_text("# from envs/unitycatalog\nx = 1\n")
    meta = _meta(script)
    assert published.served_files(meta) == [script, tmp_path / "_seed.py"]
    errors, _ = published.check([meta])
    assert len(errors) == 1 and errors[0].startswith(f"{tmp_path / '_seed.py'}:1")
