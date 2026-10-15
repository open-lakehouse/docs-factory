"""`[tool.docs-factory].timeout` / `.retries`: the harness's per-run limit and re-runs."""

from __future__ import annotations

import pytest
from docsnip.scriptmeta import ScriptMetaError, parse_script

_HEADER = """# /// script
# dependencies = []
#
# [tool.docs-factory]
# compose = "compose.yaml"
{lines}# ///
"""


def _script(tmp_path, lines: str):
    path = tmp_path / "s.py"
    path.write_text(_HEADER.format(lines=lines))
    return path


def test_timeout_and_retries_are_parsed(tmp_path) -> None:
    meta = parse_script(_script(tmp_path, "# timeout = 180\n# retries = 2\n"))
    assert meta is not None
    assert (meta.docs_factory.timeout, meta.docs_factory.retries) == (180, 2)


def test_defaults_leave_the_harness_limit_and_never_retry(tmp_path) -> None:
    meta = parse_script(_script(tmp_path, ""))
    assert meta is not None
    assert (meta.docs_factory.timeout, meta.docs_factory.retries) == (None, 0)


@pytest.mark.parametrize("value", ["0", "-5", "true", '"180"'])
def test_timeout_must_be_positive_seconds(tmp_path, value: str) -> None:
    with pytest.raises(ScriptMetaError, match="timeout must be a positive"):
        parse_script(_script(tmp_path, f"# timeout = {value}\n"))


@pytest.mark.parametrize("value", ["-1", "true", "1.5"])
def test_retries_must_be_a_non_negative_integer(tmp_path, value: str) -> None:
    with pytest.raises(ScriptMetaError, match="retries must be a non-negative"):
        parse_script(_script(tmp_path, f"# retries = {value}\n"))
