"""Keep the Unity Catalog docs on one release: ``content/unitycatalog/release.yml``.

The docs describe only the current release, so a version number in a page is
either a pin a reader copies (it must match what CI tests) or a boundary
("since 0.6.0", "0.4.0 or later"). ``check`` enforces the first, ``fix``
rewrites pins to the manifest, and ``prose_warnings`` flags prose that scopes a
statement to the release instead. See docs/design/docs-versioning.md.
"""

from __future__ import annotations

import dataclasses
import re
from pathlib import Path

import yaml

MANIFEST = Path("content") / "unitycatalog" / "release.yml"

# Where pins live, relative to the repo root. Blogs are dated narrative and
# keep the versions they were written against.
_SCAN = (
    ("content/unitycatalog", ("*.md", "*.py", "*.sh", "*.yaml")),
    ("envs", ("*.yaml", "*.yml", "*.md", "*.py")),
    ("emit/docs/sites", ("unitycatalog-docs.mjs",)),
)

_V = r"(\d+\.\d+\.\d+)"


@dataclasses.dataclass(frozen=True)
class Rule:
    key: str  # "release" or a key under `pins:`
    pattern: re.Pattern[str]  # group 1 is the version
    files: tuple[str, ...] = ()  # limit to these repo-relative paths
    skip: str | None = None  # repo-relative prefix the rule doesn't apply under


RULES = (
    Rule("release", re.compile(rf"unitycatalog/unitycatalog:v{_V}")),
    Rule("release", re.compile(rf"unitycatalog/unitycatalog/(?:blob|tree)/v{_V}")),
    Rule(
        "release",
        re.compile(
            rf"io\.unitycatalog:unitycatalog-(?:spark_[\d.]+_[\d.]+|client):{_V}"
        ),
    ),
    Rule(
        "release",
        re.compile(rf"^\s*title: Unity Catalog {_V}", re.MULTILINE),
        ("envs/environments.yml",),
    ),
    Rule(
        "release",
        re.compile(rf'ref: "v{_V}"'),
        ("emit/docs/sites/unitycatalog-docs.mjs",),
    ),
    # Where a reference page names the release it describes.
    Rule("release", re.compile(rf"(?:release|server) \*\*{_V}\*\*")),
    Rule("release", re.compile(rf"`v{_V}` source tree")),
    Rule("unitycatalog-client", re.compile(rf"\bunitycatalog-client=={_V}")),
    Rule("unitycatalog-ai", re.compile(rf"\bunitycatalog-ai=={_V}")),
    # A prerequisite's "`unitycatalog-client` 0.6.0". Reference tables name the
    # versions a defect was verified in, which a bump must not rewrite.
    Rule(
        "unitycatalog-client",
        re.compile(rf"`unitycatalog-client`(?:\]\([^)]*\))?\s+{_V}"),
        skip="content/unitycatalog/reference/",
    ),
    Rule(
        "unitycatalog-ai",
        re.compile(rf"`unitycatalog-ai`(?:\]\([^)]*\))?\s+{_V}"),
        skip="content/unitycatalog/reference/",
    ),
    Rule("delta-spark", re.compile(rf"io\.delta:delta-spark_[\d.]+_[\d.]+:{_V}")),
    Rule("pyspark", re.compile(rf"\bpyspark=={_V}")),
    Rule("iceberg", re.compile(rf"apache-iceberg-{_V}")),
)

# A reader-facing install of a UC package must be exact: a range in an
# unquoted shell word is also a redirect (`pkg>=0.6.0` writes to `=0.6.0`).
_RANGE_RE = re.compile(r"\bunitycatalog-(?:client|ai)(?:\[[^\]]*\])?\s*(?:[<>~!]=?)")


def load(repo_root: Path) -> dict[str, str]:
    """``{"release": ..., <pin>: ...}``. Raises ``ValueError`` if malformed."""
    raw = yaml.safe_load((repo_root / MANIFEST).read_text()) or {}
    versions: dict[str, str] = {}
    for key, value in {
        "release": raw.get("release"),
        **(raw.get("pins") or {}),
    }.items():
        if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+", value):
            raise ValueError(f"{MANIFEST}: {key} must be an X.Y.Z version")
        versions[key] = value
    return versions


def _files(repo_root: Path):
    for rel, globs in _SCAN:
        base = repo_root / rel
        if not base.is_dir():
            continue
        for glob in globs:
            for path in sorted(base.rglob(glob)):
                if "node_modules" not in path.parts and path.is_file():
                    yield path


