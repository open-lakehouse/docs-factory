"""Interface tabs agree with the matrix's `<Engine> · <Language>` labels."""

from __future__ import annotations

from docsnip.tabs import check, groups

LABELS = ["Spark · SQL", "Spark · Python", "delta-rs · Python", "DuckDB · SQL"]


def _page(tmp_path, body: str):
    page = tmp_path / "content" / "delta" / "how-to" / "001-read" / "index.md"
    page.parent.mkdir(parents=True)
    page.write_text("---\ntitle: Read\n---\n\n" + body)
    return page


def _tab(label: str, body: str = "text", colons: int = 3) -> str:
    fence = ":" * colons
    return f"{fence}tab[{label}]\n{body}\n{fence}\n"


def test_adjacent_tabs_form_one_group_and_prose_ends_it() -> None:
    text = (
        _tab("Spark · SQL")
        + "\n"
        + _tab("Spark · Python")
        + "\nProse between.\n\n"
        + _tab("DuckDB · SQL")
    )
    assert [g for _, g in groups(text)] == [
        ["Spark · SQL", "Spark · Python"],
        ["DuckDB · SQL"],
    ]


def test_nested_directives_and_fences_stay_inside_their_tab() -> None:
    inner = ":::note\nhi\n:::\n\n```python\n:::tab[Fake]\n```"
    text = _tab("Spark · SQL", inner, colons=4) + _tab("DuckDB · SQL")
    ((line, group),) = list(groups(text))
    assert line == 1 and group == ["Spark · SQL", "DuckDB · SQL"]


def test_tabs_in_interface_order_pass(tmp_path) -> None:
    _page(tmp_path, _tab("Spark · SQL") + _tab("delta-rs · Python"))
    assert check(tmp_path, {"delta": LABELS}) == []


def test_an_unknown_label_fails(tmp_path) -> None:
    _page(tmp_path, _tab("Spark · Pyhton"))
    (error,) = check(tmp_path, {"delta": LABELS})
    assert "index.md:5: tab 'Spark · Pyhton' is not an interface label" in error


def test_out_of_order_tabs_fail(tmp_path) -> None:
    _page(tmp_path, _tab("DuckDB · SQL") + _tab("Spark · SQL"))
    (error,) = check(tmp_path, {"delta": LABELS})
    assert (
        "out of order; compatibility.yml orders them Spark · SQL, DuckDB · SQL" in error
    )


def test_mixing_plain_and_interface_tabs_fails(tmp_path) -> None:
    _page(tmp_path, _tab("Spark · SQL") + _tab("CLI"))
    (error,) = check(tmp_path, {"delta": LABELS})
    assert "mixes interface tabs with plain ones (CLI)" in error


def test_plain_groups_and_plain_projects_are_left_alone(tmp_path) -> None:
    _page(tmp_path, _tab("Python SDK") + _tab("CLI"))
    assert check(tmp_path, {"delta": LABELS}) == []
    assert check(tmp_path, {"delta": ["Spark", "DuckDB"]}) == []
