"""OmniDocsDoc's deterministic half: which upstream PRs a nightly run handles.

The agent (``.github/omnigent/omni-docs-doc/``) decides what an upstream PR
means for the docs. Everything that doesn't need a model lives here, so a run
is reproducible and the agent's context stays small:

- ``collect`` lists the PRs merged to a project's upstream stream since the
  ledger's watermark, drops the ones whose files can't affect the docs (tests,
  CI) without a model call, and writes the rest, with diffs cut down to the
  evidence paths, into a context directory.
- ``verdict`` records what the agent did with one PR, so the agent never edits
  the ledger JSON by hand.
- ``finalize`` checks that every collected PR got a verdict and advances the
  watermark.
- ``ledger`` renders the rolling PR's body.

The ledger (``.omni-docs-doc/<project>.json``) lives on the tracking branch and
merges to main with the release, so the next cycle starts from where this one
stopped. See docs/design/omni-docs-doc.md.
"""

from __future__ import annotations

import dataclasses
import json
import re
import subprocess
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

import yaml

PROJECTS_FILE = Path(".github/omnigent/omni-docs-doc/projects.yml")
LEDGER_DIR = Path(".omni-docs-doc")
LEDGER_VERSION = 1

VERDICTS = (
    "none",  # read, nothing in the docs depends on it
    "edited",  # pages changed to match
    "migration",  # an upgrader must act: an entry in the upgrade notes
    "known-issue",  # R01 known issues gained, lost, or changed a row
    "request",  # needs a new page or section the agent didn't write
    "verify-at-release",  # a behavior claim the docs can only prove on the release
    "skipped",  # dropped by the project's skip rules, never shown to the model
)

# A diff larger than this is cut: the agent reads the PR's title and body for
# intent and the evidence diff for surface, and a generated spec can run to
# megabytes.
DIFF_LIMIT = 60_000

# What one `gh pr list` returns. More merges than this since the watermark is
# about two months of Unity Catalog, and the ledger has stalled.
PR_LIMIT = 500


@dataclasses.dataclass(frozen=True)
class Project:
    name: str
    upstream: str  # owner/repo
    stream: str  # the upstream branch whose merges the tracking branch follows
    tracking_branch: str
    release_manifest: Path
    tag_prefix: str
    skip_paths: tuple[str, ...]
    evidence_paths: tuple[str, ...]
    upgrade_notes: Path | None
    enabled: bool

    @property
    def ledger_path(self) -> Path:
        return LEDGER_DIR / f"{self.name}.json"


def load_projects(root: Path) -> dict[str, Project]:
    raw = yaml.safe_load((root / PROJECTS_FILE).read_text()) or {}
    out: dict[str, Project] = {}
    for name, spec in (raw.get("projects") or {}).items():
        notes = spec.get("upgrade_notes")
        out[name] = Project(
            name=name,
            upstream=spec["upstream"],
            stream=spec.get("stream", "main"),
            tracking_branch=spec.get("tracking_branch", f"omni-docs-doc/{name}"),
            release_manifest=Path(spec["release_manifest"]),
            tag_prefix=spec.get("tag_prefix", "v"),
            skip_paths=tuple(spec.get("skip_paths") or ()),
            evidence_paths=tuple(spec.get("evidence_paths") or ()),
            upgrade_notes=Path(notes) if notes else None,
            enabled=bool(spec.get("enabled", True)),
        )
    return out


def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """``**`` crosses directories, ``*`` doesn't. fnmatch's ``*`` would match
    ``/`` too, so ``server/*.java`` would reach into every subdirectory."""
    out = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("".join(out) + r"\Z")


def matches_any(path: str, patterns: Iterable[str]) -> bool:
    return any(glob_to_regex(p).match(path) for p in patterns)


def version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


# --- ledger -----------------------------------------------------------------


def empty_ledger(project: Project, release: str) -> dict[str, Any]:
    return {
        "version": LEDGER_VERSION,
        "project": project.name,
        "upstream": project.upstream,
        "stream": project.stream,
        "base_release": release,
        "watermark": None,
        "prs": {},
    }