def _line(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _applies(rule: Rule, rel: str) -> bool:
    if rule.skip and rel.startswith(rule.skip):
        return False
    return not rule.files or rel in rule.files


def check(repo_root: Path) -> list[str]:
    """Pins that disagree with the manifest, and ranged UC installs in pages."""
    try:
        versions = load(repo_root)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        return [str(exc)]
    errors: list[str] = []
    for path in _files(repo_root):
        rel = path.relative_to(repo_root).as_posix()
        text = path.read_text()
        for rule in RULES:
            if not _applies(rule, rel):
                continue
            want = versions[rule.key]
            for m in rule.pattern.finditer(text):
                if m.group(1) != want:
                    errors.append(
                        f"{rel}:{_line(text, m.start())}: {m.group(0).strip()} "
                        f"should be {want} ({MANIFEST} {rule.key}); run `just bump-uc`"
                    )
        if path.name == "index.md":
            for m in _RANGE_RE.finditer(text):
                errors.append(
                    f"{rel}:{_line(text, m.start())}: pin {m.group(0).strip()}… "
                    "exactly (==), to the version CI tests"
                )
    return errors


def fix(repo_root: Path) -> list[Path]:
    """Rewrite every pin to the manifest; returns the files changed."""
    versions = load(repo_root)
    changed: list[Path] = []
    for path in _files(repo_root):
        rel = path.relative_to(repo_root).as_posix()
        text = path.read_text()
        new = text
        for rule in RULES:
            if not _applies(rule, rel):
                continue
            want = versions[rule.key]
            new = rule.pattern.sub(
                lambda m, want=want: (
                    m.group(0)[: m.start(1) - m.start()]
                    + want
                    + m.group(0)[m.end(1) - m.start() :]
                ),
                new,
            )
        if new != text:
            path.write_text(new)
            changed.append(path)
    return changed


def bump(repo_root: Path, release: str) -> list[Path]:
    """Move the manifest to ``release`` (and every pin that tracked the old
    release, such as the Python client), then rewrite the pins."""
    if not re.fullmatch(r"\d+\.\d+\.\d+", release):
        raise ValueError(f"release must be X.Y.Z, got {release!r}")
    path = repo_root / MANIFEST
    old = load(repo_root)["release"]
    text = re.sub(
        rf"^(\s*[\w-]+:\s*){re.escape(old)}\s*$",
        lambda m: f"{m.group(1)}{release}",
        path.read_text(),
        flags=re.MULTILINE,
    )
    path.write_text(text)
    return [path, *fix(repo_root)]


# --- prose ---------------------------------------------------------------

# Reference pages (features and limitations, clients and engines) are
# version-specific by nature.
_PROSE_BUCKETS = {"tutorials", "how-to", "explanation"}
_FENCE_RE = re.compile(
    r"^[ \t]*(`{3,}|~{3,})[^\n]*\n.*?^[ \t]*\1", re.MULTILINE | re.DOTALL
)
_CODE = "\x00"
# Wording that makes a version a boundary rather than a scope.
_BEFORE = re.compile(
    r"(?:since|before|fixed in|deprecated (?:in|since)|requires|from)\s+"
    r"(?:Unity Catalog\s+(?:OSS\s+)?|release\s+|version\s+)?$",
    re.IGNORECASE,
)
_AFTER = re.compile(r"^\s*(?:or later|or newer|and later|or earlier)", re.IGNORECASE)


def _prose_lines(text: str):
    """(line number, prose) for a page, with code, tables, and URLs masked.
    Of the frontmatter only ``summary:`` is prose."""
    text = _FENCE_RE.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    lines = text.splitlines()
    end = 0
    if lines and lines[0].strip() == "---":
        end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), 0)
    for i, line in enumerate(lines):
        if i <= end and end and not line.startswith("summary:"):
            continue
        if line.lstrip().startswith("|"):
            continue
        line = re.sub(r"`[^`]*`", _CODE, line)
        line = re.sub(r"\]\([^)]*\)", "]", line)
        yield i + 1, line


def prose_warnings(repo_root: Path) -> list[str]:
    """Prose that names the release without boundary wording ("In 0.6.0 the
    server…"). A client version after its package name is allowed."""
    try:
        release = load(repo_root)["release"]
    except (OSError, ValueError, yaml.YAMLError):
        return []  # reported by check()
    number = re.compile(rf"(?<![\w.]){re.escape(release)}(?!\w|\.\d)")
    root = repo_root / "content" / "unitycatalog"
    warnings: list[str] = []
    for md in sorted(root.rglob("index.md")):
        if md.relative_to(root).parts[0] not in _PROSE_BUCKETS:
            continue
        prev = ""
        for n, line in _prose_lines(md.read_text()):
            for m in number.finditer(line):
                before, after = line[: m.start()], line[m.end() :]
                if not before.strip():  # wrapped: "`unitycatalog-client`\n  0.6.0"
                    before = prev
                if _BEFORE.search(before) or _AFTER.match(after):
                    continue
                if before.rstrip().removesuffix("]").endswith(_CODE):
                    continue  # a package's version: "`unitycatalog-client` 0.6.0"
                warnings.append(
                    f"{md.relative_to(repo_root)}:{n}: names release {release}; "
                    "state the behavior without it, or as a boundary (since, or later)"
                )
            prev = line
    return warnings
