"""Discover and parse PEP 723 inline metadata on colocated tutorial scripts.

A *tutorial* (unlike a how-to) colocates its runnable code next to its prose:
``content/<project>/tutorials/<slug>/index.md`` sits beside ``*.py`` scripts the
page inlines via ``file=./…`` fences. Each such script is **self-describing** —
it carries a PEP 723 ``# /// script`` block declaring both its dependencies
(so ``uv run script.py`` resolves them standalone) and, in a ``[tool.docs-factory]``
table, its *runtime* prerequisites (which docker-compose file the test harness
must start, and the env var to hand the script the server URL).

The script is therefore the single source of truth for how to run and test it,
and this module is the one place that discovers and parses it. Both the pytest
conftest (to drive the tests) and ``docsnip check`` (to validate) read scripts
through here, so the two can never disagree about what a script needs.

Parsing uses only the standard library: the PEP 723 reference regex plus
``tomllib`` (stdlib on 3.11+). No third-party parser.

JVM scripts (Scala run by scala-cli, Java run by JBang) declare their
dependencies the way those tools read them (``//> using dep`` and ``//DEPS``),
and carry the same ``[tool.docs-factory]`` keys in a ``// /// docs-factory``
comment block. They always run in the ``jvm`` lane.

Rust scripts (``*.rs``) carry the same block, but their dependencies live in the
snippets crate (``content/_rust/Cargo.toml``), which builds each script as one
``[[example]]``: the crate's dependencies compile once for every script. They
run in the ``rust`` lane.
"""

from __future__ import annotations

import dataclasses
import re
import tomllib
from pathlib import Path

# The PEP 723 reference reader (verbatim from the spec). Matches a metadata
# block whose type is ``script``; the block body is comment lines between
# ``# /// script`` and ``# ///``.
_BLOCK_RE = r"(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$"

# The namespaced table our tooling owns inside a script's PEP 723 metadata.
TOOL_TABLE = "docs-factory"

# A JVM script's metadata: the [tool.docs-factory] keys as `//` comment lines.
_JVM_BLOCK_RE = r"(?m)^// /// docs-factory$\s(?P<content>(^//(| .*)$\s)*)^// ///$"
_JVM_BLOCK_OPEN = "// /// docs-factory"


@dataclasses.dataclass(frozen=True)
class Runner:
    """How a script of one kind declares its dependencies and runs."""

    name: str
    suffixes: tuple[str, ...]
    # Every script of this runner runs in this lane; None leaves it to the script.
    lane: str | None = None
    # Captures one dependency directive's coordinates (JVM runners).
    deps_re: re.Pattern[str] | None = None


RUNNERS = (
    Runner("python", (".py",)),
    Runner(
        "scala",
        (".sc", ".scala"),
        lane="jvm",
        deps_re=re.compile(r"^//> using deps? (?P<deps>.+)$", re.MULTILINE),
    ),
    Runner(
        "java",
        (".java",),
        lane="jvm",
        deps_re=re.compile(r"^//DEPS (?P<deps>.+)$", re.MULTILINE),
    ),
    Runner("rust", (".rs",), lane="rust"),
)
_RUNNER_BY_SUFFIX = {suffix: r for r in RUNNERS for suffix in r.suffixes}


# The lanes a runner implies, and whose scripts they hold.
_RUNNER_LANES = {"jvm": "Scala and Java scripts", "rust": "Rust scripts"}


def runner_for(path: Path) -> Runner | None:
    return _RUNNER_BY_SUFFIX.get(path.suffix)


# A script importing docsnip.shellregions or docsnip.sqlregions is a harness
# driving a shell or SQL snippet.
_HARNESS_RE = re.compile(
    r"^\s*(?:from\s+docsnip\.(shell|sql)regions\s+import"
    r"|import\s+docsnip\.(shell|sql)regions)\b",
    re.MULTILINE,
)

# The snippet kinds a harness may publish in its place.
_VERIFIABLE = (".sh", ".sql")

# Opt-in test lanes beyond the default (no services, no JVM) one: `spark` for
# Python scripts that start Spark, `jvm` for Scala and Java scripts, `rust` for
# the snippets crate's examples.
LANES = ("spark", "jvm", "rust")

# A dependency that starts a JVM, so its script belongs in the spark lane.
_SPARK_DEP_RE = re.compile(r"^\s*(?:pyspark|delta-spark)\b")


class ScriptMetaError(Exception):
    """Raised when a script's inline metadata is malformed or contradictory."""