def load_ledger(root: Path, project: Project, release: str) -> dict[str, Any]:
    path = root / project.ledger_path
    if not path.exists():
        return empty_ledger(project, release)
    return json.loads(path.read_text())


def save_ledger(root: Path, project: Project, ledger: dict[str, Any]) -> None:
    path = root / project.ledger_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n")


def current_release(root: Path, project: Project) -> str:
    return str(yaml.safe_load((root / project.release_manifest).read_text())["release"])


# --- collect ----------------------------------------------------------------


@dataclasses.dataclass
class Upstream:
    """The GitHub reads collect needs, injectable so tests run offline."""

    merged_prs: Callable[[Project, str | None], list[dict[str, Any]]]
    pr_diff: Callable[[Project, int], str]
    latest_release: Callable[[Project], dict[str, Any] | None]
    # published_at of the release a cycle starts from; a first run reads no
    # further back than it.
    release_date: Callable[[Project, str], str | None]


def _gh(*args: str) -> str:
    return subprocess.run(
        ["gh", *args], check=True, capture_output=True, text=True
    ).stdout


def _gh_merged_prs(project: Project, since: str | None) -> list[dict[str, Any]]:
    # GitHub's search qualifier is day-granular; the seen-set drops the PRs
    # from the watermark's day that a previous run already took.
    search = f"merged:>={since[:10]}" if since else ""
    out = _gh(
        "pr", "list", "-R", project.upstream, "--state", "merged",
        "--base", project.stream, "--limit", str(PR_LIMIT), "--search", search,
        "--json", "number,title,body,labels,files,mergedAt,mergeCommit,url,author",
    )  # fmt: skip
    prs = json.loads(out)
    if len(prs) >= PR_LIMIT:
        # Newest first, so the oldest are the ones missing.
        raise LedgerError(
            f"{PR_LIMIT}+ PRs merged since {since}; move the ledger's watermark "
            "forward by hand, or the oldest would be skipped silently"
        )
    return prs


def _gh_pr_diff(project: Project, number: int) -> str:
    return _gh("pr", "diff", str(number), "-R", project.upstream)


def _gh_latest_release(project: Project) -> dict[str, Any] | None:
    try:
        out = _gh("api", f"repos/{project.upstream}/releases/latest")
    except subprocess.CalledProcessError:
        return None
    return json.loads(out)


def _gh_release_date(project: Project, version: str) -> str | None:
    try:
        out = _gh(
            "api",
            f"repos/{project.upstream}/releases/tags/{project.tag_prefix}{version}",
        )
    except subprocess.CalledProcessError:
        return None
    return json.loads(out)["published_at"]


GITHUB = Upstream(_gh_merged_prs, _gh_pr_diff, _gh_latest_release, _gh_release_date)


def split_diff(diff: str) -> dict[str, str]:
    """A unified diff, by the path each file section changes."""
    files: dict[str, str] = {}
    for section in re.split(r"(?m)^(?=diff --git )", diff):
        m = re.match(r"diff --git a/(\S+) b/(\S+)", section)
        if m:
            files[m.group(2)] = section
    return files


def evidence_diff(project: Project, diff: str) -> str:
    kept = [
        text
        for path, text in split_diff(diff).items()
        if matches_any(path, project.evidence_paths)
    ]
    out = "".join(kept)
    if len(out) > DIFF_LIMIT:
        out = out[:DIFF_LIMIT] + f"\n[cut at {DIFF_LIMIT} characters]\n"
    return out


def is_skippable(project: Project, pr: dict[str, Any]) -> bool:
    paths = [f["path"] for f in pr.get("files") or []]
    return bool(paths) and all(matches_any(p, project.skip_paths) for p in paths)


