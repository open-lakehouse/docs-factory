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


class ScriptMetaError(Exception):
    """Raised when a script's inline metadata is malformed or contradictory."""


@dataclasses.dataclass
class DocsFactoryMeta:
    """The ``[tool.docs-factory]`` runtime contract parsed from a script.

    ``compose`` is a path *relative to the script's own directory* (so it stays
    valid when the tutorial folder moves); ``None`` means the script needs no
    services and runs in the default (no-Docker) test lane. ``services`` names
    the compose services to wait on. ``base_url_env`` is the environment
    variable the harness sets to the started server's base URL — the script
    reads it, so the same code a reader runs is what the test exercises.
    """

    compose: str | None = None
    services: list[str] = dataclasses.field(default_factory=list)
    base_url_env: str | None = None

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

    return ScriptMeta(
        path=path,
        requires_python=block.get("requires-python"),
        dependencies=list(block.get("dependencies", []) or []),
        docs_factory=DocsFactoryMeta(
            compose=compose,
            services=list(services),
            base_url_env=base_url_env,
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


def check(content_root: Path) -> list[str]:
    """Validate discovered tutorial scripts; return a list of human-readable errors.

    Asserts each script parses and that every declared ``compose`` file exists
    on disk. Malformed metadata is turned into an error string rather than a
    raised exception so it aggregates with the rest of ``docsnip check``.
    """
    errors: list[str] = []
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
    return errors
