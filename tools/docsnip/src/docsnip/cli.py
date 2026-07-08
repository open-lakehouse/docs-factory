"""Command-line interface for docs-factory content tooling.

Subcommands:
  validate      — check frontmatter on all content pages
  snippetcheck  — verify every snippet fence resolves to a unique source region
  manifest      — (re)generate site-artifacts/examples-manifest.json
  llmstxt       — (re)generate site-artifacts/<project>.llms.txt
  generate      — manifest + llmstxt in one pass
  check         — validate + snippetcheck + drift-check generated artifacts (CI entry)
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from . import llmstxt, manifest
from .frontmatter import iter_pages, validate
from .snippetcheck import check_content

# Per-project published-site URL base for llms.txt links. Placeholder until the
# restructured sites' URL scheme is confirmed; the generator is scheme-agnostic.
URL_BASES = {
    "delta": "https://delta.io/docs",
    "unitycatalog": "https://docs.unitycatalog.io",
}


def _repo_root() -> Path:
    # tools/docsnip/src/docsnip/cli.py -> repo root
    return Path(__file__).resolve().parents[4]


def _paths(root: Path | None):
    root = root or _repo_root()
    return {
        "content": root / "content",
        "examples": root / "examples",
        "artifacts": root / "site-artifacts",
    }


def cmd_validate(p) -> int:
    errors: list[str] = []
    for page in iter_pages(p["content"]):
        errors.extend(validate(page))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} frontmatter error(s)", file=sys.stderr)
        return 1
    print("frontmatter OK")
    return 0


def cmd_snippetcheck(p) -> int:
    errors = check_content(p["content"])
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} snippet error(s)", file=sys.stderr)
        return 1
    print("snippets OK")
    return 0


def _write_artifacts(p) -> list[Path]:
    written = [
        manifest.write(
            p["content"], p["examples"], p["artifacts"] / "examples-manifest.json"
        )
    ]
    for project, url_base in URL_BASES.items():
        if (p["content"] / project).is_dir():
            written.append(
                llmstxt.write(
                    project,
                    p["content"],
                    url_base,
                    p["artifacts"] / f"{project}.llms.txt",
                )
            )
    return written


def cmd_generate(p) -> int:
    for path in _write_artifacts(p):
        print(path)
    return 0


def cmd_check(p) -> int:
    """CI entry point: validate + snippetcheck + assert artifacts are not stale."""
    rc = cmd_validate(p) or cmd_snippetcheck(p)

    # Drift-check: regenerate into a temp dir and diff against committed artifacts.
    with tempfile.TemporaryDirectory() as tmp:
        tmp_art = Path(tmp)
        tmp_p = dict(p, artifacts=tmp_art)
        _write_artifacts(tmp_p)
        for regenerated in tmp_art.iterdir():
            committed = p["artifacts"] / regenerated.name
            if not committed.is_file():
                print(f"missing generated artifact: {committed}", file=sys.stderr)
                rc = 1
            elif committed.read_text() != regenerated.read_text():
                print(
                    f"stale artifact: {committed} — run `docsnip generate`",
                    file=sys.stderr,
                )
                rc = 1
    if rc == 0:
        print("check OK")
    return rc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="docsnip")
    parser.add_argument(
        "--root", type=Path, default=None, help="repo root (autodetected)"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in (
        "validate",
        "snippetcheck",
        "manifest",
        "llmstxt",
        "generate",
        "check",
    ):
        sp = sub.add_parser(name)
        sp.add_argument(
            "content",
            nargs="?",
            default=None,
            help="content dir (unused; autodetected)",
        )

    args = parser.parse_args(argv)
    p = _paths(args.root)

    dispatch = {
        "validate": cmd_validate,
        "snippetcheck": cmd_snippetcheck,
        "manifest": cmd_generate,  # generate covers both; manifest/llmstxt are aliases
        "llmstxt": cmd_generate,
        "generate": cmd_generate,
        "check": cmd_check,
    }
    return dispatch[args.cmd](p)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