def collect(
    root: Path,
    project: Project,
    out: Path,
    *,
    max_prs: int | None = None,
    mode: str = "auto",
    upstream: Upstream = GITHUB,
) -> dict[str, Any]:
    """Write ``out/context.json``, ``out/prs.json``, and ``out/diffs/<n>.diff``;
    record skipped PRs in the ledger. Returns the context."""
    release = current_release(root, project)
    ledger = load_ledger(root, project, release)
    since = (ledger.get("watermark") or {}).get("merged_at")
    # The ledger still describes the previous cycle: the release merged and the
    # manifest moved on. Keep only the watermark's day, which the seen-set
    # needs, so the rolling PR lists this cycle alone.
    new_cycle = ledger["base_release"] != release
    if new_cycle:
        ledger["prs"] = {
            n: e
            for n, e in ledger["prs"].items()
            if since and e["merged_at"][:10] >= since[:10]
        }
        ledger["base_release"] = release
    seen = set(ledger["prs"])
    if since is None:
        since = upstream.release_date(project, release)

    latest = upstream.latest_release(project)
    latest_version = (
        latest["tag_name"].removeprefix(project.tag_prefix) if latest else None
    )
    released = latest_version is not None and version_tuple(
        latest_version
    ) > version_tuple(release)
    if mode == "auto":
        mode = "release" if released else "sync"
    elif mode == "release" and not released:
        raise LedgerError(
            f"release mode needs an upstream release newer than {release}; "
            f"the latest is {latest_version or 'unknown'}"
        )

    prs = [
        pr
        for pr in upstream.merged_prs(project, since)
        if str(pr["number"]) not in seen and (since is None or pr["mergedAt"] >= since)
    ]
    # A PR merged after the release tag belongs to the next cycle; it waits for
    # the branch the release merge starts.
    if mode == "release" and latest:
        prs = [pr for pr in prs if pr["mergedAt"] <= latest["published_at"]]
    prs.sort(key=lambda pr: (pr["mergedAt"], pr["number"]))

    pending: list[dict[str, Any]] = []
    for pr in prs:
        if is_skippable(project, pr):
            ledger["prs"][str(pr["number"])] = _entry(pr, ["skipped"])
            continue
        if max_prs is not None and len(pending) >= max_prs:
            break
        pending.append(pr)

    diffs = out / "diffs"
    diffs.mkdir(parents=True, exist_ok=True)
    for pr in pending:
        text = evidence_diff(project, upstream.pr_diff(project, pr["number"]))
        (diffs / f"{pr['number']}.diff").write_text(text)

    context = {
        "project": project.name,
        "upstream": project.upstream,
        "stream": project.stream,
        "mode": mode,
        "release": release,
        "latest_release": latest_version,
        # The upgrade notes start over for the next release.
        "new_cycle": new_cycle,
        "upgrade_notes": str(project.upgrade_notes) if project.upgrade_notes else None,
        "ledger": str(project.ledger_path),
        "pending": [pr["number"] for pr in pending],
    }
    (out / "context.json").write_text(json.dumps(context, indent=2) + "\n")
    (out / "prs.json").write_text(json.dumps([_brief(pr) for pr in pending], indent=2))
    save_ledger(root, project, ledger)
    return context


def _brief(pr: dict[str, Any]) -> dict[str, Any]:
    return {
        "number": pr["number"],
        "title": pr["title"],
        "url": pr.get("url"),
        "merged_at": pr["mergedAt"],
        "merge_commit": (pr.get("mergeCommit") or {}).get("oid"),
        "labels": [lab["name"] for lab in pr.get("labels") or []],
        "files": [f["path"] for f in pr.get("files") or []],
        "body": pr.get("body") or "",
        "diff": f"diffs/{pr['number']}.diff",
    }


def _entry(pr: dict[str, Any], verdicts: list[str]) -> dict[str, Any]:
    return {
        "title": pr["title"],
        "merged_at": pr["mergedAt"],
        "verdicts": verdicts,
        "pages": [],
        "note": "",
    }


# --- verdict / finalize -----------------------------------------------------


class LedgerError(Exception):
    pass


