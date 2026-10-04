# Agent access to review feedback

> **Status:** phase 1 shipped (local agents, including local Omnigent sessions).
> Hosted runs are designed below but not built.

## Context

Most authoring happens through agents, but reviewer feedback lives in the review
database. Until now an agent saw a comment only if someone pasted it in. This
gives an agent in a git checkout three abilities. It can fetch open review threads
from the review site, see exactly which file and lines each one is about, and
reply once it has acted. Resolution stays with the reviewer.

## Shape

```
agent (Claude Code / Omnigent claude-native / Codex)
  │  stdio MCP: list_feedback · get_thread · reply_to_thread
  ▼
tools/review-feedback  (runs from the checkout; same core as the CLI)
  │  Connect RPC, Authorization: Bearer dfr_…
  ▼
review API (Neon Function)  ── reads/writes ──▶  review DB
```

The MCP server runs **next to the checkout**, not as a hosted service. Locating a
thread means reading the working tree, and a hosted server would have to hand raw
anchors back for the agent to resolve itself. The CLI (`just feedback …`) exposes
the same core for scripts and for agents without MCP. `pull` writes per-page
markdown into `.review/` for agents that only read files.

## Authentication: personal access tokens

The browser bearer is a 15-minute Neon Auth JWT from an interactive GitHub login,
so it can't serve an agent. A token is `dfr_<32 random bytes>`, and only its
sha256 is stored (`api_token`).

- **Acts as its owner.** Every request re-derives the Viewer from the allowlist,
  admin role, and scoped grants, through the same path the JWT uses
  (`neonViewerForIdentity`). Removing someone from the allowlist revokes their
  tokens' access too. Unknown, expired, or revoked tokens return Unauthenticated,
  never a silent fallback to anonymous.
- **Narrowed by scopes**, enforced in `authInterceptor` before any handler runs
  (`tokenMayCall`):
  - `feedback:read` covers the read RPCs (drafts, content, comments, sources,
    versions).
  - `feedback:reply` covers `CreateComment` **only with a `parent_id`**. A token
    can't open new threads.
  - Everything else is denied: resolve, approvals, release, admin, and token
    management itself. New RPCs are denied until added deliberately.
- **Provenance.** Comments written with a token are `via_agent`, and the UI shows a
  "via agent" badge.
- **Getting one.** `review-feedback login --url <site>` runs a browser loopback
  flow. The CLI listens on `127.0.0.1:<port>` and opens `/cli-auth?port&state`.
  After sign-in and consent the site mints the token and redirects it to the
  loopback, and `state` binds the callback to that run. The site accepts only a
  numeric port, so a crafted link can't send a token elsewhere. Tokens can also be
  created and revoked by hand at `/tokens`.
- **Storage.** Config lives in `~/.config/docs-factory/review-feedback.json`
  (0600), with `DOCS_REVIEW_URL` / `DOCS_REVIEW_API_URL` / `DOCS_REVIEW_TOKEN`
  as overrides. The file is the primary path because GUI-launched harnesses don't
  inherit shell env. The MCP server re-reads config on every call, so a login
  mid-session takes effect without a restart.

## Agent state

Each thread is presented with a derived state:

| State | Meaning |
|---|---|
| `open` | No agent reply yet, or a human replied after the agent. |
| `awaiting-reviewer` | The newest comment is `via_agent`. |
| `resolved` | Closed by a reviewer. |

`list_feedback` defaults to `open`, which makes reruns idempotent: a thread the
agent answered drops out until a human responds.

## Locating a thread

`locate.ts` uses content-core (`site/src/content-core`) for identity, heading
slugs, normalization, and line hashes. These are the same functions the site and
server anchor with, so ids and hashes agree by construction.

1. Ref to file: blogs map to `blogs/<slug>/index.md`. Docs walk
   `content/<project>/<bucket>/` and match `docIdentity`, which handles `NNN-`
   prefixes, folder mode, and `slug:` overrides.
2. Prose:
   - Find the heading by `anchor_slug`, falling back to the fingerprint (heading
     renamed). Its section runs to the next heading of the same or higher level.
   - Find the quote in that section by normalized, markdown-stripped,
     line-joined text, so it matches across soft breaks and through
     emphasis/links. Fall back to the first 60 characters.
   - Precision is `quote`, then `section`, then `file`.
3. Code: `code_path` plus `line_hash`. Stay on the original line if its hash
   still matches, otherwise take the nearest line with that hash.
4. Drift: `git diff --quiet <authored_git_sha> -- <path>`. When it reports a
   change, the agent is told to read around rather than trust the numbers.

## Wiring

- `.mcp.json` points at `tools/review-feedback/scripts/mcp.sh`. The launcher
  finds bun outside a login shell, installs deps on first run, and logs to stderr
  because stdout is the MCP channel. `.claude/settings.json` pre-enables the
  server, so an Omnigent `claude-native` session (no interactive approval
  prompt) gets it.
- The skill `.claude/skills/review-feedback` runs the loop: fetch, locate, edit
  per AGENTS.md, check, open a PR, then reply with the PR link. It never resolves.

## Deferred: hosted runs

Nothing here blocks moving the same agent into a Databricks-hosted Omnigent
**managed sandbox**:

- **Identity:** a dedicated allowlisted bot user owns a read+reply token, stored
  as a Databricks secret and injected as `DOCS_REVIEW_TOKEN`. Its replies are
  attributed to the bot. A later option is to accept Databricks
  service-principal tokens verified against workspace JWKS, mirroring the GitHub
  OIDC path in `server/src/auth/github-oidc.ts`, which removes the long-lived
  secret.
- **Agent config:** an Omnigent agent declaring the same stdio MCP and skill.
  Guardrail policies would block pushes to `main` and any review tool beyond
  list/get/reply, as defense in depth behind the token scopes.
- **Triggering:** an Omnigent scheduled task (`execution_target:
  managed_sandbox`, at most hourly) that opens at most one `feedback/*` PR per
  run. `awaiting-reviewer` plus a check for an open PR keeps it idempotent.
  Later, `server/src/notify.ts` could start a session on new comments instead.
- **Checkout-less agents:** the same core over streamable HTTP, inside the
  Phase 4 docs MCP ([agentic-docs.md](agentic-docs.md)) or a Databricks App,
  returning raw anchors without `locate`.
