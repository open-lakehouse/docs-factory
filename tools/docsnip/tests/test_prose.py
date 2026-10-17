"""Mechanical prose rules: precise enough to stay warnings nobody ignores."""

from __future__ import annotations

import json
from pathlib import Path

from docsnip import prose

_FM = "---\ntitle: T\ndiataxis: how-to\nproject: unitycatalog\n---\n"


def _terms(tmp_path: Path, **extra) -> prose.Terms:
    terms = tmp_path / "terms.yml"
    terms.write_text(
        json.dumps(
            {
                "names": {"github": "GitHub"},
                "prohibited": {"kill": "stop"},
                "marketing": ["simply"],
                "acronyms": ["STS"],
                **extra,
            }
        )
    )
    model = tmp_path / "model.json"
    model.write_text(
        json.dumps(
            {
                "elements": {
                    "duckdb": {
                        "kind": "implementation",
                        "title": "DuckDB",
                        "tags": ["public"],
                    },
                    "uc": {
                        "kind": "implementation",
                        "title": "Unity Catalog (OSS)",
                        "tags": ["public"],
                    },
                    "deltaRs": {
                        "kind": "implementation",
                        "title": "delta-rs",
                        "tags": ["public"],
                    },
                    "table": {"kind": "asset", "title": "Table", "tags": ["public"]},
                    "hidden": {"kind": "implementation", "title": "Hidden"},
                }
            }
        )
    )
    return prose.load_terms(terms, model)


def _rules(tmp_path: Path, body: str, *, docs: bool = True, **extra) -> list[str]:
    found = prose.check_text("p.md", _FM + body, _terms(tmp_path, **extra), docs=docs)
    return [f"{f.line}:{f.rule}" for f in found]


def test_names_come_from_public_model_implementations(tmp_path) -> None:
    terms = _terms(tmp_path)
    assert terms.names["duckdb"] == "DuckDB"
    assert terms.names["unity catalog"] == "Unity Catalog"
    assert "table" not in terms.names and "hidden" not in terms.names


def test_wrong_case_name_is_flagged_but_paths_and_code_are_not(tmp_path) -> None:
    body = "Use duckdb here.\n\nRun `duckdb` or see ./duckdb/x and duckdb.sql.\n"
    assert _rules(tmp_path, body) == ["6:name"]


def test_sentence_initial_capital_of_a_lowercase_name_passes(tmp_path) -> None:
    assert _rules(tmp_path, "Delta-rs reads it. DELTA-RS does not.\n") == ["6:name"]


def test_allowed_variant_passes(tmp_path) -> None:
    assert _rules(tmp_path, "Use Duckdb.\n", allow=["Duckdb"]) == []


def test_terms_match_whole_words_only(tmp_path) -> None:
    assert _rules(tmp_path, "A skill to kill.\n") == ["6:term"]


def test_fences_comments_and_tables_are_not_prose(tmp_path) -> None:
    body = "```\nkill it, will it\n```\n<!-- kill\nwill -->\n| will | kill |\n"
    assert _rules(tmp_path, body) == []


def test_docs_only_rules_skip_blogs(tmp_path) -> None:
    body = "It will simply work, for now. STS is used.\n"
    assert sorted(_rules(tmp_path, body)) == [
        "6:acronym",
        "6:hedge",
        "6:marketing",
        "6:tense",
    ]
    assert _rules(tmp_path, body, docs=False) == []


def test_acronym_defined_on_first_use_passes_and_later_uses_are_free(tmp_path) -> None:
    body = "Security Token Service (STS) vends.\n\nSTS again.\n"
    assert _rules(tmp_path, body) == []
    assert _rules(tmp_path, "STS (Security Token Service) vends.\n") == []


def test_only_the_first_undefined_use_is_reported(tmp_path) -> None:
    assert _rules(tmp_path, "STS vends.\n\nSTS again.\n") == ["6:acronym"]


def test_secrets_fail_even_in_code_and_emails_warn(tmp_path) -> None:
    # Assembled at runtime so the repo's own secret scanner doesn't trip on it.
    key = "AKIA" + "ABCDEFGHIJKLMNOP"
    body = f"```\nkey = {key}\n```\nMail me@corp.io or a@example.com.\n"
    found = prose.check_text("p.md", _FM + body, _terms(tmp_path), docs=False)
    assert [(f.rule, f.error) for f in found] == [("secret", True), ("email", False)]


def test_version_pins_are_not_emails(tmp_path) -> None:
    assert _rules(tmp_path, "Run cargo add deltalake@1.1.1 now.\n") == []


def test_repo_has_no_prose_errors() -> None:
    root = Path(__file__).resolve().parents[3]
    assert [str(f) for f in prose.check(root) if f.error] == []