def record_verdict(
    root: Path,
    project: Project,
    ctx_dir: Path,
    number: int,
    verdicts: list[str],
    pages: list[str],
    note: str,
) -> None:
    bad = [v for v in verdicts if v not in VERDICTS or v == "skipped"]
    if bad or not verdicts:
        raise LedgerError(
            f"verdicts must be some of {', '.join(v for v in VERDICTS if v != 'skipped')}"
            f"; got {', '.join(bad) or 'none'}"
        )
    if "none" in verdicts and len(verdicts) > 1:
        raise LedgerError("`none` can't be combined with another verdict")
    prs = {pr["number"]: pr for pr in json.loads((ctx_dir / "prs.json").read_text())}
    if number not in prs:
        raise LedgerError(f"#{number} isn't in this run's {ctx_dir / 'prs.json'}")
    release = current_release(root, project)
    ledger = load_ledger(root, project, release)
    pr = prs[number]
    ledger["prs"][str(number)] = {
        "title": pr["title"],
        "merged_at": pr["merged_at"],
        "verdicts": sorted(set(verdicts), key=VERDICTS.index),
        "pages": sorted(set(pages)),
        "note": note,
    }
    save_ledger(root, project, ledger)


def finalize(root: Path, project: Project, ctx_dir: Path) -> list[int]:
    """Advance the watermark past this run's PRs. Returns the PRs left without
    a verdict; they stay unseen, so the next run collects them again."""
    context = json.loads((ctx_dir / "context.json").read_text())
    release = current_release(root, project)
    ledger = load_ledger(root, project, release)
    missing = [n for n in context["pending"] if str(n) not in ledger["prs"]]
    if missing:
        # Stop at the oldest PR still without a verdict so the next run's
        # `merged >= watermark` collects it again; the seen-set skips the rest.
        prs = {
            pr["number"]: pr for pr in json.loads((ctx_dir / "prs.json").read_text())
        }
        mark = min(prs[n]["merged_at"] for n in missing)
    else:
        # collect takes PRs oldest first, so everything up to the newest
        # recorded merge has been read or skipped.
        mark = max((e["merged_at"] for e in ledger["prs"].values()), default=None)
    old = (ledger.get("watermark") or {}).get("merged_at")
    if mark is not None and (old is None or mark > old):
        ledger["watermark"] = {"merged_at": mark}
    save_ledger(root, project, ledger)
    return missing


# --- render -----------------------------------------------------------------


def render_markdown(project: Project, ledger: dict[str, Any]) -> str:
    base = f"https://github.com/{project.upstream}/pull"
    rows = sorted(
        ledger["prs"].items(), key=lambda kv: (kv[1]["merged_at"], int(kv[0]))
    )
    shown = [(n, e) for n, e in rows if e["verdicts"] != ["skipped"]]
    skipped = len(rows) - len(shown)

    def line(n: str, e: dict[str, Any]) -> str:
        pages = ", ".join(f"`{p}`" for p in e["pages"]) or "—"
        note = e["note"].replace("|", "\\|").replace("\n", " ")
        return f"| [#{n}]({base}/{n}) | {e['title']} | {', '.join(e['verdicts'])} | {pages} | {note} |"

    out = [
        f"Upstream `{project.upstream}` `{project.stream}` since "
        f"{ledger['base_release']}: {len(shown)} PRs read, {skipped} skipped "
        "(tests and CI only).",
        "",
    ]
    migration = [(n, e) for n, e in shown if "migration" in e["verdicts"]]
    verify = [(n, e) for n, e in shown if "verify-at-release" in e["verdicts"]]
    for title, group in (
        ("Upgrade notes", migration),
        ("Verify at release", verify),
    ):
        if group:
            out += [
                f"### {title}",
                "",
                *(f"- [#{n}]({base}/{n}) {e['title']}" for n, e in group),
                "",
            ]
    out += [
        "### Ledger",
        "",
        "| PR | Title | Verdict | Pages | Note |",
        "| --- | --- | --- | --- | --- |",
        *(line(n, e) for n, e in shown),
        "",
    ]
    return "\n".join(out)
