"""Command-line interface for docs-factory content tooling.

Subcommands:
  validate      — check frontmatter on all content pages
  snippetcheck  — verify every snippet fence resolves to a unique source region
  check         — validate + snippetcheck (CI entry)

llms.txt generation lives on the SITE side now (site/scripts/build-llmstxt.mjs,
a build-time step), so it re-uses content-core for content discovery, identity,
and URL derivation instead of re-implementing them in Python. docsnip is the
content-contract validator; it no longer emits artifacts.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .blog import (
    iter_blog_drafts,
    load_tag_registry,
    validate_blog,
    validate_tag_registry,
)
from .frontmatter import (
    iter_pages,
    load_model_element_ids,
    load_page_worthy_elements,
    validate,
)
from .scriptmeta import check as check_scripts
from .snippetcheck import check_blogs, check_content


def _repo_root() -> Path:
    # tools/docsnip/src/docsnip/cli.py -> repo root
    return Path(__file__).resolve().parents[4]


def _paths(root: Path | None):
    root = root or _repo_root()
    return {
        "content": root / "content",
        "blogs": root / "blogs",
        "arch_model": root / "architecture" / "dist" / "model.json",
    }


def cmd_validate(p) -> int:
    errors: list[str] = []
    coverage_gaps: list[str] = []
    model_ids = load_model_element_ids(p["arch_model"])
    content_pages = list(iter_pages(p["content"]))
    # id -> pages that claim to canonically explain it, for the duplicate check.
    explains_pages: dict[str, list[str]] = {}
    for page in content_pages:
        result = validate(page, model_ids)
        errors.extend(result.errors)
        coverage_gaps.extend(result.coverage_gaps)
        explains = page.meta.get("explains")
        if isinstance(explains, str) and explains:
            explains_pages.setdefault(explains, []).append(str(page.path))

    # An element has exactly one canonical explanation page. Two pages claiming
    # the same `explains:` id is a hard error — there's no single ground truth.
    for eid, paths in explains_pages.items():
        if len(paths) > 1:
            errors.append(
                f"explains id '{eid}' claimed by multiple pages "
                f"(canonical explanation must be unique): {', '.join(sorted(paths))}"
            )

    known_tags = load_tag_registry(p["blogs"])
    errors.extend(validate_tag_registry(p["blogs"], model_ids))
    for page in iter_blog_drafts(p["blogs"]):
        errors.extend(validate_blog(page, known_tags))

    # Tier-2 coverage ratchet: report how many content pages relate to at least
    # one model node. Gaps are surfaced but never fail CI (see PageValidation).
    covered = len(content_pages) - len(coverage_gaps)
    print(
        f"model-reference coverage: {covered}/{len(content_pages)} content pages",
        file=sys.stderr,
    )
    if coverage_gaps:
        print(f"{len(coverage_gaps)} coverage gap(s) (not failing):", file=sys.stderr)
        print("\n".join(coverage_gaps), file=sys.stderr)

    # Explanation coverage ratchet: which page-worthy model concepts
    # (capabilities / specs / implementations) have no `explains:` page yet.
    # Reported as a warning — authoring lags the model, and that's fine — but it
    # makes the "no explanation yet" gaps visible instead of silent.
    page_worthy = load_page_worthy_elements(p["arch_model"])
    if page_worthy:
        uncovered = sorted(
            f"{eid} ({title})"
            for eid, title in page_worthy.items()
            if eid not in explains_pages
        )
        explained = len(page_worthy) - len(uncovered)
        print(
            f"explanation coverage: {explained}/{len(page_worthy)} "
            "page-worthy model concepts have an explanation page",
            file=sys.stderr,
        )
        if uncovered:
            print(
                f"{len(uncovered)} concept(s) with no explanation yet (not failing):",
                file=sys.stderr,
            )
            print("\n".join(f"  - {u}" for u in uncovered), file=sys.stderr)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} frontmatter error(s)", file=sys.stderr)
        return 1
    print("frontmatter OK")
    return 0


def cmd_snippetcheck(p) -> int:
    errors = check_content(p["content"])
    errors.extend(check_blogs(p["blogs"]))
    # Colocated tutorial scripts carry PEP 723 metadata (deps + a
    # [tool.docs-factory] runtime contract); validate the block parses and any
    # declared compose file exists, alongside the snippet-fence checks.
    errors.extend(check_scripts(p["content"]))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} snippet error(s)", file=sys.stderr)
        return 1
    print("snippets OK")
    return 0


def cmd_check(p) -> int:
    """CI entry point: validate + snippetcheck."""
    rc = cmd_validate(p) or cmd_snippetcheck(p)
    if rc == 0:
        print("check OK")
    return rc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="docsnip")
    parser.add_argument(
        "--root", type=Path, default=None, help="repo root (autodetected)"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("validate", "snippetcheck", "check"):
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
        "check": cmd_check,
    }
    return dispatch[args.cmd](p)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
