"""`[tool.docs-factory].verifies`: a harness names the snippet it tests."""

from __future__ import annotations

import pytest
from docsnip.scriptmeta import ScriptMetaError, check, parse_script

_HARNESS = """# /// script
# dependencies = []
#
# [tool.docs-factory]
{verifies}# ///
"""


def _page(tmp_path, *, fence: bool) -> tuple:
    """A folder-mode page with a `snippets/steps.sh` and a `steps_cli.py` harness."""
    page = tmp_path / "proj" / "how-to" / "001-thing"
    snippets = page / "snippets"
    snippets.mkdir(parents=True)
    (snippets / "steps.sh").write_text(
        "# --8<-- [start:a]\necho hi\n# --8<-- [end:a]\n"
    )
    body = (
        "```bash file=./snippets/steps.sh start=start:a end=end:a\n```\n"
        if fence
        else ""
    )
    (page / "index.md").write_text(
        f"---\ntitle: T\ndiataxis: how-to\nproject: proj\n---\n\n{body}"
    )
    harness = snippets / "steps_cli.py"
    return page, harness


def test_verifies_is_parsed_relative_to_the_script(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    harness.write_text(_HARNESS.format(verifies='# verifies = "steps.sh"\n'))
    meta = parse_script(harness)
    assert meta is not None
    assert meta.docs_factory.verifies == "steps.sh"
    assert meta.verifies_path() == (harness.parent / "steps.sh").resolve()


def test_verifies_defaults_to_none(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    harness.write_text(_HARNESS.format(verifies=""))
    meta = parse_script(harness)
    assert meta is not None and meta.verifies_path() is None


def test_verifies_must_be_a_string(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    harness.write_text(_HARNESS.format(verifies="# verifies = 1\n"))
    with pytest.raises(ScriptMetaError, match="verifies must be a string"):
        parse_script(harness)


def test_check_accepts_a_fenced_target(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    harness.write_text(_HARNESS.format(verifies='# verifies = "steps.sh"\n'))
    assert check(tmp_path) == []


def test_check_rejects_a_missing_target(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    harness.write_text(_HARNESS.format(verifies='# verifies = "nope.sh"\n'))
    (errors,) = check(tmp_path)
    assert "verifies points at a missing file: nope.sh" in errors


def test_check_rejects_an_unfenced_target(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=False)
    harness.write_text(_HARNESS.format(verifies='# verifies = "steps.sh"\n'))
    (errors,) = check(tmp_path)
    assert "not referenced by any page's file= fence" in errors


def test_check_rejects_a_non_shell_target(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    (harness.parent / "steps.sql").write_text("select 1;\n")
    harness.write_text(_HARNESS.format(verifies='# verifies = "steps.sql"\n'))
    (errors,) = check(tmp_path)
    assert "verifies must name a .sh script: steps.sql" in errors


def test_check_requires_verifies_on_a_shell_harness(tmp_path) -> None:
    _, harness = _page(tmp_path, fence=True)
    harness.write_text(
        _HARNESS.format(verifies="") + "from docsnip.shellregions import run\n"
    )
    (errors,) = check(tmp_path)
    assert "drives a shell snippet via docsnip.shellregions" in errors
