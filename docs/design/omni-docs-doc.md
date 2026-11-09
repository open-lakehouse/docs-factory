# OmniDocsDoc: docs that track upstream between releases

OmniDocsDoc, the doctor for all the docs, is an Omnigent agent that runs
nightly in GitHub Actions. It reads the PRs merged upstream since its last run,
decides what each one means for our docs, and has the pages changed to match.
The changes accumulate on a long-lived tracking branch with one rolling draft
PR to `main`. When upstream tags the release, the same run bumps the pins and
reviews the claims on that branch, and merging the PR releases the docs.
Unity Catalog comes first, and other projects are an entry in the registry.

Without it, a release lands as one large diff that someone reads at bump time.
With it, each upstream PR is read within a day of merging, while its
description and review are fresh, and the release review only re-checks what
the nightly runs already flagged.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Registry | `.github/omnigent/omni-docs-doc/projects.yml` | Per project: upstream repo, stream branch, tracking branch, release manifest, upgrade-notes page, skip rules, evidence paths. |
| Collector | `docsnip upstream` (`tools/docsnip/src/docsnip/upstream.py`) | Everything that doesn't need a model: which PRs to read, the trimmed diffs, the release detection, the ledger. |
| Agent | `.github/omnigent/omni-docs-doc/` | An orchestrator that never writes files, a read-only `triager`, and a `fixer` that writes under `content/`. Each uses this repo's skills. |
| Workflow | `.github/workflows/omni-docs-doc.yml` | Nightly and on dispatch: branch, collect, run, gate, commit, PR. |
| Ledger | `.omni-docs-doc/<project>.json` (tracking branch) | The watermark and one verdict per upstream PR. It merges with the release, so the next cycle starts from it. |
| Local run | `just omni-docs-doc [project] [--max-prs N]` | The same agent on your checkout, in a saved session you can watch. Commits nothing. |

## A nightly run

1. **Branch.** The workflow looks for an open PR from the project's tracking
   branch (`omni-docs-doc/unitycatalog`). If it's a draft, the run continues
   that branch and merges `main` into it, with no force-push. If it's ready
   for review, release mode has finished and the PR is waiting to merge, so
   the run holds. If there's no open PR, the last cycle merged (or was
   closed, which discards it), and the run starts again from `main`.
2. **Collect.** `docsnip upstream collect` lists the PRs merged to the
   upstream stream since the ledger's watermark, oldest first. A first run
   starts at the date of the release in `release.yml`. A PR whose files all
   match `skip_paths` (tests, CI) is recorded as `skipped` without a model
   call. For each of the rest, it writes the PR's text and file list to
   `prs.json`, and the parts of its diff under `evidence_paths` to
   `diffs/<n>.diff`. The workflow also clones the upstream stream's head for
   reading source in context.
3. **Run.** `omni run .github/omnigent/omni-docs-doc -p …`. The orchestrator
   sends PRs to `triager`s in batches. Each triager returns verdicts, pages,
   and edits with evidence links at the merge commit. The orchestrator then
   dispatches `fixer`s, one per page group, so that no two edit a file at
   once, and records each outcome with `docsnip upstream verdict`. Its final
   message is the run summary.
4. **Finalize.** `docsnip upstream finalize` advances the watermark. A PR left
   without a verdict holds the watermark at its merge time, so the next run
   collects it again.
5. **Gate.** The run fails if it changed files outside `content/` and the
   ledger (release mode also allows `envs/`, `emit/docs/specs/`,
   `architecture/`, and `sites/`), if the model credential appears in the diff
   or the outputs, or if `docsnip check` fails.
6. **Publish.** The workflow makes one commit per run, with an
   `Upstream-PRs:` trailer, pushes it, and creates or updates the draft PR.
   The PR body holds the last run's summary and the ledger, which lists the
   PRs that need upgrade notes or verification at release. Each run's context,
   summary, stderr, and Omnigent conversation log are uploaded as an artifact.

### Verdicts

| Verdict | Meaning |
| --- | --- |
| `none` | Nothing in the docs depends on it. Most PRs get this. |
| `edited` | A page now states the new behavior or surface. |
| `migration` | An upgrader must act or will see different behavior, so it gets an entry in the upgrade notes. |
| `known-issue` | A row in R01's known issues was added, fixed, or changed. |
| `request` | Needs a page that doesn't exist, so it becomes a `planned:` slot in `nav.yml`. |
| `verify-at-release` | A behavior claim only the released build can prove. Nothing is asserted yet. |
| `skipped` | Matched the skip rules and was never shown to the model. |

### Verification before the release

The tested scripts pin the release in `release.yml`, so nightly runs can't
execute unreleased upstream behavior. They verify statically, with
`docsnip check`, and cite the upstream source at the merge commit. A claim
that only a running build can settle gets `verify-at-release`, not an edit.
Release mode bumps the pins, and CI on the PR then runs every script against
the released build. That run is the real test of the cycle's edits.

## Release mode

Once `collect` sees an upstream release newer than `release.yml`, the mode is
`release`. The run finishes the PRs merged before the tag (later ones wait for
the next cycle), then a fixer runs the
[`release-bump`](../../.claude/skills/release-bump/SKILL.md) skill, steps 1
and 3 to 5. It retitles the upgrade notes for the version and re-checks each
entry against the tag diff. The "what's new" list and the claims table go in
the PR body. The workflow renames the PR to
`docs(<project>): update the docs for X.Y.Z` (the squash commit is the
changelog entry) and marks it ready for review. Nothing merges automatically,
and no agent changes `status:`. A `ready` page whose claims changed needs a
new approval in the review app ([ADR-0002](../decisions/ADR-0002-git-ready-is-release.md)).

