"""Scala and Java scripts: a `// /// docs-factory` block, runner directives, jvm lane."""

from __future__ import annotations

import pytest
from docsnip.compat import _package_pins
from docsnip.scriptmeta import ScriptMetaError, discover, parse_script

BLOCK = """// /// docs-factory
// claims.spark-scala = [
//   { journey = "read.scan", region = "read" },
// ]
// ///
"""


def _write(tmp_path, name: str, text: str):
    path = tmp_path / "delta" / "how-to" / "001-read" / "snippets" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def test_a_scala_script_reads_its_using_directives(tmp_path) -> None:
    path = _write(
        tmp_path,
        "read.sc",
        "//> using scala 2.13\n"
        "//> using dep org.apache.spark::spark-sql:4.2.0\n"
        "//> using deps io.delta::delta-spark:4.4.0 com.lihaoyi::os-lib:0.11.4\n\n"
        + BLOCK,
    )
    meta = parse_script(path)
    assert meta is not None and meta.runner == "scala"
    assert meta.docs_factory.lane == "jvm"
    assert meta.dependencies == [
        "org.apache.spark::spark-sql:4.2.0",
        "io.delta::delta-spark:4.4.0",
        "com.lihaoyi::os-lib:0.11.4",
    ]
    assert [c.interface for c in meta.docs_factory.claims] == ["spark-scala"]


def test_a_java_script_reads_its_jbang_deps(tmp_path) -> None:
    path = _write(
        tmp_path,
        "Read.java",
        "//DEPS org.apache.spark:spark-sql_2.13:4.2.0\n"
        "//DEPS io.delta:delta-spark_2.13:4.4.0\n\n" + BLOCK + "public class Read {}\n",
    )
    meta = parse_script(path)
    assert meta is not None and meta.runner == "java"
    assert meta.docs_factory.lane == "jvm"
    assert _package_pins(meta) == {"spark-sql": "4.2.0", "delta-spark": "4.4.0"}


def test_scala_cli_coordinates_pin_their_artifact(tmp_path) -> None:
    path = _write(
        tmp_path, "read.sc", "//> using dep io.delta::delta-spark:4.4.0\n" + BLOCK
    )
    meta = parse_script(path)
    assert meta is not None and _package_pins(meta) == {"delta-spark": "4.4.0"}


def test_a_jvm_file_without_a_block_is_not_a_script(tmp_path) -> None:
    path = _write(tmp_path, "Helper.java", "public class Helper {}\n")
    assert parse_script(path) is None


def test_a_jvm_script_cannot_pick_another_lane(tmp_path) -> None:
    block = '// /// docs-factory\n// lane = "spark"\n// ///\n'
    path = _write(tmp_path, "read.sc", block)
    with pytest.raises(ScriptMetaError, match="always runs in the jvm lane"):
        parse_script(path)


def test_a_python_script_cannot_take_the_jvm_lane(tmp_path) -> None:
    path = _write(
        tmp_path,
        "read.py",
        '# /// script\n# dependencies = []\n#\n# [tool.docs-factory]\n# lane = "jvm"\n# ///\n',
    )
    with pytest.raises(ScriptMetaError, match="jvm lane is for Scala and Java"):
        parse_script(path)


def test_a_shell_harness_can_take_the_jvm_lane(tmp_path) -> None:
    path = _write(
        tmp_path,
        "run_cli.py",
        "# /// script\n# dependencies = []\n#\n# [tool.docs-factory]\n"
        '# lane = "jvm"\n# verifies = "run.sh"\n# ///\n'
        "from docsnip.shellregions import run\n",
    )
    (path.parent / "run.sh").write_text("jbang --version\n")
    meta = parse_script(path)
    assert meta is not None and meta.docs_factory.lane == "jvm"


def test_discovery_skips_tool_output_in_hidden_folders(tmp_path) -> None:
    _write(tmp_path, "read.sc", BLOCK)
    generated = tmp_path / "delta" / "how-to" / "001-read" / "snippets" / ".scala-build"
    generated.mkdir()
    (generated / "read.scala").write_text(BLOCK)
    assert [m.path.name for m in discover(tmp_path)] == ["read.sc"]
