"""Command-line interface for docs-factory content tooling.

Subcommands:
  validate      — check frontmatter on all content pages
  snippetcheck  — verify every snippet fence resolves to a unique source region
  versions      — pins against each content/<project>/release.yml (--fix rewrites)
  bump-uc       — move the docs to a new UC release and rewrite every pin
  bump-delta    — move the Delta docs to a new Delta release and rewrite every pin
  compat        — compatibility tables from script claims (--fix rewrites)
  trestle       — Trestle catalog ↔ model coverage (--fix rewrites the context artifact)
  envs          — generated environments' plan.json → model fragments + registry facts (--fix rewrites)
  check         — validate + snippetcheck + versions + compat (CI entry)
  plan          — which tutorial scripts a CI run executes, per lane and shard
  durations     — fold CI-recorded script durations into the shard plan's input

llms.txt generation lives in the docs-site emitter (emit/docs), which re-uses
content-core for content discovery, identity, and URL derivation instead of
re-implementing them in Python. docsnip is the content-contract validator; it no
longer emits artifacts.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from . import (
    ciplan,
    compat,
    envgen,
    environments,
    published,
    query,
    trestle,
    versions,
)
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
    model_quality_gaps,
    publication_gaps,
    validate,
)
from .scriptmeta import ScriptMetaError
from .scriptmeta import check as check_scripts
from .scriptmeta import discover as discover_scripts
from .snippetcheck import check_blogs, check_content

# The docsnip scripts --json output is a build contract consumed by the site's
# build-script-index.mjs; bump when the shape changes so the JS side can assert it.
SCRIPTS_JSON_VERSION = 4


def _repo_root() -> Path:
    # tools/docsnip/src/docsnip/cli.py -> repo root
    return Path(__file__).resolve().parents[4]


def _paths(root: Path | None):
    root = root or _repo_root()
    return {
        "root": root,
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

    joined = trestle.check(p["root"])
    errors.extend(joined.errors)
    errors.extend(envgen.check(p["root"]))
    fit = envgen.fit(p["root"])
    errors.extend(fit.errors)
    quality = (
        model_quality_gaps(p["arch_model"])
        + publication_gaps(p["arch_model"], content_pages, p["root"])
        + compat.model_gaps(p["root"])
        + trestle.concern_gaps(p["root"])
        + joined.gaps
        + fit.reports
    )
    if quality:
        print(f"model quality: {len(quality)} gap(s) (not failing):", file=sys.stderr)
        print("\n".join(quality), file=sys.stderr)

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
    try:
        scripts = discover_scripts(p["content"])
    except ScriptMetaError:
        scripts = None  # already reported by check_scripts
    if scripts is not None:
        errors.extend(environments.check(p["root"], scripts))
        errors.extend(environments.check_pages(p["root"], p["content"], scripts))
        served_errors, warnings = published.check(scripts)
        errors.extend(served_errors)
        for warning in warnings:
            print(f"warning: {warning}", file=sys.stderr)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} snippet error(s)", file=sys.stderr)
        return 1
    print("snippets OK")
    return 0


def _tutorial_slug(script_path: Path, content_root: Path) -> str | None:
    """The owning tutorial's slug for a colocated script, or None.

    A script lives at ``content/<project>/<bucket>/<slug>/[snippets/]<file>.py``.
    The slug is the directory segment directly under the bucket, with its ``NNN-``
    order prefix stripped — mirroring the JS docIdentity slug derivation (and
    ``_py_doc_identity`` in tests/test_cross_language.py). Returns None if the path
    doesn't sit under a ``<project>/<bucket>/<slug>/`` folder.
    """
    try:
        parts = script_path.resolve().relative_to(content_root.resolve()).parts
    except ValueError:
        return None
    # parts: <project>/<bucket>/<slug>/[snippets/]<file>.py — need >= project, bucket, slug, file.
    if len(parts) < 4:
        return None
    slug = parts[2]
    return re.sub(r"^\d+-", "", slug)


def _blog_slug(script_path: Path, blogs_root: Path) -> str | None:
    """The owning blog's slug for a colocated script, or None.

    A blog script lives at ``blogs/<slug>/[snippets/]<file>.py``; the slug is the
    directory segment directly under ``blogs/``. Blogs carry no ``NNN-`` order
    prefix, so the folder name is the slug as-is (mirroring slugFromBlogPath in
    the JS content layer). Returns None if the path isn't under a blog folder.
    """
    try:
        parts = script_path.resolve().relative_to(blogs_root.resolve()).parts
    except ValueError:
        return None
    # parts: <slug>/[snippets/]<file>.py — need at least <slug>, <file>.
    if len(parts) < 2:
        return None
    return parts[0]


def cmd_scripts(p, as_json: bool = True) -> int:
    """Emit the discovered PEP 723 tutorial scripts as JSON (a build contract).

    Wraps scriptmeta.discover() — the one authoritative parser — so the site build
    (build-script-index.mjs) never re-implements PEP 723 parsing in JS. Output is a
    versioned object: ``{"version": N, "scripts": [{runner, path, requires_python,
    dependencies, compose, environment, client_env, services, base_url_env, env,
    verifies, tutorial_slug}]}``. ``path`` and ``verifies`` (the snippet a harness
    tests, or null) are repo-relative POSIX; ``runner`` is ``python``, ``scala``, or
    ``java``. ``environment`` is the compose's
    ``envs/environments.yml`` key (or null) and ``client_env`` that entry's
    reader-facing variables; ``env`` stays harness-only. ``helpers`` are the
    sibling modules a script imports, which the site serves beside it.
    """
    content_root = p["content"]
    blogs_root = p["blogs"]
    repo_root = p["root"]
    # Runnable scripts live beside BOTH tutorial pages (content/) and blog posts
    # (blogs/). Discover each root with its own slug derivation; the JS side
    # (scriptEntry) turns the repo-relative path into the served route.
    registry = environments.load(repo_root)
    scripts = []
    for root, slug_fn in ((content_root, _tutorial_slug), (blogs_root, _blog_slug)):
        for meta in discover_scripts(root):
            verified = meta.verifies_path()
            compose = meta.compose_path()
            env_key = environments.key_for(compose, repo_root) if compose else None
            registered = registry.get(env_key) if env_key else None
            scripts.append(
                {
                    "runner": meta.runner,
                    "path": meta.path.resolve()
                    .relative_to(repo_root.resolve())
                    .as_posix(),
                    "requires_python": meta.requires_python,
                    "dependencies": meta.dependencies,
                    "compose": meta.docs_factory.compose,
                    "environment": env_key,
                    "client_env": registered.client_env if registered else {},
                    "services": meta.docs_factory.services,
                    "base_url_env": meta.docs_factory.base_url_env,
                    "env": meta.docs_factory.env,
                    "verifies": (
                        verified.relative_to(repo_root.resolve()).as_posix()
                        if verified
                        else None
                    ),
                    "helpers": [
                        h.relative_to(repo_root.resolve()).as_posix()
                        for h in published.helpers(meta.path.resolve())
                    ],
                    "tutorial_slug": slug_fn(meta.path, root),
                }
            )
    payload = {"version": SCRIPTS_JSON_VERSION, "scripts": scripts}
    print(json.dumps(payload, indent=2))
    return 0


def cmd_versions(p, fix: bool = False) -> int:
    if fix:
        for path in versions.fix(p["root"]):
            print(f"rewrote {path.relative_to(p['root'])}")
    errors = versions.check(p["root"])
    for warning in versions.prose_warnings(p["root"]):
        print(f"warning: {warning}", file=sys.stderr)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} version error(s)", file=sys.stderr)
        return 1
    print("versions OK")
    return 0


def cmd_bump(p, release: str, project: versions.Project) -> int:
    for path in versions.bump(p["root"], release, project):
        print(f"rewrote {path.relative_to(p['root'])}")
    print(
        "next: the release review re-reads claims the release can change "
        "(docs/design/docs-versioning.md#release-review, skill release-bump)"
    )
    # Table headers show pinned versions.
    return cmd_versions(p) or cmd_compat(p, fix=True)


def cmd_compat(p, fix: bool = False) -> int:
    if fix:
        try:
            changed = compat.fix(p["root"])
        except ValueError as exc:
            print(exc, file=sys.stderr)
            print("\ncompatibility tables not rewritten", file=sys.stderr)
            return 1
        for path in changed:
            print(f"rewrote {path.relative_to(p['root'])}")
    errors, warnings = compat.check(p["root"])
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} compatibility error(s)", file=sys.stderr)
        return 1
    print("compat OK")
    return 0


def cmd_trestle(p, fix: bool = False, pin: bool = False) -> int:
    root = p["root"]
    try:
        if pin:
            found = trestle.load_pin(root)
            print(found.git, found.rev, found.package)
            return 0
        if fix and trestle.fix(root):
            print(f"rewrote {trestle.CONTEXT}")
        lines = trestle.coverage(root)
    except (OSError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    print("\n".join(lines))
    report = trestle.check(root)
    if report.gaps:
        print(f"\n{len(report.gaps)} gap(s) (not failing):", file=sys.stderr)
        print("\n".join(report.gaps), file=sys.stderr)
    if report.errors:
        print("\n".join(report.errors), file=sys.stderr)
        print(f"\n{len(report.errors)} trestle error(s)", file=sys.stderr)
        return 1
    print("trestle OK")
    return 0


def cmd_envs(p, fix: bool = False) -> int:
    root = p["root"]
    if fix:
        try:
            changed = envgen.fix(root)
        except (OSError, ValueError) as exc:
            print(exc, file=sys.stderr)
            print("\ngenerated environments not projected", file=sys.stderr)
            return 1
        for path in changed:
            print(f"rewrote {path}")
    errors = envgen.check(root)
    fit = envgen.fit(root)
    errors += fit.errors
    if fit.reports:
        print(f"{len(fit.reports)} ambiguous fit(s) (not failing):", file=sys.stderr)
        print("\n".join(fit.reports), file=sys.stderr)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} environment error(s)", file=sys.stderr)
        return 1
    print("envs OK")
    return 0


def cmd_query(p, kind: str, ident: str) -> int:
    try:
        answer = query.run(query.load(p["root"]), kind, ident)
    except query.QueryError as exc:
        print(f"docsnip query {kind}: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(answer, indent=2, ensure_ascii=False))
    return 0


def cmd_check(p) -> int:
    """CI entry point: validate + snippetcheck + versions + compat."""
    rc = cmd_validate(p) or cmd_snippetcheck(p) or cmd_versions(p) or cmd_compat(p)
    if rc == 0:
        print("check OK")
    return rc


def cmd_plan(p, changed_from: str | None, github_output: str | None) -> int:
    """Print the CI shard matrix per lane; with ``github_output``, also append
    one ``<lane>=<json>`` line per lane to that file for the workflow."""
    changed = None
    if changed_from is not None:
        text = (
            sys.stdin.read() if changed_from == "-" else Path(changed_from).read_text()
        )
        changed = [line.strip() for line in text.splitlines() if line.strip()]
    try:
        scripts = discover_scripts(p["content"])
    except ScriptMetaError as exc:
        print(f"docsnip plan: {exc}", file=sys.stderr)
        return 1
    matrix = ciplan.plan(scripts, p["root"], changed)
    print(json.dumps(matrix, indent=2))
    if github_output:
        with open(github_output, "a") as fh:
            for lane, shards in matrix.items():
                fh.write(f"{lane}={json.dumps(shards)}\n")
    return 0


def cmd_durations(p, recorded: list[Path]) -> int:
    files = [
        f for r in recorded for f in (sorted(r.rglob("*.json")) if r.is_dir() else [r])
    ]
    merged = ciplan.merge_durations(p["root"], files)
    print(f"{ciplan.DURATIONS_FILE}: {len(merged)} scripts from {len(files)} file(s)")
    return 0


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
    # `scripts --json` emits the PEP 723 tutorial-script index (a build contract for
    # the site's build-script-index.mjs). --json is the only (and default) format.
    sp_scripts = sub.add_parser("scripts")
    sp_scripts.add_argument(
        "--json", action="store_true", default=True, help="emit JSON (default)"
    )

    sp_versions = sub.add_parser("versions")
    sp_versions.add_argument(
        "--fix", action="store_true", help="rewrite pins to the manifest first"
    )
    sp_compat = sub.add_parser("compat")
    sp_compat.add_argument(
        "--fix", action="store_true", help="rewrite the embedded tables first"
    )
    sp_trestle = sub.add_parser("trestle")
    sp_trestle.add_argument(
        "--fix", action="store_true", help="rewrite the context artifact first"
    )
    sp_trestle.add_argument(
        "--pin", action="store_true", help="print the pinned git URL, rev, package"
    )
    sp_envs = sub.add_parser("envs")
    sp_envs.add_argument(
        "--fix", action="store_true", help="rewrite the fragments and registry facts"
    )
    # Internal agent queries over the committed artifacts (skill docs-query).
    sp_query = sub.add_parser("query")
    sp_query.add_argument("kind", choices=query.KINDS)
    sp_query.add_argument(
        "id",
        help="a model element; module:<id>, pin:<project>/<key>, or pin:trestle "
        "(impact); a script path or <project>/<journey> (environment-for); "
        "an environment name or registry key (explain-selection)",
    )
    sp_query.add_argument(
        "--json", action="store_true", default=True, help="emit JSON (default)"
    )
    sp_plan = sub.add_parser("plan")
    sp_plan.add_argument(
        "--changed-from",
        default=None,
        help="file listing changed repo paths, one per line (- for stdin); "
        "omit to select every script",
    )
    sp_plan.add_argument(
        "--github-output", default=None, help="append <lane>=<json> lines here"
    )
    sp_durations = sub.add_parser("durations")
    sp_durations.add_argument(
        "recorded", nargs="+", type=Path, help="duration JSON files or dirs of them"
    )
    sp_bump = sub.add_parser("bump-uc")
    sp_bump.add_argument("release", help="the new Unity Catalog release, X.Y.Z")
    sp_bump_delta = sub.add_parser("bump-delta")
    sp_bump_delta.add_argument("release", help="the new Delta Lake release, X.Y.Z")

    args = parser.parse_args(argv)
    p = _paths(args.root)

    if args.cmd == "scripts":
        return cmd_scripts(p, as_json=args.json)
    if args.cmd == "versions":
        return cmd_versions(p, fix=args.fix)
    if args.cmd == "compat":
        return cmd_compat(p, fix=args.fix)
    if args.cmd == "trestle":
        return cmd_trestle(p, fix=args.fix, pin=args.pin)
    if args.cmd == "envs":
        return cmd_envs(p, fix=args.fix)
    if args.cmd == "query":
        return cmd_query(p, args.kind, args.id)
    if args.cmd == "plan":
        return cmd_plan(p, args.changed_from, args.github_output)
    if args.cmd == "durations":
        return cmd_durations(p, args.recorded)
    if args.cmd == "bump-uc":
        return cmd_bump(p, args.release, versions.UNITYCATALOG)
    if args.cmd == "bump-delta":
        return cmd_bump(p, args.release, versions.DELTA)

    dispatch = {
        "validate": cmd_validate,
        "snippetcheck": cmd_snippetcheck,
        "check": cmd_check,
    }
    return dispatch[args.cmd](p)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
