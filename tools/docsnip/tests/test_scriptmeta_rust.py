"""Rust scripts: examples of the snippets crate, which holds their dependencies."""

from __future__ import annotations

import pytest
from docsnip.ciplan import inputs, lane_of
from docsnip.compat import _package_pins
from docsnip.scriptmeta import ScriptMetaError, check, parse_script

BLOCK = """// /// docs-factory
// claims.delta-rs-rust = [
//   { journey = "read.scan", region = "read" },
// ]
// ///
"""

CRATE = """\
[package]
name = "docs-factory-snippets"
version = "0.0.0"

[dependencies]
deltalake = { version = "=1.1.1", features = ["datafusion"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
anyhow = "1"

[[example]]
name = "delta-read"
path = "../delta/how-to/001-read/snippets/read.rs"
"""


def _content(tmp_path, crate: str = CRATE):
    content = tmp_path / "content"
    (content / "_rust").mkdir(parents=True)
    (content / "_rust" / "Cargo.toml").write_text(crate)
    path = content / "delta" / "how-to" / "001-read" / "snippets" / "read.rs"
    path.parent.mkdir(parents=True)
    path.write_text(BLOCK + "\nfn main() {}\n")
    return content, path


def test_a_rust_script_is_its_crate_example(tmp_path) -> None:
    _, path = _content(tmp_path)
    meta = parse_script(path)
    assert meta is not None and meta.runner == "rust"
    assert meta.docs_factory.lane == "rust"
    assert meta.cargo_example == "delta-read"
    # What a reader passes to `cargo add`.
    assert meta.dependencies == [
        "deltalake@1.1.1 --features datafusion",
        "tokio@1 --features macros,rt-multi-thread",
        "anyhow@1",
    ]
    assert _package_pins(meta)["deltalake"] == "1.1.1"


def test_a_rust_script_no_example_builds_is_an_error(tmp_path) -> None:
    content, path = _content(tmp_path, CRATE.split("[[example]]")[0])
    meta = parse_script(path)
    assert meta is not None and meta.cargo_example is None
    (error,) = check(content)
    assert "no [[example]] in content/_rust/Cargo.toml builds it" in error
    assert 'path = "../delta/how-to/001-read/snippets/read.rs"' in error


def test_a_python_script_cannot_take_the_rust_lane(tmp_path) -> None:
    path = tmp_path / "read.py"
    path.write_text('# /// script\n#\n# [tool.docs-factory]\n# lane = "rust"\n# ///\n')
    with pytest.raises(ScriptMetaError, match="rust lane is for Rust scripts"):
        parse_script(path)


def test_a_rust_script_reruns_when_its_crate_or_lockfile_changes(tmp_path) -> None:
    _, path = _content(tmp_path)
    meta = parse_script(path)
    assert meta is not None and lane_of(meta) == "rust"
    paths = inputs(meta, tmp_path)
    assert {"content/_rust/", "Cargo.toml", "Cargo.lock"} <= set(paths)
