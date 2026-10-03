from pathlib import Path

import pytest
from docsnip.shellregions import regions, run


def _page(tmp_path: Path, body: str) -> Path:
    snippets = tmp_path / "snippets"
    snippets.mkdir()
    script = snippets / "flow.sh"
    script.write_text(body)
    return script


SCRIPT = """\
# --8<-- [start:setup]
greet() { echo "hi $1"; }
# --8<-- [end:setup]
# --8<-- [start:ok]
greet docs
pwd
# --8<-- [end:ok]
# --8<-- [start:fails]
false
echo unreachable
# --8<-- [end:fails]
"""


def test_regions_are_parsed_by_name(tmp_path):
    script = _page(tmp_path, SCRIPT)
    assert set(regions(script)) == {"setup", "ok", "fails"}


def test_run_prepends_setup_and_runs_from_the_page_folder(tmp_path):
    out = run(_page(tmp_path, SCRIPT), "ok")
    assert "hi docs" in out
    assert str(tmp_path.resolve()) in out


def test_run_stops_at_the_first_failure(tmp_path):
    script = _page(tmp_path, SCRIPT)
    assert "unreachable" not in run(script, "fails", expect_failure=True)
    with pytest.raises(AssertionError):
        run(script, "fails")
