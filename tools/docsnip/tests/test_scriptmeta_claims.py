"""`[tool.docs-factory].claims`: what a script proves for a compatibility matrix."""

from __future__ import annotations

import re

import pytest
from docsnip.scriptmeta import Claim, ScriptMetaError, parse_script


def _script(tmp_path, claims: str):
    path = tmp_path / "x.py"
    path.write_text(
        "# /// script\n# dependencies = []\n#\n# [tool.docs-factory]\n"
        + "".join(f"# {line}\n" for line in claims.strip().splitlines())
        + "# ///\n"
    )
    return path


def test_claims_parse_per_interface(tmp_path) -> None:
    meta = parse_script(
        _script(
            tmp_path,
            """
claims.duckdb = [
  { op = "table.list", region = "list" },
  { op = "managed.create", fails = true, anchor = "create" },
]
claims."delta:spark-sql" = [{ op = "dml.update", region = "change", note = "managed" }]
""",
        )
    )
    assert meta is not None
    assert meta.docs_factory.claims == [
        Claim("duckdb", "table.list", region="list"),
        Claim("duckdb", "managed.create", anchor="create", fails=True),
        Claim("delta:spark-sql", "dml.update", region="change", note="managed"),
    ]
    assert [c.works for c in meta.docs_factory.claims] == [True, False, True]


def test_no_claims_is_an_empty_list(tmp_path) -> None:
    meta = parse_script(_script(tmp_path, 'compose = "c.yaml"'))
    assert meta is not None and meta.docs_factory.claims == []


@pytest.mark.parametrize(
    ("claims", "message"),
    [
        ('claims = ["x"]', "must be a table"),
        ('claims.duckdb = "x"', "must be an array"),
        ('claims.duckdb = [{ region = "r" }]', "needs an op"),
        ('claims.duckdb = [{ op = "a", where = "r" }]', "unknown key(s) where"),
        ('claims.duckdb = [{ op = "a" }]', "names the region"),
        ('claims.duckdb = [{ op = "a", fails = "" }]', "fails is true"),
        ('claims.duckdb = [{ op = "a", fails = 1 }]', "fails is true"),
        ('claims.duckdb = [{ op = "a", region = 1 }]', "region must be a string"),
    ],
)
def test_malformed_claims_are_errors(tmp_path, claims: str, message: str) -> None:
    with pytest.raises(ScriptMetaError, match=re.escape(message)):
        parse_script(_script(tmp_path, claims))
