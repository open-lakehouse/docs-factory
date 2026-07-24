# Blog series (story arcs)

Some narratives span several posts that build on each other into a larger story.
This file is the one place that shows a whole arc and its order; each post also
records its own membership in its front matter (`series` / `series_order`).

**Estate source.** These arcs are the *blog-arc projection* of the estate-level
storyline in [`STORYLINE.md`](./STORYLINE.md) — that file owns the
consolidated "why" and per-repo positioning for the open-lakehouse (`olai`) estate;
this file decides which posts exist, in what order, and in which register. Defer to
`STORYLINE.md` for the estate framing rather than restating it here.

**Rule:** every post in a series must still **stand on its own** — a reader
landing mid-arc shouldn't be lost — while advancing the arc. Keep each arc's
through-line here so individual briefs don't drift from it. See
[`CONVENTIONS.md`](./CONVENTIONS.md) §7.

**Arcs differ by register, not topic.** The two arcs below split by *intent*:
**Building the Open Lakehouse** is architecture / technology walkthrough (the *why*
+ how we build it — argues a thesis and walks through the components, uses
diagrams), **Chef Casper's Ghost Kitchen** is hands-on how-to (the *how* — told
through one running fictional company). **Topic overlap across the two arcs is
expected and fine**: the same subject (governance, the store, the WASM engine) can
be *argued / walked through* in Building and *shown working* in Casper. When a post
reuses a topic covered in the other arc, **cross-link the counterpart** ("we argued
the why in X; here we build it") rather than duplicate it. Sort a brief into an arc
by intent, not by what it's about.

Entry format:

```markdown
## <Series name>
**Through-line:** one-line thesis of the whole arc.
**Posts (in order):**
1. <Title> — `blogs/<slug>/` — <status> — one-line role in the arc
2. …
```

## Building the Open Lakehouse

**Register:** architecture / technology walkthrough (the *why* + how we build it).
**Through-line:** how we build the open lakehouse stack — assembling open-source
engines and formats with our own custom components and frameworks (Trestle,
`olai-store`, the query/governance services). **Trust and security are first-class
threads throughout**, not the sole thesis: governance is argued as a platform-level
responsibility *and* the pieces that deliver it are walked through as architecture.
The governance foundation posts anchor the arc; the technology deep-dives (the
store, the codegen, the services) extend it; the DAIS demos continue the storyline.

**Posts (in order):**
1. Trust in your Open Lakehouse — `blogs/trust-in-your-open-lakehouse/` —
   drafting — the foundation: the three governance patterns (credential
   vending, server-side planning, trusted compute) and why agents force
   governance to the platform level.
2. Fine-grained access control is a cross-service contract —
   `blogs/cross-repo-abac/` — brief — the ABAC deep-dive: how policy travels
   catalog → query service → neutral engine (author / serve / resolve / enforce),
   defending the "plug in, don't fork" architecture the foundation post's thesis
   implies.
3. _(open — further follow-ons and the DAIS demos; likely the crawl/walk/run to
   cross-catalog governance and/or the IRC labels proposal.)_

**Candidate future entry (not yet an arc member):** the `olai-store` architecture
idea (`IDEAS.md`) — a TAO-inspired resource store adjusted for the lakehouse, with
security handled by default — is a natural fit for the broadened arc: a custom
component of the stack walked through as architecture, with the security-by-default
thread running through it. It is the design-side counterpart to the Casper
golden-path post that *uses* the store; if promoted, cross-link the two rather than
duplicate.

## Build on Unity Catalog

**Register:** practical integrations with Unity Catalog
**Through-line:** Unity Cagtalog Securables are building blocks which allow building
much richer and user aligned experiences. This series features simple services
and examples that leverage the different UC surfaces to create enhanced experiences.

**Posts (in order):**
1. Bytes Proxy and the in-browser wasm query engine
2. Volumes + Files API.

## Kernel Inside

**Register:** practical integrations with Unity Catalog
**Through-line:** THe kernel architecture is simplifying how
Engines integrate with open table formats. Showcase how.

**Posts (in order):**
1. Bytes Proxy and the in-browser wasm query engine
2. Volumes + Files API.

## Chef Casper's Ghost Kitchen

**Register:** hands-on how-to (the *how*).
**Through-line:** grow a real application from a single proto file into a
production-shaped, dual-protocol system — following one fictional company
(Chef Casper's Ghost Kitchen) through its stages, so each post is a concrete
step in one continuous build story.

**Posts (in order):**
1. One proto file, a whole app — the Trestle golden path —
   `blogs/trestle-golden-path/` — brief — the opener: model the driver check-in
   domain in proto, run one command, get server + Connect + clients + web app on
   one port. Establishes the running example the arc builds on.
2. _(open — later steps grow the same app: adding governance, a UI, storage, etc.)_

**Candidate future entries (not yet arc members):** the WASM
(`blogs/wasm-lakehouse-preview/`) and headless-UI
(`blogs/headless-lakehouse-ui/`) briefs each have a how-to spine and are natural
Casper steps once the running example needs an in-browser preview or a UI. They
stay standalone until then. Narrative source for the arc now lives in
`blogs/trestle-golden-path/source/` (moved here from the trestle repo) plus
`reference-architecture/Caspers.md`.
