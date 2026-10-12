from pathlib import Path

from docsnip.sqlregions import regions, run, statements, text

SCRIPT = """\
-- Opens with a comment the page never shows.
-- --8<-- [start:create]
CREATE TABLE delta.`/tmp/delta/orders` (order_id BIGINT, product STRING)
USING DELTA;
-- --8<-- [end:create]

-- --8<-- [start:insert]
INSERT INTO delta.`/tmp/delta/orders` VALUES (1, 'widget'), (2, 'it''s; fine');
-- Count what landed.
SELECT count(*) FROM delta.`/tmp/delta/orders`;
-- --8<-- [end:insert]
"""


def _script(tmp_path: Path) -> Path:
    path = tmp_path / "flow.sql"
    path.write_text(SCRIPT)
    return path


def test_regions_are_parsed_by_name(tmp_path):
    assert set(regions(_script(tmp_path))) == {"create", "insert"}


def test_text_joins_regions_in_the_order_given(tmp_path):
    joined = text(_script(tmp_path), "create", "insert")
    assert joined.index("CREATE TABLE") < joined.index("INSERT INTO")
    assert "Opens with a comment" not in joined


def test_statements_split_outside_quotes_and_drop_comments():
    assert statements(
        "SELECT 'a;b', \"c;d\", `e;f`; -- trailing; comment\n"
        "/* block; */ SELECT 'it\\'s' AS x;\n"
        "-- only a comment;\n"
    ) == ["SELECT 'a;b', \"c;d\", `e;f`", "SELECT 'it\\'s' AS x"]


def test_statements_keep_a_doubled_quote_inside_its_string():
    assert statements("SELECT 'it''s; fine'; SELECT 2") == [
        "SELECT 'it''s; fine'",
        "SELECT 2",
    ]


def test_run_executes_each_statement_in_order(tmp_path):
    seen: list[str] = []
    results = run(_script(tmp_path), "insert", lambda s: seen.append(s) or len(s))
    assert seen == [
        "INSERT INTO delta.`/tmp/delta/orders` VALUES (1, 'widget'), (2, 'it''s; fine')",
        "SELECT count(*) FROM delta.`/tmp/delta/orders`",
    ]
    assert results == [len(s) for s in seen]
