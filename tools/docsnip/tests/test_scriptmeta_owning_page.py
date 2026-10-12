"""A script's owning page decides whether its test gates CI."""

from __future__ import annotations

from docsnip.frontmatter import page_status
from docsnip.scriptmeta import parse_script

_SCRIPT = "# /// script\n# dependencies = []\n# ///\n"


def _page(root, status: str | None):
    page = root / "content" / "proj" / "how-to" / "001-thing"
    (page / "snippets").mkdir(parents=True)
    line = f"status: {status}\n" if status else ""
    (page / "index.md").write_text(
        f"---\ntitle: T\ndiataxis: how-to\nproject: proj\n{line}---\n\nBody.\n"
    )
    return page


def test_a_snippets_script_belongs_to_the_page_above_it(tmp_path) -> None:
    page = _page(tmp_path, "ready")
    script = page / "snippets" / "x.py"
    script.write_text(_SCRIPT)
    meta = parse_script(script)
    assert meta is not None
    assert meta.owning_page() == (page / "index.md").resolve()
    assert page_status(meta.owning_page()) == "ready"


def test_a_script_beside_the_page_belongs_to_it(tmp_path) -> None:
    page = _page(tmp_path, None)
    script = page / "seed.py"
    script.write_text(_SCRIPT)
    meta = parse_script(script)
    assert meta is not None
    assert meta.owning_page() == (page / "index.md").resolve()
    # No status means draft, as `docsnip validate` reads it.
    assert page_status(meta.owning_page()) == "draft"


def test_the_search_stops_at_the_content_root(tmp_path) -> None:
    (tmp_path / "index.md").write_text("---\ntitle: Outside\n---\n")
    stray = tmp_path / "content" / "proj" / "x.py"
    stray.parent.mkdir(parents=True)
    stray.write_text(_SCRIPT)
    meta = parse_script(stray)
    assert meta is not None and meta.owning_page() is None
