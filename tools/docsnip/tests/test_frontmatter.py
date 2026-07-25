"""Frontmatter-split parity test: docsnip vs the site's canonical JS splitter.

The site's ``content-core/frontmatter.mjs`` ``splitFrontmatter`` is the authority
for how a page splits into (meta, body); docsnip must agree, or the DB refs the
JS manifest registers won't match what docsnip validates. ``test_cross_language``
guards this on the real corpus, but only for inputs the corpus happens to
contain. This pins the semantics DIRECTLY on adversarial delimiter inputs — the
ones that used to diverge when docsnip closed the block on ``\\n---`` anywhere —
so a regression fails here without needing the corpus (or node) to exercise it.
"""

from __future__ import annotations

import re

import pytest
from docsnip.frontmatter import parse

# Faithful replica of the JS regex (site/src/content-core/frontmatter.mjs):
#   /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
# plus the JS body post-processing (raw.slice(match[0].length).replace(/^\n+/, "")).
_JS_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?")


def js_split(raw: str) -> tuple[str, str] | None:
    """(yaml_text, body) the way the JS splitter produces them, or None."""
    m = _JS_RE.match(raw)
    if m is None:
        return None
    return m.group(1), re.sub(r"^\n+", "", raw[m.end() :])


# Each case is a full source string. The parser and the JS replica must agree on
# the body; a plain partition("\n---") splitter would disagree on several.
CASES = [
    # closing --- with body following
    "---\ntitle: A\n---\nHello body\n",
    # closing --- at EOF (no trailing newline)
    "---\ntitle: A\n---",
    # a `---` that is NOT line-anchored (mid-value) must not close the block
    "---\nsummary: a --- b\ntitle: A\n---\nBody\n",
    # `\n----` (four dashes) must NOT be treated as the close
    "---\ntitle: A\n----\nstill: frontmatter\n---\nBody\n",
    # `\n---foo` (--- not followed by newline) must NOT close in either splitter
    "---\ntitle: A\n---foo\nmore: yaml\n---\nBody\n",
    # CRLF line endings
    "---\r\ntitle: A\r\n---\r\nBody\r\n",
    # body itself contains a later `---` line — only the FIRST close counts
    "---\ntitle: A\n---\nintro\n---\noutro\n",
]


def _norm(body: str) -> str:
    """Body as it feeds contentHash: CRLF collapsed to LF (both sides do this
    before hashing — hashBody in JS, _hash_body in test_cross_language)."""
    return body.replace("\r\n", "\n")


@pytest.mark.parametrize("raw", CASES)
def test_parse_body_matches_js_splitter(tmp_path, raw: str) -> None:
    expected = js_split(raw)
    assert expected is not None, "test case has no valid frontmatter per JS regex"
    _, js_body = expected

    # Path.read_text() applies universal-newline translation, so docsnip sees LF
    # even for a CRLF file. Compare on the normalized body — the thing that
    # actually feeds contentHash — so CRLF read-time translation isn't mistaken
    # for a parser divergence, while a genuine delimiter-placement drift still
    # fails (those cases carry no CR).
    path = tmp_path / "page.md"
    path.write_bytes(raw.encode())
    page = parse(path)
    assert _norm(page.body) == _norm(js_body), (
        "docsnip body diverges from the JS splitter for this input — "
        "the two frontmatter parsers have drifted"
    )