# The fields of one ``claims.<interface>`` entry.
_CLAIM_KEYS = frozenset({"journey", "region", "anchor", "fails", "note", "api"})


@dataclasses.dataclass(frozen=True)
class Claim:
    """One ``claims.<interface>`` entry: what the script proves about an interface.

    ``interface`` is an estate-wide interface key (``architecture/journeys/
    interfaces.yml``); the claim counts in every project that lists it and
    shows the journey. A claim says ``journey`` works and
    names the ``region`` a page shows doing it, or, with ``fails`` (``True`` or
    the error text the script asserts), that it doesn't. ``anchor`` overrides the
    heading the matrix links to; ``note`` qualifies the cell, as in "on local
    storage"; ``api`` is the call the reader writes, as in ``INSERT INTO``.
    """

    interface: str
    journey: str
    region: str | None = None
    anchor: str | None = None
    fails: bool | str = False
    note: str | None = None
    api: str | None = None

    @property
    def works(self) -> bool:
        return self.fails is False


def _parse_claims(path: Path, raw: object) -> list[Claim]:
    where = f"{path}: [tool.docs-factory].claims"
    if raw is None:
        return []
    if not isinstance(raw, dict):
        raise ScriptMetaError(f"{where} must be a table of <interface> = [claims]")
    claims: list[Claim] = []
    for interface, entries in raw.items():
        if not isinstance(entries, list):
            raise ScriptMetaError(f"{where}.{interface} must be an array of tables")
        for entry in entries:
            if not isinstance(entry, dict):
                raise ScriptMetaError(f"{where}.{interface}: each claim is a table")
            unknown = sorted(set(entry) - _CLAIM_KEYS)
            if unknown:
                raise ScriptMetaError(
                    f"{where}.{interface}: unknown key(s) {', '.join(unknown)}"
                )
            journey = entry.get("journey")
            if not isinstance(journey, str) or not journey:
                raise ScriptMetaError(
                    f"{where}.{interface}: every claim names a journey"
                )
            text: dict[str, str | None] = {}
            for key in ("region", "anchor", "note", "api"):
                value = entry.get(key)
                if value is not None and not isinstance(value, str):
                    raise ScriptMetaError(
                        f"{where}.{interface}: {journey}: {key} must be a string"
                    )
                text[key] = value
            fails = entry.get("fails", False)
            if not isinstance(fails, bool | str) or fails == "":
                raise ScriptMetaError(
                    f"{where}.{interface}: {journey}: fails is true or the asserted "
                    "error"
                )
            if fails is False and text["region"] is None:
                raise ScriptMetaError(
                    f"{where}.{interface}: {journey}: a claim that it works names "
                    "the region that shows it"
                )
            claims.append(
                Claim(
                    interface=str(interface),
                    journey=journey,
                    region=text["region"],
                    anchor=text["anchor"],
                    fails=fails,
                    note=text["note"],
                    api=text["api"],
                )
            )
    return claims


@dataclasses.dataclass
class DocsFactoryMeta:
    """The ``[tool.docs-factory]`` runtime contract parsed from a script.

    ``compose`` is a path *relative to the script's own directory* (so it stays
    valid when the tutorial folder moves); ``None`` means the script needs no
    services and runs in the default (no-Docker) test lane. ``services`` names
    the compose services to wait on. ``base_url_env`` is the environment
    variable the harness sets to the started server's base URL — the script
    reads it, so the same code a reader runs is what the test exercises.
    ``env`` is extra environment the harness sets for the run, e.g. the
    ``AWS_ENDPOINT_URL`` that points host-side clients at a simulated S3
    while the snippet code stays endpoint-free. ``verifies`` (relative to the
    script's directory) marks the script as a test harness for a non-Python
    snippet the page actually shows, e.g. a ``*_cli.py`` driving ``foo.sh`` or
    ``foo.sql``: the published runnable example is that file, not the harness.
    ``lane`` puts the script in an opt-in test lane: ``"spark"`` for one that
    needs Java and Maven (PySpark, or the ``spark-sql`` shell), ``"jvm"`` for
    every Scala and Java script.
    ``timeout`` (seconds) replaces the harness's default per-run limit, and
    ``retries`` re-runs a script that hit it, each time on a fresh stack. Only
    a timeout is retried: a script that exits non-zero fails at once.
    ``claims`` feed the compatibility matrices (see :class:`Claim`).
    """

    compose: str | None = None
    services: list[str] = dataclasses.field(default_factory=list)
    base_url_env: str | None = None
    env: dict[str, str] = dataclasses.field(default_factory=dict)
    verifies: str | None = None
    claims: list[Claim] = dataclasses.field(default_factory=list)
    lane: str | None = None
    timeout: int | None = None
    retries: int = 0

    @property
    def needs_services(self) -> bool:
        return self.compose is not None


