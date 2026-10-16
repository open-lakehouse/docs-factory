---
title: The Agentic Lakehouse
slug: agentic-lakehouse
status: idea
tags: [lakehouse, agents, governance, observability]
series: The Composable Lakehouse
series_order: 9
author: Robert Pack
---

**Thesis:** agents are the hardest tenant a lakehouse will have. Everything the
earlier posts added (governance, observability, interoperability, governed
AI assets) is what makes it safe to let them in. This is the whole stack,
deployed end to end from one environment definition.

## Scope

- Agents as principals, not assets: they authenticate, get scoped credentials,
  and show up in traces and lineage like any other caller.
- Agent platform: `agent_platform` (omnigent) on the same gateway surface.
- Agent skills as a governed asset kind, distributed through Sharing (the new
  capability that skills surfaced in the model).
- Tools via MCP, and governed function calls through the catalog.
- End to end: one environment definition brings up catalog, storage, gateway,
  auth, policy, tracing, lineage, engines, notebooks, tracking, and agents.
  Recap the series as the diff that each post added.

## Trestle configuration

- The full stack: every role from the earlier posts + `omnigent`
  (`agent_platform`).
- Demo: an agent answers a question over governed tables. One of its requests
  is denied by policy, and the trace and lineage show exactly what it touched.

## Model hooks

- `omnigent`; `agentSkill` asset kind and Sharing (ADR-0005); the full
  deployment view.

## Cross-links

- *Trust in your Open Lakehouse* (why agents force governance to the platform);
  the Chef Casper arc for the hands-on version of an agentic app.

## Open questions

- Is this one post or a two-parter (the platform, then the A-to-Z deploy)?
- Which agent scenario: Casper's kitchen ops, or a neutral data-analyst agent?

**Prev:** *The Interactive Lakehouse*
