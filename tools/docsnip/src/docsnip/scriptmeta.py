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

# A script importing docsnip.shellregions is a harness driving a shell snippet.
_SHELL_HARNESS_RE = re.compile(
    r"^\s*(?:from\s+docsnip\.shellregions\s+import|import\s+docsnip\.shellregions)\b",
    re.MULTILINE,
)


class ScriptMetaError(Exception):
    """Raised when a script's inline metadata is malformed or contradictory."""


# The fields of one ``claims.<interface>`` entry.
_CLAIM_KEYS = frozenset({"op", "region", "anchor", "fails", "note"})


@dataclasses.dataclass(frozen=True)
class Claim:
    """One ``claims.<interface>`` entry: what the script proves about an interface.

    ``interface`` is a column of a compatibility matrix (``content/<project>/
    compatibility.yml``), as written: bare for the script's own project, or
    ``<project>:<interface>`` for another's. A claim says ``op`` works and names
    the ``region`` a page shows doing it, or, with ``fails`` (``True`` or the
    error text the script asserts), that it doesn't. ``anchor`` overrides the
    heading the matrix links to; ``note`` qualifies the cell, as in "on local
    storage".
    """

    interface: str
    op: str
    region: str | None = None
    anchor: str | None = None
    fails: bool | str = False
    note: str | None = None

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
            op = entry.get("op")
            if not isinstance(op, str) or not op:
                raise ScriptMetaError(f"{where}.{interface}: every claim needs an op")
            for key in ("region", "anchor", "note"):
                if key in entry and not isinstance(entry[key], str):
                    raise ScriptMetaError(
                        f"{where}.{interface}: {op}: {key} must be a string"
                    )
            fails = entry.get("fails", False)
            if not isinstance(fails, bool | str) or fails == "":
                raise ScriptMetaError(
                    f"{where}.{interface}: {op}: fails is true or the asserted error"
                )
            if fails is False and "region" not in entry:
                raise ScriptMetaError(
                    f"{where}.{interface}: {op}: a claim that it works names the "
                    "region that shows it"
                )
            claims.append(
                Claim(
                    interface=interface,
                    op=op,
                    region=entry.get("region"),
                    anchor=entry.get("anchor"),
                    fails=fails,
                    note=entry.get("note"),
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
    ``AWS_ENDPOINT_URL`` that points host-side clients at ``envs/aws-sim``
    while the snippet code stays endpoint-free. ``verifies`` (relative to the
    script's directory) marks the script as a test harness for a non-Python
    snippet the page actually shows, e.g. a ``*_cli.py`` driving ``foo.sh``: the
    published runnable example is that file, not the harness. ``claims`` feed
    the compatibility matrices (see :class:`Claim`).
    """

    compose: str | None = None
    services: list[str] = dataclasses.field(default_factory=list)
    base_url_env: str | None = None
    env: dict[str, str] = dataclasses.field(default_factory=dict)
    verifies: str | None = None
    claims: list[Claim] = dataclasses.field(default_factory=list)

    @property
    def needs_services(self) -> bool:
        return self.compose is not None


@dataclasses.dataclass
class ScriptMeta:
    """One discovered ``# /// script`` tutorial script and its parsed metadata."""

    path: Path
    requires_python: str | None
    dependencies: list[str]
    docs_factory: DocsFactoryMeta

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


def parse_script(path: Path) -> ScriptMeta | None:
    """Parse one script's inline metadata, or ``None`` if it has no block.

    Raises:
        ScriptMetaError: on a malformed block or a bad ``[tool.docs-factory]``
            table (e.g. ``services`` present without ``compose``).
    """
    block = _read_block(path.read_text())
    if block is None:
        return None

    tool = (block.get("tool") or {}).get(TOOL_TABLE, {}) or {}
    compose = tool.get("compose")
    services = tool.get("services", []) or []
    base_url_env = tool.get("base-url-env")
    env = tool.get("env", {}) or {}
    verifies = tool.get("verifies")

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

    return ScriptMeta(
        path=path,
        requires_python=block.get("requires-python"),
        dependencies=list(block.get("dependencies", []) or []),
        docs_factory=DocsFactoryMeta(
            compose=compose,
            services=list(services),
            base_url_env=base_url_env,
            env=dict(env),
            verifies=verifies,
            claims=_parse_claims(path, tool.get("claims")),
        ),
    )


def has_script_block(path: Path) -> bool:
    """Cheap check: does this ``.py`` file carry a ``# /// script`` header?"""
    # The block must appear before any code; reading the whole file is fine for
    # the small tutorial scripts we scan.
    return "# /// script" in path.read_text()


def discover(content_root: Path) -> list[ScriptMeta]:
    """Every ``# /// script`` tutorial script under ``content_root``, sorted by path.

    This is the authoritative list of runnable tutorial scripts and their
    runtime prerequisites — independent of any shared environment or the
    markdown frontmatter. Raises :class:`ScriptMetaError` on the first
    malformed script so ``docsnip check`` surfaces it.
    """
    scripts: list[ScriptMeta] = []
    for path in sorted(content_root.rglob("*.py")):
        if not has_script_block(path):
            continue
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
    that drives a shell snippet through ``docsnip.shellregions`` must declare
    ``verifies``, or the site publishes the harness instead of the script. Malformed
    metadata is turned into an error string rather than a raised exception so it
    aggregates with the rest of ``docsnip check``.
    """
    errors: list[str] = []
    fence_sources: set[Path] | None = None
    for path in sorted(content_root.rglob("*.py")):
        if not has_script_block(path):
            continue
        try:
            meta = parse_script(path)
        except ScriptMetaError as exc:
            errors.append(str(exc))
            continue
        if meta is None:
            continue
        compose = meta.compose_path()
        if compose is not None and not compose.is_file():
            errors.append(
                f"{path}: [tool.docs-factory].compose points at a missing file: "
                f"{meta.docs_factory.compose}"
            )
        verified = meta.verifies_path()
        if verified is None:
            if _SHELL_HARNESS_RE.search(path.read_text()):
                errors.append(
                    f"{path}: drives a shell snippet via docsnip.shellregions but "
                    '[tool.docs-factory] has no verifies = "<name>.sh"'
                )
            continue
        if not verified.is_file():
            errors.append(
                f"{path}: [tool.docs-factory].verifies points at a missing file: "
                f"{meta.docs_factory.verifies}"
            )
            continue
        if verified.suffix != ".sh":
            # The published runnable example's run instructions are shell-specific.
            errors.append(
                f"{path}: [tool.docs-factory].verifies must name a .sh script: "
                f"{meta.docs_factory.verifies}"
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