@dataclasses.dataclass
class ScriptMeta:
    """One discovered ``# /// script`` tutorial script and its parsed metadata."""

    path: Path
    requires_python: str | None
    # PEP 723 requirements, Maven coordinates for a JVM script, or `cargo add`
    # arguments (`deltalake@1.1.1 --features datafusion`) for a Rust one.
    dependencies: list[str]
    docs_factory: DocsFactoryMeta
    runner: str = "python"
    # The snippets crate's `[[example]]` that builds a Rust script.
    cargo_example: str | None = None

    def compose_path(self) -> Path | None:
        """Absolute path to the compose file this script declares, if any."""
        if self.docs_factory.compose is None:
            return None
        return (self.path.parent / self.docs_factory.compose).resolve()

    def verifies_path(self) -> Path | None:
        """Absolute path to the snippet this harness verifies, if any."""
        if self.docs_factory.verifies is None:
            return None
        return (self.path.parent / self.docs_factory.verifies).resolve()

    def owning_page(self) -> Path | None:
        """The page this script belongs to: the nearest ``index.md`` above it.

        ``<slug>/snippets/x.py`` and ``<slug>/x.py`` both belong to
        ``<slug>/index.md``. The search stops at the ``content/`` root.
        """
        for parent in self.path.resolve().parents:
            if parent.name == "content":
                return None
            for name in ("index.md", "index.mdx"):
                if (parent / name).is_file():
                    return parent / name
        return None


def without_metadata(text: str) -> str:
    """The script's text without its ``# /// script`` or docs-factory block."""
    return re.sub(_JVM_BLOCK_RE, "", re.sub(_BLOCK_RE, "", text))


def metadata_spans(text: str) -> list[tuple[int, int]]:
    """Character spans of the factory metadata blocks in a script's text."""
    spans = [
        m.span()
        for pattern in (_BLOCK_RE, _JVM_BLOCK_RE)
        for m in re.finditer(pattern, text)
    ]
    return sorted(spans)


def _read_block(text: str) -> dict | None:
    """Return the parsed PEP 723 ``script`` metadata dict, or ``None`` if absent.

    Raises:
        ScriptMetaError: if more than one ``script`` block is present.
    """
    matches = [m for m in re.finditer(_BLOCK_RE, text) if m.group("type") == "script"]
    if len(matches) > 1:
        raise ScriptMetaError("multiple '# /// script' blocks found")
    if not matches:
        return None
    # Strip the leading "# " (or bare "#") from each comment line, per the spec.
    content = "".join(
        line[2:] if line.startswith("# ") else line[1:]
        for line in matches[0].group("content").splitlines(keepends=True)
    )
    return tomllib.loads(content)


# The crate that builds every Rust script, relative to the content root.
SNIPPETS_CRATE = Path("_rust") / "Cargo.toml"


@dataclasses.dataclass(frozen=True)
class _Crate:
    examples: dict[Path, str]  # script path → example name
    dependencies: list[str]


def _crate_for(path: Path) -> _Crate | None:
    for parent in path.resolve().parents:
        if parent.name == "content":
            manifest = parent / SNIPPETS_CRATE
            return _load_crate(manifest) if manifest.is_file() else None
    return None


def _load_crate(manifest: Path) -> _Crate:
    raw = tomllib.loads(manifest.read_text())
    examples = {
        (manifest.parent / e["path"]).resolve(): e["name"]
        for e in raw.get("example", [])
    }
    deps = []
    for name, spec in (raw.get("dependencies") or {}).items():
        spec = {"version": spec} if isinstance(spec, str) else spec
        arg = f"{name}@{str(spec.get('version', '')).lstrip('=')}".rstrip("@")
        if spec.get("features"):
            arg += f" --features {','.join(spec['features'])}"
        deps.append(arg)
    return _Crate(examples=examples, dependencies=deps)


