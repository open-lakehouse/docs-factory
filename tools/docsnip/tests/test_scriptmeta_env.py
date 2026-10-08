"""`[tool.docs-factory].env`: extra environment the harness hands a script."""

from __future__ import annotations

import pytest
from docsnip.scriptmeta import ScriptMetaError, parse_script

_HEADER = """# /// script
# dependencies = []
#
# [tool.docs-factory]
# compose = "compose.yaml"
{env}# ///
"""


def _script(tmp_path, env_line: str):
    path = tmp_path / "s.py"
    path.write_text(_HEADER.format(env=env_line))
    return path


def test_env_table_is_parsed(tmp_path) -> None:
    path = _script(
        tmp_path,
        '# env = { AWS_ENDPOINT_URL = "http://localhost:9000", AWS_ALLOW_HTTP = "true" }\n',
    )
    meta = parse_script(path)
    assert meta is not None
    assert meta.docs_factory.env == {
        "AWS_ENDPOINT_URL": "http://localhost:9000",
        "AWS_ALLOW_HTTP": "true",
    }


def test_env_defaults_to_empty(tmp_path) -> None:
    meta = parse_script(_script(tmp_path, ""))
    assert meta is not None and meta.docs_factory.env == {}


def test_env_values_must_be_strings(tmp_path) -> None:
    with pytest.raises(ScriptMetaError, match="env must be a table of strings"):
        parse_script(_script(tmp_path, "# env = { AWS_ALLOW_HTTP = true }\n"))


def test_lane_is_parsed(tmp_path) -> None:
    meta = parse_script(_script(tmp_path, '# lane = "k8s"\n'))
    assert meta is not None and meta.docs_factory.lane == "k8s"


def test_unknown_lane_is_an_error(tmp_path) -> None:
    with pytest.raises(ScriptMetaError, match="lane must be one of"):
        parse_script(_script(tmp_path, '# lane = "vm"\n'))
