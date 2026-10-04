"""What the docs sites serve of a script, and a lint that keeps it reader-facing.

The emitter publishes every runnable script whole (minus region markers and the
factory-only PEP 723 tables), plus the sibling helper modules it imports. Readers
and agents read those comments and docstrings, so they must not lean on this
repo's layout or test harness: no repo paths, no verifier names, no pytest.
"""

from __future__ import annotations

import re
from pathlib import Path

from .scriptmeta import _BLOCK_RE, ScriptMeta, has_script_block

_IMPORT_RE = re.compile(r"^\s*(?:from\s+(\w+)\s+import|import\s+(\w+))", re.MULTILINE)

# Repo layout and harness vocabulary a served file must not mention.
_HARNESS_RE = re.compile(
    r"conftest|pytest|testcontainers|_cli\.py|\[tool\.docs-factory\]"
    r"|(?<![\w-])envs/|(?<![\w-])snippets/|\.\./"
)
# A dependency only this repo's workspace resolves; the served copy can't install it.
_LOCAL_DEP = "docs-factory-seed"


def helpers(script: Path) -> list[Path]:
    """Sibling modules the script imports (``from _seed import …``), sorted.

    A helper has no PEP 723 block of its own: it is published beside the
    script and runs under the script's dependencies.
    """
    found = set()
    for m in _IMPORT_RE.finditer(script.read_text()):
        sibling = script.parent / f"{m.group(1) or m.group(2)}.py"
        if sibling != script and sibling.is_file() and not has_script_block(sibling):
            found.add(sibling)
    return sorted(found)


def served_files(meta: ScriptMeta) -> list[Path]:
    """The files a site serves for one discovered script."""
    main = meta.verifies_path() or meta.path
    return [main, *helpers(meta.path)] if main == meta.path else [main]


def _body(text: str) -> str:
    """The text with its PEP 723 block blanked (same line count), as served."""
    return re.sub(_BLOCK_RE, lambda m: "\n" * m.group(0).count("\n"), text, count=1)


def check(scripts: list[ScriptMeta]) -> tuple[list[str], list[str]]:
    """``(errors, warnings)`` for every served file: harness vocabulary in its
    comments or code is an error; a repo-local dependency is a warning."""
    errors: list[str] = []
    warnings: list[str] = []
    seen: set[Path] = set()
    for meta in scripts:
        if _LOCAL_DEP in meta.dependencies:
            warnings.append(
                f"{meta.path}: depends on {_LOCAL_DEP}, so its served copy can't "
                "`uv run` outside this repo"
            )
        for path in served_files(meta):
            if path in seen:
                continue
            seen.add(path)
            for n, line in enumerate(_body(path.read_text()).splitlines(), 1):
                if m := _HARNESS_RE.search(line):
                    errors.append(
                        f"{path}:{n}: published to readers but mentions "
                        f"`{m.group(0)}`; describe what the reader runs instead"
                    )
    return errors, warnings
