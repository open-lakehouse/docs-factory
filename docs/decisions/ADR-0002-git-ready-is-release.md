# ADR-0002: Git `ready` is the release; review approval is the signal to set it

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-06 |
| Supersedes | — |
| Superseded by | — |

## Context

Publication used to be the **intersection** of two axes: git frontmatter
`status: ready` (author intent) and a DB `content_revops.published` latch that a
maintainer set with `ReleaseContent`. `ready` also *started* review: the server
derived NEEDS_REVIEW from it.

In practice the axes had drifted apart:

- **Emission was already git-only.** `just emit-docs`, `llms.txt`, the `.md`
  twins, and the UC docs sync on merge to main all select `status: ready`
  DB-free (`isPublic()` in `site/src/content-core/frontmatter.mjs`). The latch
  gated only the factory app, which became login-gated and review/admin-only in
  #153, so it gated nothing a reader sees.
- **Review happens before `ready`, not after.** Drafts are iterated in the repo
  and reviewed in the app while still `draft`. Agents work the threads through
  the review-feedback MCP. An approval is the natural point to say "ship it",
  so it was odd for `ready` to be the *entry* into review.
- **Some content should never ship.** Detailed feature lists and compatibility
  matrices are worth reviewing, and agents can read them like shared memory. But
  they never belong on delta.io or unitycatalog.io, and the old vocabulary had
  no way to say so.
- Reviewers also wanted to **ask for content that doesn't exist yet**, in
  context, and to **comment on a page as a whole** rather than on a heading.

## Considered Options

- **Keep the intersection.** Make the emitters consult the DB latch, so release
  is a DB action again. That breaks the DB-free emit build, makes main's
  deploys depend on the review DB, and keeps two sources of truth for "is this
  live".
- **Git `ready` is the release; DB approval signals it.** The review layer
  records outcomes (comments, requests, approvals, change requests). An
  approval tells the author or an agent to set `status: ready`, and that
  change merged to main is the release. RELEASED is derived, not stored.
- **Write approvals back to git.** The server commits `status: ready` itself on
  approval. That gives the review server write access to the repo and bypasses
  PR review of the change that actually ships.

## Decision

We chose **git `ready` is the release; DB approval signals it.** The emitters
already behave this way, so the change makes the model match the system and
removes a latch that gated nothing.

The model:

| Git `status` | Meaning | Emitted |
|---|---|---|
| `idea` | earliest reviewable stage | never |
| `draft` | being written and reviewed | `--drafts` previews only |
| `ready` | approved for release; merged to main **is** the release | always |
| `private` | reviewable in the app, never released | never |

The review state is derived on every read (`deriveReviewState`):

| State | Derivation |
|---|---|
| NONE | no review activity |
| NEEDS_REVIEW | an open review request (no longer derived from `ready`) |
| CHANGES_REQUESTED | a stored change request newer than the latest approval |
| APPROVED | active approvals meet the preconditions, or a maintainer override. On a draft this means "set `ready`" |
| RELEASED | the latest version registered from main is `ready` |

A change request outranks RELEASED: the page stays live, since git owns the
release, but the follow-up shows. Only CHANGES_REQUESTED and the maintainer
APPROVED override are stored. `ReleaseContent`, `RequestChangesOnPublished`, and
the `published` latch are removed (migration 0006). `RegisterVersion` logs
`released` / `unreleased` timeline events when a main version moves onto or off
`ready`.

**Private content has no approval axis.** It is never released, so there is
nothing to approve. `RecordApproval` and the approved override reject it. A
reviewer can still be asked to review it; `MarkReviewed` satisfies their
request. Its state is only NONE, NEEDS_REVIEW, or CHANGES_REQUESTED.

**The approval → `ready` step is advisory.** Agents read it through the
review-feedback `status` tool. A non-blocking CI job (`check-ready`) warns when a
PR sets `ready` on a page without an approval, and the dashboard lists pages
"released without approval". Nothing hard-blocks a merge on the DB.

**Content requests live in the DB, and the accepted backlog stays in git.** A
reviewer files a request under a nav section trail (docs) or a blog series. A
maintainer accepts or declines it. An agent turns an accepted request into a
`planned:` slot carrying `request: <id>` in `content/<project>/nav.yml` (or
`blogs/IDEAS.md`), opens a PR, and marks the request done.

**Comments have a scope.** A `document` thread is about the whole page: it has
no section or selector and is never orphaned by re-anchoring.

**Blog release follows the same rule.** Blogs are delivered by the `blog-emit`
skill today. Automating it means a workflow on push to main that, for each blog
whose `status` became `ready` and that names a `target`, runs the emit core and
opens or updates a PR in the target site repo (the `uc-docs-sync.yml` pattern),
recording `.emitted.json`. That workflow is not built yet; the trigger it will
use is the one this ADR defines.

## Consequences

### Positive

- One source of truth for "is this live": git on main. The emitters, the app,
  and CI agree by construction.
- Releasing goes through a PR, so the change that ships is reviewed like any
  other change.
- `private` gives shared, reviewable reference state a home that can never
  leak to a public site.
- Agents have a clear loop: work the threads, read approvals, set `ready`,
  open a PR; and for requests, add the planned slot and mark it done.

### Negative / Trade-offs

- Nothing stops a `ready` flip without an approval. The CI warning and the
  dashboard make it visible; they don't prevent it.
- Unpublishing is a git change (move the page off `ready`), not a button.
- Preview DB branches register PR heads, so a preview shows a page as RELEASED
  as soon as its PR sets `ready`: "would be released", not "is live".
