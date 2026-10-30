"""Keep each project's docs on one release: ``content/<project>/release.yml``.

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

_V = r"(\d+\.\d+\.\d+)"


@dataclasses.dataclass(frozen=True)
class Rule:
    key: str  # "release" or a key under `pins:`
    pattern: re.Pattern[str]  # group 1 is the version
    files: tuple[str, ...] = ()  # limit to these repo-relative paths
    skip: str | None = None  # repo-relative prefix the rule doesn't apply under
    # Check a match against `<key>-<major.minor>` when the manifest has one, so
    # a second Spark line can carry its own pins beside the default. The line
    # is the pattern's `line` group, else the found version's major.minor.
    per_line: bool = False

    def version_group(self) -> int:
        return self.pattern.groupindex.get("v", 1)

    def key_for(self, m: re.Match[str], versions: dict[str, str]) -> str:
        if not self.per_line:
            return self.key
        if "line" in self.pattern.groupindex:
            line = m.group("line")
        else:
            line = m.group(self.version_group()).rsplit(".", 1)[0]
        return k if (k := f"{self.key}-{line}") in versions else self.key


@dataclasses.dataclass(frozen=True)
class Project:
    name: str  # the content/<name> folder
    product: str  # regex for the product name, as boundary prose spells it
    scan: tuple[tuple[str, tuple[str, ...]], ...]  # (repo-relative dir, globs)
    rules: tuple[Rule, ...]
    # A reader-facing install must be exact: a range in an unquoted shell word
    # is also a redirect (`pkg>=0.6.0` writes to `=0.6.0`).
    ranged_install: re.Pattern[str]
    bump: str  # the recipe that moves the release

    @property
    def manifest(self) -> Path:
        return Path("content") / self.name / "release.yml"


def _prose_pin(key: str, package: str, project: str) -> Rule:
    """A prerequisite's "`<package>` 1.2.3". Reference tables name the versions
    a defect was verified in, which a bump must not rewrite."""
    return Rule(
        key,
        re.compile(rf"`{re.escape(package)}`(?:\]\([^)]*\))?\s+{_V}"),
        skip=f"content/{project}/reference/",
    )


_MLFLOW_PIN = re.compile(rf"\bmlflow(?:\[[^\]]*\])?=={_V}")

# Blogs are dated narrative and keep the versions they were written against.
UNITYCATALOG = Project(
    name="unitycatalog",
    product=r"Unity Catalog\s+(?:OSS\s+)?",
    scan=(
        ("content/unitycatalog", ("*.md", "*.py", "*.sh", "*.yaml", "*.java")),
        ("envs", ("*.yaml", "*.yml", "*.md", "*.py", "*.toml", "Dockerfile")),
        ("emit/docs/sites", ("unitycatalog-docs.mjs",)),
    ),
    rules=(
        Rule("release", re.compile(rf"unitycatalog/unitycatalog:v{_V}")),
        # The tag a generated environment gives its locally built image.
        Rule("release", re.compile(rf"\buc-docs-unitycatalog:{_V}")),
        Rule("release", re.compile(rf"unitycatalog/unitycatalog/(?:blob|tree)/v{_V}")),
        Rule(
            "release",
            re.compile(
                rf"io\.unitycatalog:unitycatalog-(?:spark_[\d.]+_[\d.]+|client|server):{_V}"
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
        _prose_pin("unitycatalog-client", "unitycatalog-client", "unitycatalog"),
        _prose_pin("unitycatalog-ai", "unitycatalog-ai", "unitycatalog"),
        # Clients and `pip_requirements`, with or without extras.
        Rule("mlflow", _MLFLOW_PIN),
        # The tracking server image in env.toml and the rendered compose files.
        Rule("mlflow", re.compile(rf"ghcr\.io/mlflow/mlflow:v{_V}(?:-full)?\b")),
        Rule("scikit-learn", re.compile(rf"\bscikit-learn=={_V}")),
        Rule("duckdb", re.compile(rf"\bduckdb=={_V}")),
        _prose_pin("duckdb", "duckdb", "unitycatalog"),
        Rule(
            "delta-spark",
            re.compile(
                r"io\.delta:delta-spark_(?P<line>\d+\.\d+)_[\d.]+:(?P<v>\d+\.\d+\.\d+)"
            ),
            per_line=True,
        ),
        Rule("pyspark", re.compile(rf"\bpyspark=={_V}"), per_line=True),
        Rule("iceberg", re.compile(rf"apache-iceberg-{_V}")),
        Rule(
            "iceberg",
            re.compile(
                rf"org\.apache\.iceberg:iceberg-(?:spark-runtime-[\d.]+_[\d.]+|aws-bundle):{_V}"
            ),
        ),
    ),
    ranged_install=re.compile(
        r"\b(?:unitycatalog-(?:client|ai)|mlflow|scikit-learn|duckdb)(?:\[[^\]]*\])?\s*(?:[<>~!]=?)"
    ),
    bump="just bump-uc",
)

# The release is Delta Spark's; deltalake and DuckDB version independently.
DELTA = Project(
    name="delta",
    product=r"Delta(?:\s+Lake|\s+Spark)?\s+",
    scan=(
        (
            "content/delta",
            ("*.md", "*.py", "*.sh", "*.sql", "*.yaml", "*.sc", "*.scala", "*.java")
            + ("*.rs",),
        ),
        ("content/_rust", ("Cargo.toml",)),
    ),
    rules=(
        # Unsuffixed artifacts target the release's default Spark version.
        Rule("release", re.compile(rf"io\.delta:delta-spark_2\.13:{_V}")),
        Rule("release", re.compile(rf"\bdelta-spark=={_V}")),
        Rule("release", re.compile(rf"io\.delta::delta-spark:{_V}")),
        Rule("release", re.compile(rf"delta-io/delta/(?:blob|tree)/v{_V}")),
        _prose_pin("release", "delta-spark", "delta"),
        Rule("pyspark", re.compile(rf"\bpyspark=={_V}")),
        # The Spark release the JVM examples compile against.
        Rule("pyspark", re.compile(rf"org\.apache\.spark::?spark-sql(?:_2\.13)?:{_V}")),
        _prose_pin("pyspark", "pyspark", "delta"),
        Rule("deltalake", re.compile(rf"\bdeltalake(?:\[[^\]]*\])?=={_V}")),
        Rule("deltalake", re.compile(rf"delta-rs/(?:blob|tree)/python-v{_V}")),
        _prose_pin("deltalake", "deltalake", "delta"),
        # The deltalake crate versions apart from the Python package.
        Rule("deltalake-rs", re.compile(rf"\bdeltalake@{_V}")),
        Rule("deltalake-rs", re.compile(rf"delta-rs/(?:blob|tree)/rust-v{_V}")),
        Rule("deltalake-rs", re.compile(rf'^deltalake = \{{ version = "={_V}"', re.M)),
        Rule("duckdb", re.compile(rf"\bduckdb=={_V}")),
        _prose_pin("duckdb", "duckdb", "delta"),
    ),
    ranged_install=re.compile(
        r"\b(?:delta-spark|pyspark|deltalake|duckdb)(?:\[[^\]]*\])?\s*(?:[<>~!]=?)"
    ),
    bump="just bump-delta",
)

PROJECTS = (UNITYCATALOG, DELTA)


def load(repo_root: Path, project: Project = UNITYCATALOG) -> dict[str, str]:
    """``{"release": ..., <pin>: ...}``. Raises ``ValueError`` if malformed."""
    raw = yaml.safe_load((repo_root / project.manifest).read_text()) or {}
    versions: dict[str, str] = {}
    for key, value in {
        "release": raw.get("release"),
        **(raw.get("pins") or {}),
    }.items():
        if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+", value):
            raise ValueError(f"{project.manifest}: {key} must be an X.Y.Z version")
        versions[key] = value
    return versions


def _active(repo_root: Path) -> list[Project]:
    """Projects with a content folder. Their manifest is then required."""
    return [p for p in PROJECTS if (repo_root / "content" / p.name).is_dir()]


def _files(repo_root: Path, project: Project):
    for rel, globs in project.scan:
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


def matches(repo_root: Path, project: Project, key: str) -> list[str]:
    """Repo-relative files holding a pin that ``key`` of ``project`` moves."""
    versions = load(repo_root, project)
    found = []
    for path in _files(repo_root, project):
        rel = path.relative_to(repo_root).as_posix()
        text = path.read_text()
        if any(
            rule.key_for(m, versions) == key
            for rule in project.rules
            if _applies(rule, rel)
            for m in rule.pattern.finditer(text)
        ):
            found.append(rel)
    return found


def check(repo_root: Path) -> list[str]:
    """Pins that disagree with their manifest, and ranged installs in pages."""
    errors: list[str] = []
    for project in _active(repo_root):
        try:
            versions = load(repo_root, project)
        except (OSError, ValueError, yaml.YAMLError) as exc:
            errors.append(str(exc))
            continue
        for path in _files(repo_root, project):
            rel = path.relative_to(repo_root).as_posix()
            text = path.read_text()
            for rule in project.rules:
                if not _applies(rule, rel):
                    continue
                g = rule.version_group()
                for m in rule.pattern.finditer(text):
                    key = rule.key_for(m, versions)
                    want = versions[key]
                    if m.group(g) != want:
                        errors.append(
                            f"{rel}:{_line(text, m.start())}: {m.group(0).strip()} "
                            f"should be {want} ({project.manifest} {key}); "
                            f"run `{project.bump}`"
                        )
            if path.suffix == ".md":
                for m in project.ranged_install.finditer(text):
                    errors.append(
                        f"{rel}:{_line(text, m.start())}: pin {m.group(0).strip()}… "
                        "exactly (==), to the version CI tests"
                    )
    return errors


def fix(repo_root: Path) -> list[Path]:
    """Rewrite every pin to its manifest; returns the files changed."""
    changed: list[Path] = []
    for project in _active(repo_root):
        versions = load(repo_root, project)
        for path in _files(repo_root, project):
            rel = path.relative_to(repo_root).as_posix()
            text = path.read_text()
            new = text
            for rule in project.rules:
                if not _applies(rule, rel):
                    continue
                g = rule.version_group()
                new = rule.pattern.sub(
                    lambda m, rule=rule, g=g, versions=versions: (
                        m.group(0)[: m.start(g) - m.start()]
                        + versions[rule.key_for(m, versions)]
                        + m.group(0)[m.end(g) - m.start() :]
                    ),
                    new,
                )
            if new != text:
                path.write_text(new)
                changed.append(path)
    return changed


def bump(repo_root: Path, release: str, project: Project = UNITYCATALOG) -> list[Path]:
    """Move the manifest to ``release`` (and every pin that tracked the old
    release, such as the Python client), then rewrite the pins."""
    if not re.fullmatch(r"\d+\.\d+\.\d+", release):
        raise ValueError(f"release must be X.Y.Z, got {release!r}")
    path = repo_root / project.manifest
    old = load(repo_root, project)["release"]
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


def _before(project: Project) -> re.Pattern[str]:
    """Wording that makes a version a boundary rather than a scope."""
    return re.compile(
        r"(?:since|before|fixed in|deprecated (?:in|since)|requires|from)\s+"
        rf"(?:{project.product}|release\s+|version\s+)?$",
        re.IGNORECASE,
    )


_AFTER = re.compile(r"^\s*(?:or later|or newer|and later|or earlier)", re.IGNORECASE)


def prose_lines(text: str):
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
    warnings: list[str] = []
    for project in _active(repo_root):
        try:
            release = load(repo_root, project)["release"]
        except (OSError, ValueError, yaml.YAMLError):
            continue  # reported by check()
        warnings += _project_prose_warnings(repo_root, project, release)
    return warnings


def _project_prose_warnings(
    repo_root: Path, project: Project, release: str
) -> list[str]:
    number = re.compile(rf"(?<![\w.]){re.escape(release)}(?!\w|\.\d)")
    before_re = _before(project)
    root = repo_root / "content" / project.name
    warnings: list[str] = []
    for md in sorted(root.rglob("*.md")):
        if md.relative_to(root).parts[0] not in _PROSE_BUCKETS:
            continue
        prev = ""
        for n, line in prose_lines(md.read_text()):
            for m in number.finditer(line):
                before, after = line[: m.start()], line[m.end() :]
                if not before.strip():  # wrapped: "`unitycatalog-client`\n  0.6.0"
                    before = prev
                if before_re.search(before) or _AFTER.match(after):
                    continue
                if before.rstrip().removesuffix("]").endswith(_CODE):
                    continue  # a package's version: "`unitycatalog-client` 0.6.0"
                warnings.append(
                    f"{md.relative_to(repo_root)}:{n}: names release {release}; "
                    "state the behavior without it, or as a boundary (since, or later)"
                )
            prev = line
    return warnings
