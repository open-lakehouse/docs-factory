"""`[tool.docs-factory].lane`: scripts that need a JVM opt into the spark lane."""

from __future__ import annotations

import pytest
from docsnip.scriptmeta import ScriptMetaError, check, parse_script


def _script(tmp_path, deps: str, table: str = ""):
    path = tmp_path / "proj" / "how-to" / "001-thing" / "snippets" / "read.py"
    path.parent.mkdir(parents=True)
    path.write_text(
        f"# /// script\n# dependencies = [{deps}]\n"
        + (f"#\n# [tool.docs-factory]\n{table}" if table else "")
        + "# ///\n"
    )
    return path


def test_lane_is_parsed(tmp_path) -> None:
    path = _script(tmp_path, '"pyspark==4.2.0"', '# lane = "spark"\n')
    meta = parse_script(path)
    assert meta is not None and meta.docs_factory.lane == "spark"
    assert check(tmp_path) == []


def test_unknown_lane_is_an_error(tmp_path) -> None:
    path = _script(tmp_path, "", '# lane = "gpu"\n')
    with pytest.raises(ScriptMetaError, match="lane must be one of spark"):
        parse_script(path)


def test_spark_dependency_without_the_lane_is_an_error(tmp_path) -> None:
    _script(tmp_path, '"delta-spark==4.4.0", "pyspark==4.2.0"')
    (error,) = check(tmp_path)
    assert 'depends on Spark but [tool.docs-factory] has no lane = "spark"' in error


def test_other_dependencies_stay_in_the_default_lane(tmp_path) -> None:
    _script(tmp_path, '"deltalake==1.6.6", "duckdb==1.5.6"')
    assert check(tmp_path) == []


def test_a_service_lane_spark_script_needs_no_lane(tmp_path) -> None:
    path = _script(tmp_path, '"pyspark==4.1.0"', '# compose = "compose.yaml"\n')
    (path.parent / "compose.yaml").write_text("services: {}\n")
    assert check(tmp_path) == []
