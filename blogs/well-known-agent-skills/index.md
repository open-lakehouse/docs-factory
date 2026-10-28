---
title: "Teach the agent at the front door: lakehouse skills at /.well-known"
slug: well-known-agent-skills
status: idea
tags: [agents, lakehouse, devrel]
author: Robert Pack
post_type: announcement
audience: platform and DevRel engineers who already publish llms.txt and want agents to build on their stack, not just read about it
summary: openlakehouse.io publishes an Agent Skill at /.well-known/agent-skills/, so any agent can install a tested way to build an open lakehouse.
---

**Thesis:** docs sites already serve two readers: humans get HTML, agents get
`llms.txt` and `.md` twins. Both of those describe a lakehouse. The next step is
to serve the *procedure*: a skill an agent installs from the site and then
follows to build one. Its ground truth is the same tested examples and Trestle
environments the docs are built from.

Intended primary target: `openlakehouse` (the open-lakehouse docs and the
`openlakehouse-io` site), cross-posted to `unitycatalog` and `delta` if the
skill covers their docs too.

## Prior art: an emerging convention, not a standard

Write this as "people are converging on it". Don't call it a standard (§6).
Checked 2026-10-27; re-check every claim when the brief is written.

- **The draft spec.** [Agent Skills Discovery via Well-Known URIs](https://github.com/cloudflare/agent-skills-discovery-rfc)
  (Cloudflare, Draft v0.2.0, updated 2026-03-12) builds on RFC 8615. A site
  serves `/.well-known/agent-skills/index.json` with
  `$schema: https://schemas.agentskills.io/discovery/0.2.0/schema.json`. Each
  entry has `name`, `description`, `type` (`skill-md` or `archive`), `url`, and a
  sha256 `digest`. The index is the first stage of progressive disclosure:
  name and description first, then `SKILL.md`, then the files it bundles.
  v0.1 used `/.well-known/skills/` with a `files` array, and some sites still
  serve both paths.
- **Upstream status.** The proposal to adopt it into the Agent Skills standard,
  [agentskills/agentskills#255](https://github.com/agentskills/agentskills/issues/255),
  is still open. [agentskills.io](https://agentskills.io) doesn't document
  discovery yet.
- **Who already serves it:** [Neon](https://neon.com/.well-known/agent-skills/index.json)
  (plain `SKILL.md` entries, and the legacy path too),
  [Vercel](https://vercel.com/.well-known/agent-skills/index.json) (archives
  hosted on GitHub releases), [Supabase](https://supabase.com/.well-known/agent-skills/index.json),
  [Cloudflare's developer docs](https://developers.cloudflare.com/.well-known/agent-skills/index.json)
  (tarballs), and Clerk. Smaller sites link the index from `llms.txt` or from a
  `Link: </.well-known/agent-skills/index.json>; rel="agent-skills"` header.
- **Who reads it.** The [`skills` CLI](https://github.com/vercel-labs/skills)
  (`npx skills add <url>`) tries `/.well-known/agent-skills/index.json` first,
  then the legacy path.

## Implementation sketch (not built)

- **One skill, `build-open-lakehouse`, shipped as an `archive`.** Its
  references are where the value is, so it can't be a lone `SKILL.md`. It picks
  a deployment pattern, generates the Trestle environment for it, and points to
  the tested snippets for each engine. Like `docs-write`, it states only what
  the repo can prove: the model, the compatibility journeys, the environment
  registry, and the release pins.
- **The emitter publishes it.** It writes `index.json` and the archive with its
  `digest`, next to the sitemap and `llms.txt` in `emit/docs/discovery.mjs`.
  `llms.txt` links the index, and `vercel.json` sends the `rel="agent-skills"`
  header. The archive is generated output like the `.md` twins, so it isn't
  committed (AGENTS.md convention 4).
- **Its relation to the lakehouse MCP** (`docs/design/lakehouse-mcp.md`): the
  skill is installed once and doesn't change until the next release; the MCP
  answers live and can generate. Once the MCP exists, the skill can tell the
  agent to use it.
- **Freshness.** A release bump changes the pins the skill cites, so the
  `release-bump` review should cover the skill like a page.

## Model hooks

- The `agentSkill` asset kind (ADR-0005). Here, a skill is something the docs
  site publishes, not only something the catalog governs.

## Cross-links

- *The Agentic Lakehouse* (`agentic-lakehouse`): skills as a governed asset,
  shared through the catalog.
- The *Volumes* idea in `IDEAS.md`: a skill is a directory of files, so a volume
  could serve one.

## Open questions

- Where is it hosted? openlakehouse.io has no docs site emitted from this repo
  yet, so the index needs either that site or the `openlakehouse-io` repo.
- One umbrella skill, or a parent with child skills the way Neon splits `neon`
  and `neon-postgres`? (For example: pick a pattern, add an engine, add
  governance.)
- How do we test it? Ideally an agent eval that installs the skill from the
  emitted site and brings up a working environment.