This is the agent that [`release-bump-agent.md`](release-bump-agent.md)
designed. The procedure stays in the skill, and each agent runs its section of
it.

## Upgrade notes

Some upstream changes need more than a page edit: a reader upgrading a running
server has to act on them. These include a metadata database schema step, a
renamed setting, a new privilege that existing grants don't cover, and a call
that used to succeed and now fails. Those PRs get the `migration` verdict, and
the fixer adds an entry to the project's upgrade-notes page. For Unity Catalog
that's R14 (`reference/003-upgrade-notes`), which fills the
"Release notes and migration index" slot in `nav.yml`.

The page follows the latest-only rule
([docs-versioning.md](docs-versioning.md#upgrade-notes)). It covers one
upgrade, from the release the docs describe to the next one. It's rewritten
each cycle, and it's not a changelog: upstream's GitHub releases already are
one, and the page links them. Its fixed headings, in order, are *Before you
upgrade*, *Breaking and behavior changes*, *Configuration changes*, *New
privileges and securables*, and *Deprecations and removals*. Every entry
cites its upstream PR. The fixer creates the page from
`templates/upgrade-notes.md` at the cycle's first `migration` verdict, rather
than shipping an empty placeholder. The planned H39 "Upgrade an existing
deployment" stays release-neutral and links R14 for the release-specific
list.

## Trust model

- **Upstream text is untrusted input.** PR titles, bodies, and diffs come
  from any contributor. Every prompt treats them as data, and the orchestrator
  repeats that warning in each dispatch.
- **The agent can't publish.** No GitHub token reaches the agent step. The
  GitHub App token exists only in the steps that read the PR state and push
  after the gate. `blast_radius` denies pushes and `gh pr` commands (with
  `risky_action: DENY`, since nobody is there to answer an ASK). CEL policies
  keep the orchestrator and triager from writing and the fixer inside
  `content/`, and the workflow re-checks the paths on the final diff, shell
  writes included.
- **The agent definition comes from `main`.** The agent runs from the
  tracking branch's checkout, because skills are discovered from the agent
  directory's ancestors. The workflow first fails unless
  `.github/omnigent/` and the workflow file match `origin/main`, so no
  commit on the branch can change what runs on it.
- **The agent isn't sandboxed** (Omnigent's GitHub Actions guidance). It
  runs on an ephemeral runner with the repo, the model credential, and the
  network. The credential check in the gate is the last line of defense.

## Standalone, with a shared server as an option

Decided in [ADR-0004](../decisions/ADR-0004-omni-docs-doc-standalone-runs.md).
Omnigent always runs tools on the machine that invokes `omni run`. A shared
server (`--server <url>`) only adds a place to keep the session: its history,
a live view, `--resume`, and sharing. The CI run is standalone (`--no-session`,
with a local server inside the job). Its record is the PR, the commit
trailers, and the uploaded artifact, which includes the conversation log from
`--log`. Setting the `OMNIGENT_SERVER_URL` repo variable switches the run to
`--server`, but the unattended credential for that (machine tokens from
`/oauth/token`, or a Databricks service principal profile for a Databricks
Apps server) isn't wired yet. Treat it as a spike before turning it on.
Locally, `just omni-docs-doc` keeps a saved session, so you can watch it live.

## Provisioning

The workflow skips until `OMNIGENT_MODEL` is set. In the repo:

1. Create the environment `omni-docs-doc`, restricted to `main`.
2. Secret `DATABRICKS_TOKEN` and variable `DATABRICKS_HOST`: the workspace
   whose AI Gateway serves the model. The job writes them to
   `~/.databrickscfg`, where the `claude-sdk` harness resolves them.
3. Variable `OMNIGENT_MODEL`: the gateway's model id. Optional variables:
   `OMNIGENT_HARNESS` (to override `claude-sdk`) and `OMNIGENT_SERVER_URL`
   (see above).
4. A GitHub App installed on this repo with Contents and Pull requests write.
   Set variable `OMNI_DOCS_DOC_APP_CLIENT_ID` and secret
   `OMNI_DOCS_DOC_APP_PRIVATE_KEY`. The workflow uses the App, not
   `GITHUB_TOKEN`, because pushes and PRs made with `GITHUB_TOKEN` don't
   trigger `ci.yml`.
5. Dispatch once with `dry_run: true` and `max_prs: 5`, and read the
   artifact. Then dispatch for real.

The Omnigent version is pinned in the workflow (`OMNIGENT_VERSION`). Bump it
deliberately, because the policy paths and the spec format have moved between
releases.

## Adding a project

1. Add an entry to `projects.yml`: `upstream`, `stream`, `release_manifest`,
   `tag_prefix`, `skip_paths`, `evidence_paths`, and `upgrade_notes` if the
   project has an upgrade-notes slot in its `nav.yml`. Delta is listed with
   `enabled: false`.
2. Make sure the release-bump skill and `just bump-<project>` cover it.
3. Add a schedule entry or a matrix over the enabled projects to the
   workflow, which runs one project per invocation today.
4. If the upgrade notes don't fit the project, generalize the template
   (`templates/upgrade-notes.md` hard-codes Unity Catalog's frontmatter).
