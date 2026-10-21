# GEO report: Whose agent is it anyway?

## Reader questions
| Question | Answering passage | Probe: cited today | Our edge |
|---|---|---|---|
| Q1 Share a custom agent without admin rights? | intro + § "So does everyone update the same agent?" lead | omnigent.ai/docs (collaborate, custom-agents), AGENTSPEC | The full non-admin team procedure (one source, re-add, fork old sessions, remove copies). The probe found none |
| Q2 Shared session: do I get their agent? | § "Sharing a session shares the agent, not the keys" lead | omnigent.ai/docs/collaborate, releases/0.16.0 | Access vs ownership, plus the reusable-copy answer (§ "Agents travel by copy") |
| Q3 Does my copy follow the original? | § "Agents travel by copy, on purpose" lead + table | none documented | Frozen copy, no provenance, pinned to source; the share/fork/launch table |
| Q4 Merged change missing from shared session? | § "Sharing a session…" para "That 'bound to it' matters" | AGENT_YAML_SPEC (main) | Git → install → session binding diagnostic; same-name upload and install stay separate |
| Q5 Update an agent without creating a new one? | § "Updating in place is built in now" (2nd sentence) + command table | programmatic docs (PATCH + ETag) | `omnigent agent add` re-add (v0.18.0) vs `omni run` vs PATCH, in one table |
| Q6 Two agents with the same name? | `:::warning[Two agents, one name]` | AGENT_YAML_SPEC (`name` is display only) | Why duplicates appear (owner+name ID, `omni run` uploads, cross-user copies) and how to remove by ID |

## Applied
- Version check — § "Every agent has exactly one owner": "since v0.15.0" (#7750) is correct. The pinned CHANGELOG lists #7750 under v0.15.0 (2026-09-22). The probe's 0.16.0 hit is a different PR, #8481, marked **Breaking** ("Only session owners can manage MCP servers or replace agent bundles"). I kept the v0.15.0 citation and added one clause linking omnigent.ai/releases/0.16.0, which is the page answer engines already cite.
- Resolved the UNVERIFIED marker — § "So does everyone update the same agent?", the fork bullet. Three pinned sources: AGENT_YAML_SPEC L629–630 (a new version "does not rewrite existing sessions"); CHANGELOG v0.17.0 #8795 (`switch-agent` returns 410, "fork the session into another agent instead"); fork route routes_core.py L3539–3542 (`body.agent_id` makes the fork bind that agent). CHANGELOG v0.16.0 #8046 also fixes forking into a custom agent from the same account. Since the sources do say a fork can take a different agent, I removed the marker. "onto" became "into" to match upstream's wording.
- Probe gap 3 (duplicate-identity cause) — `:::warning[Two agents, one name]`: the lead sentence now names `omni run` uploads as a second source of same-name agents, so the callout covers both causes.
- Entity name in lead — § "Sharing a session…": "A shared session" became "A shared Omnigent session", so the lead stands alone when lifted.

## Skipped
- Answer-first lead — § "Updating in place is built in now": the first sentence ("Omnigent now does what we built our own tooling for.") is setup, and the answer comes in the second, with a version and a link. I left the order alone (voice). The two sentences lift together.
- Intro length — about 70 words, a little over 60. It already answers the title's question and carries the server-agent exception. Trimming it would cut the stance (voice).
- Hard-fact version in intro — the version facts live in the `:::tldr` (v0.19.0). Adding one to the intro would add weight without adding an answer.
- `:::tldr` — already 5 fact-rich bullets. No change.
- Other UNVERIFIED markers (picker absence, A → B with two accounts, manage-level re-share, private-repo install) — left as instructed.
- FAQ — not added. This is an essay, so an FAQ would be forced.

## Gaps the post doesn't fill
- Import bundle / web "Import" path (probe Q1): the post covers `agent add` but not the web Import bundle flow, or what the recipient owns after an import. The author could add a line to the command table if import differs from `agent add`.
- PATCH + ETag concurrency (probe Q5): the post names `PATCH /v1/agents/{id}` but not the ETag / `If-Match` requirement or the `agent_config_edit` capability check that engines already surface.
- Observed two-account behaviour: the remaining UNVERIFIED markers need a run with two accounts on the hosted server.
- Fork-into-agent via the UI/CLI: the sources back the REST `agent_id` field. Whether the web fork dialog or `omni run --fork` lets you pick the installed agent isn't shown. A how-to step would make the migration advice runnable.

## Publish-target proposals
- Meta description: `summary` unchanged (159 chars, answer-first, names Omnigent). It stays within the 160-char limit.
- FAQPage candidates: none (opinion piece).
- HowTo: no.
- Entities for `about`/`mentions`: Omnigent; Omnigent CLI (`omnigent agent add`, `omni run`); Omnigent sessions (fork, share levels read/edit/manage); GitHub.
