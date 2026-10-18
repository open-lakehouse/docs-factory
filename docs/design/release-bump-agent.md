# A release-bump agent (designed, not built)

The `release-bump` skill (`.claude/skills/release-bump/`) runs a bump and its
[release review](docs-versioning.md#release-review) in one session. This note
covers the Omnigent agent that would take over once bumps run unattended, for
example when an upstream release triggers one. Until then the skill is enough,
and building the agent early would mean maintaining two copies of the
procedure.

## Shape

It would live at `agents/release-bump/`: an orchestrator that sequences and
never writes, and one sub-agent per role, each with the narrowest write scope
its job needs.

| # | Phase | Agent | Writes | Output |
|---|---|---|---|---|
| 1 | Bump | `bumper` | `content/*/release.yml`, pins (via `just bump-*`, `docsnip versions --fix`) | rewritten pins, test-lane results |
| 2 | Upstream diff | `upstream_differ` | nothing | "what's new" list from the tag diff and release notes |
| 3 | Claims review | `claim_verifier`, one per release-sensitive page plus one for the grep hits | nothing | claims-table rows: page, claim, verdict, evidence |
| 4 | Fix | `fixer` | `content/` only | claim edits, R01 updates, `docsnip compat --fix` |
| 5 | PR | orchestrator (git only) | nothing | commits, PR with the claims table |

Phase 3 fans out because each page is reviewed on its own against the same
phase 2 list, and parallel read-only verifiers keep each context small. A
cross-harness verifier could take the claims marked `unsure`.

## Gates and guardrails

- The author confirms the claims table before phase 4. A wrong `holds` costs
  less than an unreviewed edit to a `ready` page.
- `blast_radius` with `gate_pushes: true`: pushes and `gh pr create` ask.
- `no_prose_writes` on the orchestrator. The verifiers can't write files at
  all.
- No agent changes `status:`. Re-approval stays with the review app.

## The skill is the seam

The procedure stays in the skill and the versioning design. Each role gets
`release-bump` through its `skills:` filter and runs its own section. Only
role-specific steps go in a bundled skill under
`agents/release-bump/agents/<role>/skills/`. The release-sensitive pages table
in `docs-versioning.md` is the verifiers' work list, so it has to stay
current: a page that adds a release-sensitive claim joins the table in the
same change.

## When to build it

- Bumps happen often enough that one person running the skill is a
  bottleneck, or a scheduled trigger opens them.
- The release-sensitive table grows past what one context reviews well.