def _read_jvm_block(text: str) -> dict | None:
    matches = list(re.finditer(_JVM_BLOCK_RE, text))
    if len(matches) > 1:
        raise ScriptMetaError(f"multiple '{_JVM_BLOCK_OPEN}' blocks found")
    if not matches:
        return None
    content = "".join(
        line[3:] if line.startswith("// ") else line[2:]
        for line in matches[0].group("content").splitlines(keepends=True)
    )
    return tomllib.loads(content)


def parse_script(path: Path) -> ScriptMeta | None:
    """Parse one script's inline metadata, or ``None`` if it has no block.

    Raises:
        ScriptMetaError: on a malformed block or a bad ``[tool.docs-factory]``
            table (e.g. ``services`` present without ``compose``).
    """
    runner = runner_for(path)
    if runner is None:
        return None
    text = path.read_text()
    if runner.name == "python":
        block = _read_block(text)
        if block is None:
            return None
        tool = (block.get("tool") or {}).get(TOOL_TABLE, {}) or {}
        dependencies = list(block.get("dependencies", []) or [])
    else:
        try:
            tool = _read_jvm_block(text)
        except tomllib.TOMLDecodeError as exc:
            raise ScriptMetaError(f"{path}: {_JVM_BLOCK_OPEN}: {exc}") from None
        if tool is None:
            return None
        block = {}
        if runner.name == "rust":
            crate = _crate_for(path)
            dependencies = crate.dependencies if crate else []
        else:
            assert runner.deps_re is not None
            dependencies = [
                dep
                for m in runner.deps_re.finditer(text)
                for dep in re.split(r"[\s,]+", m.group("deps").strip())
                if dep
            ]
    compose = tool.get("compose")
    services = tool.get("services", []) or []
    base_url_env = tool.get("base-url-env")
    env = tool.get("env", {}) or {}
    verifies = tool.get("verifies")
    lane = tool.get("lane")
    timeout = tool.get("timeout")
    retries = tool.get("retries", 0)

    if compose is not None and not isinstance(compose, str):
        raise ScriptMetaError(f"{path}: [tool.docs-factory].compose must be a string")
    if services and compose is None:
        raise ScriptMetaError(
            f"{path}: [tool.docs-factory].services set without a compose file"
        )
    if base_url_env is not None and not isinstance(base_url_env, str):
        raise ScriptMetaError(
            f"{path}: [tool.docs-factory].base-url-env must be a string"
        )
    if not isinstance(env, dict) or not all(isinstance(v, str) for v in env.values()):
        raise ScriptMetaError(
            f"{path}: [tool.docs-factory].env must be a table of strings"
        )
    if verifies is not None and not isinstance(verifies, str):
        raise ScriptMetaError(f"{path}: [tool.docs-factory].verifies must be a string")
    if lane is not None and lane not in LANES:
        raise ScriptMetaError(
            f"{path}: [tool.docs-factory].lane must be one of {', '.join(LANES)}"
        )
    # bool is an int subclass; `timeout = true` is a typo, not one second.
    if timeout is not None and (
        not isinstance(timeout, int) or isinstance(timeout, bool) or timeout <= 0
    ):
        raise ScriptMetaError(
            f"{path}: [tool.docs-factory].timeout must be a positive number of seconds"
        )
    if not isinstance(retries, int) or isinstance(retries, bool) or retries < 0:
        raise ScriptMetaError(
            f"{path}: [tool.docs-factory].retries must be a non-negative integer"
        )
    if runner.lane is not None:
        if lane not in (None, runner.lane):
            raise ScriptMetaError(
                f"{path}: a {runner.name} script always runs in the {runner.lane} "
                f"lane, not {lane}"
            )
        lane = runner.lane
    elif lane in _RUNNER_LANES:
        raise ScriptMetaError(f"{path}: the {lane} lane is for {_RUNNER_LANES[lane]}")
    crate = _crate_for(path) if runner.name == "rust" else None

    return ScriptMeta(
        path=path,
        requires_python=block.get("requires-python"),
        dependencies=dependencies,
        docs_factory=DocsFactoryMeta(
            compose=compose,
            services=list(services),
            base_url_env=base_url_env,
            env=dict(env),
            verifies=verifies,
            claims=_parse_claims(path, tool.get("claims")),
            lane=lane,
            timeout=timeout,
            retries=retries,
        ),
        runner=runner.name,
        cargo_example=crate.examples.get(path.resolve()) if crate else None,
    )


def has_script_block(path: Path) -> bool:
    """Cheap check: does this file carry its runner's metadata header?"""
    runner = runner_for(path)
    if runner is None:
        return False
    # The block must appear before any code; reading the whole file is fine for
    # the small tutorial scripts we scan.
    opener = "# /// script" if runner.name == "python" else _JVM_BLOCK_OPEN
    return opener in path.read_text()


