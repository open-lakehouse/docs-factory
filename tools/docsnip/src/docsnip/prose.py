"""Deterministic prose checks for docs pages and blog drafts.

The mechanical half of the review criteria (content/QUALITY.md (e),
blogs/QUALITY.md (a)): rules a regex decides without judgment, so the
authoring agent's reviewers spend their reads on the rest. Everything here
warns, except a credential-shaped string, which fails: pages and scripts ship
whole.

Docs pages get every rule. Blog drafts get only names, prohibited terms, and
secrets, because tense, hedging, and register are the author's voice.
"""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

import yaml

from .versions import prose_lines

# Kinds whose titles are proper names a reader searches for. Asset and
# capability titles ("Table", "Catalog") are common nouns.
_NAME_KINDS = {"openSpecification", "implementation"}

_HEDGE_RE = re.compile(
    r"\b(currently|not yet|for now|at this time|at present|as of now)\b", re.I
)
_WILL_RE = re.compile(r"\bwill\b", re.I)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)

# Checked on the raw text, code included: a served script is read whole.
_SECRETS = [
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghs)_[A-Za-z0-9]{36}\b")),
    ("GitHub token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}\b")),
    ("review token", re.compile(r"\bdfr_[A-Za-z0-9]{20,}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
]
# The TLD must be letters, so `deltalake@1.1.1` (a version pin) isn't an address.
_EMAIL_RE = re.compile(
    r"\b[A-Za-z][A-Za-z0-9._%+-]*@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})\b"
)
_SAFE_EMAIL_DOMAINS = re.compile(
    r"(^|\.)(example\.(com|org|net)|localhost|test|invalid|users\.noreply\.github\.com)$"
)
_SCRIPT_SUFFIXES = {".py", ".sh", ".sql", ".sc", ".java", ".rs", ".yaml", ".yml"}


@dataclasses.dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str
    message: str
    error: bool = False

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: [{self.rule}] {self.message}"


@dataclasses.dataclass
class Terms:
    names: dict[str, str]
    allowed: set[str]
    prohibited: dict[str, str]
    marketing: list[str]
    acronyms: list[str]


def load_terms(terms_yml: Path, model_json: Path) -> Terms:
    raw = yaml.safe_load(terms_yml.read_text()) if terms_yml.is_file() else {}
    raw = raw or {}
    names = {str(k).lower(): str(v) for k, v in (raw.get("names") or {}).items()}
    if model_json.is_file():
        elements = json.loads(model_json.read_text()).get("elements", {})
        for el in elements.values():
            if el.get("kind") not in _NAME_KINDS:
                continue
            if "public" not in (el.get("tags") or []):
                continue
            title = re.sub(r"\s*\(.*?\)\s*$", "", el.get("title") or "").strip()
            if title:
                names.setdefault(title.lower(), title)
    return Terms(
        names=names,
        allowed={str(a) for a in raw.get("allow") or []},
        prohibited={
            str(k).lower(): str(v) for k, v in (raw.get("prohibited") or {}).items()
        },
        marketing=[str(t).lower() for t in raw.get("marketing") or []],
        acronyms=[str(a) for a in raw.get("acronyms") or []],
    )


def _word(term: str) -> re.Pattern[str]:
    # Paths, package names, and identifiers keep their own spelling, so a
    # neighbouring `/`, `.`, `-`, or `_` doesn't count as a word boundary.
    return re.compile(rf"(?<![\w/.\-]){re.escape(term)}(?![\w/\-]|\.\w)", re.I)


def _lines(text: str):
    text = _COMMENT_RE.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    for n, line in prose_lines(text):
        if re.match(r"\s*:{3,}", line):
            # Directive fences: their attributes are config, the label is prose.
            line = re.sub(r"\{[^}]*\}", "", line)
        yield n, line


def check_text(rel: str, text: str, terms: Terms, *, docs: bool) -> list[Finding]:
    found: list[Finding] = []
    found += check_secrets(rel, text)
    name_res = [(_word(k), v) for k, v in terms.names.items()]
    banned = [(_word(k), k, v) for k, v in terms.prohibited.items()]
    hype = [(_word(k), k) for k in terms.marketing]
    seen_acronyms: set[str] = set()
    for n, line in _lines(text):
        for rx, canonical in name_res:
            for m in rx.finditer(line):
                got = m.group(0)
                # Sentence-initial capitals of lowercase names ("Delta-rs") pass.
                if got in terms.allowed or got in (
                    canonical,
                    canonical[:1].upper() + canonical[1:],
                ):
                    continue
                found.append(Finding(rel, n, "name", f'"{got}" → "{canonical}"'))
        for rx, term, instead in banned:
            if rx.search(line):
                found.append(Finding(rel, n, "term", f'"{term}" → {instead}'))
        if not docs:
            continue
        for rx, term in hype:
            if rx.search(line):
                found.append(
                    Finding(rel, n, "marketing", f'"{term}": cut it or state the fact')
                )
        if m := _HEDGE_RE.search(line):
            found.append(
                Finding(
                    rel,
                    n,
                    "hedge",
                    f'"{m.group(0)}" implies a change to come; state what is true, '
                    "and list release-sensitive absences in R01",
                )
            )
        if _WILL_RE.search(line):
            found.append(
                Finding(rel, n, "tense", '"will": describe behavior in the present')
            )
        for acr in terms.acronyms:
            if acr in seen_acronyms:
                continue
            rx = re.compile(rf"(?<![\w-]){re.escape(acr)}s?(?![\w-])")
            if not (m := rx.search(line)):
                continue
            seen_acronyms.add(acr)
            after, before = line[m.end() :], line[: m.start()]
            if after.lstrip().startswith("(") or before.rstrip().endswith("("):
                continue
            found.append(
                Finding(
                    rel,
                    n,
                    "acronym",
                    f'{acr} first used without its expansion: "<spelled out> ({acr})"',
                )
            )
    return found


def check_secrets(rel: str, text: str) -> list[Finding]:
    found: list[Finding] = []
    for n, line in enumerate(text.splitlines(), 1):
        for label, rx in _SECRETS:
            if rx.search(line):
                found.append(
                    Finding(rel, n, "secret", f"{label}-shaped string", error=True)
                )
        for m in _EMAIL_RE.finditer(line):
            if not _SAFE_EMAIL_DOMAINS.search(m.group(1).lower()):
                found.append(
                    Finding(
                        rel,
                        n,
                        "email",
                        "real-looking email address; use name@example.com",
                    )
                )
    return found


def _content_pages(content_root: Path):
    for md in sorted(content_root.rglob("*.md")):
        rel = md.relative_to(content_root)
        if md.name == "README.md" or "snippets" in rel.parts or len(rel.parts) < 3:
            continue
        yield md


def _scripts(root: Path):
    for base in (root / "content", root / "blogs"):
        for f in sorted(base.rglob("snippets/**/*")):
            if f.is_file() and f.suffix in _SCRIPT_SUFFIXES:
                yield f


def check(root: Path) -> list[Finding]:
    terms = load_terms(
        root / "content" / "terms.yml", root / "architecture" / "dist" / "model.json"
    )
    found: list[Finding] = []
    for md in _content_pages(root / "content"):
        found += check_text(str(md.relative_to(root)), md.read_text(), terms, docs=True)
    for md in sorted((root / "blogs").glob("*/index.md")):
        found += check_text(
            str(md.relative_to(root)), md.read_text(), terms, docs=False
        )
    for script in _scripts(root):
        found += check_secrets(str(script.relative_to(root)), script.read_text())
    return found