def _candidates(content_root: Path) -> list[Path]:
    # Hidden folders hold tool output, such as scala-cli's generated `.scala-build/`.
    return sorted(
        path
        for suffix in _RUNNER_BY_SUFFIX
        for path in content_root.rglob(f"*{suffix}")
        if not any(
            part.startswith(".") for part in path.relative_to(content_root).parts
        )
        and has_script_block(path)
    )


def discover(content_root: Path) -> list[ScriptMeta]:
    """Every ``# /// script`` tutorial script under ``content_root``, sorted by path.

    This is the authoritative list of runnable tutorial scripts and their
    runtime prerequisites — independent of any shared environment or the
    markdown frontmatter. Raises :class:`ScriptMetaError` on the first
    malformed script so ``docsnip check`` surfaces it.
    """
    scripts: list[ScriptMeta] = []
    for path in _candidates(content_root):
        meta = parse_script(path)
        if meta is not None:
            scripts.append(meta)
    return scripts


def _fence_sources(content_root: Path) -> set[Path]:
    """Every file a content page's ``file=`` fence references, resolved."""
    from .frontmatter import iter_content_files
    from .snippetcheck import iter_fences

    return {
        (md_path.parent / fence.file).resolve()
        for md_path in iter_content_files(content_root)
        for fence in iter_fences(md_path)
    }


def check(content_root: Path) -> list[str]:
    """Validate discovered tutorial scripts; return a list of human-readable errors.

    Asserts each script parses, that every declared ``compose`` file exists on
    disk, and that a ``verifies`` target exists and is quoted by some page fence
    (otherwise the published example would be a file no reader sees). A script
    that drives a shell or SQL snippet through ``docsnip.shellregions`` or
    ``docsnip.sqlregions`` must declare ``verifies``, or the site publishes the
    harness instead of the snippet. Malformed
    metadata is turned into an error string rather than a raised exception so it
    aggregates with the rest of ``docsnip check``.
    """
    errors: list[str] = []
    fence_sources: set[Path] | None = None
    for path in _candidates(content_root):
        try:
            meta = parse_script(path)
        except ScriptMetaError as exc:
            errors.append(str(exc))
            continue
        if meta is None:
            continue
        if meta.runner == "rust" and meta.cargo_example is None:
            rel = path.resolve().relative_to(content_root.resolve())
            errors.append(
                f"{path}: no [[example]] in content/{SNIPPETS_CRATE.as_posix()} builds it; "
                f'add one with path = "../{rel.as_posix()}"'
            )
        # A service-lane script already runs where CI has Java and Docker.
        default_lane = (
            meta.docs_factory.lane is None and not meta.docs_factory.needs_services
        )
        if default_lane and any(_SPARK_DEP_RE.match(dep) for dep in meta.dependencies):
            errors.append(
                f"{path}: depends on Spark but [tool.docs-factory] has no "
                'lane = "spark", so the default lane would need Java'
            )
        compose = meta.compose_path()
        if compose is not None and not compose.is_file():
            errors.append(
                f"{path}: [tool.docs-factory].compose points at a missing file: "
                f"{meta.docs_factory.compose}"
            )
        verified = meta.verifies_path()
        if verified is None:
            if harness := _HARNESS_RE.search(path.read_text()):
                kind = harness.group(1) or harness.group(2)
                ext = "sh" if kind == "shell" else "sql"
                errors.append(
                    f"{path}: drives a {kind} snippet via docsnip.{kind}regions but "
                    f'[tool.docs-factory] has no verifies = "<name>.{ext}"'
                )
            continue
        if not verified.is_file():
            errors.append(
                f"{path}: [tool.docs-factory].verifies points at a missing file: "
                f"{meta.docs_factory.verifies}"
            )
            continue
        if verified.suffix not in _VERIFIABLE:
            # The site publishes the target with run instructions for its kind.
            errors.append(
                f"{path}: [tool.docs-factory].verifies must name a .sh or .sql "
                f"snippet: {meta.docs_factory.verifies}"
            )
            continue
        if fence_sources is None:
            fence_sources = _fence_sources(content_root)
        if verified not in fence_sources:
            errors.append(
                f"{path}: [tool.docs-factory].verifies target is not referenced by "
                f"any page's file= fence: {meta.docs_factory.verifies}"
            )
    return errors
