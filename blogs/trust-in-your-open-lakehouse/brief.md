---
title: Trust in your Open Lakehouse
slug: trust-in-your-open-lakehouse
status: draft
date: 2026-07-02
tags: [governance, lakehouse, agents, unity-catalog, delta-lake, data-lineage]
series: Building the Open Lakehouse
series_order: 1
target: company blog
---

# Brief: Trust in your Open Lakehouse

> Imported 2026-07-02 from a Google Doc ("Trust in your Open Lakehouse",
> doc id `11kgyZLDQV86E5WZ95zPApzX6GZtGMsXweQJunFyWfMQ`, tab "Tab 2" /
> `t.vbe84l5wtgj8`). The other tab ("AI / Drafts") is an alternative
> AI-generated draft and was treated as noise per the author. The imported
> prose is in `draft.md`. The doc's embedded diagram PNGs were regenerated from
> their D2 sources: `assets/*.d2` (source of truth, from
> `workflows/trust/diagrams`) render to `assets/*.svg` via
> `blogs/render-diagrams.sh`, and `draft.md` references the local SVGs.

## 1. Hook / thesis

Governance in the lakehouse should be a **platform-level** responsibility, not a
catalog-centric one. As data platforms mature and — especially — as agentic AI
enters the picture, the catalog-as-focal-point model breaks down: policy must be
enforced across the full execution lifecycle, with context/session-aware
evaluation and a control plane spanning both data and compute.

This is the **foundation** post the more detailed follow-ons reference. It
deliberately contradicts the core premise of the Snowflake blog that the catalog
(specifically the Iceberg REST Catalog) is the focal point for governance.

## 2. Audience

Senior data/platform architects and technical decision-makers evaluating how
governance, security, and trust work in an open lakehouse — readers comfortable
with catalogs, table formats, and access control who are starting to grapple
with agentic workloads. Assumes familiarity with lakehouse building blocks
(catalog, query engine, object storage, open table formats); explains the
zero-trust PIP/PDP/PEP vocabulary and the three governance patterns from first
principles.

## 3. Tone / voice

First person, opinionated, architect-to-architect. Confident and experience-led
("in my role as chief architect…", "one of the greatest inflection points I ever
experienced"). Uses architecture diagrams and a running analogy ("boxes are
easy, arrows are hard") as connective tissue. Takes a clear stance against the
catalog-centric governance model — name it and argue it, don't hedge.

## 4. Key takeaways

- The valuable, hard problems in a maturing platform are the cross-cutting
  concerns — trust, security, governance, reliability — not the individual
  services ("boxes are easy, arrows are hard").
- Today's lakehouse governance rests on three patterns, mapping to zero-trust
  PIP/PDP/PEP: **credential vending**, **server-side planning**, **trusted
  compute** — each extending the granularity/reach of the one before.
- Trust is established by credentials *or* by identity attestation (learning
  verifiable facts about the subject); agents challenge our existing
  human/system trust-and-accountability model.
- The hardest agentic governance problem isn't read-time access control — it's
  **taint propagation** after read time: sensitive data in an execution context
  leaking through normal downstream operations (tool calls, external APIs,
  writes).
- Therefore governance must move to the platform: runtime enforcement across the
  full execution lifecycle, context/session-aware policy evaluation, and a
  control plane spanning data and compute.

## 5. Outline

1. **Trust in your Lakehouse** (intro) — the architect/manager diagram, "boxes
   are easy, arrows are hard," and why cross-cutting concerns dominate as a
   platform matures. *(diagram)*
2. **Governance in today's Lakehouse** — common vocabulary; zero-trust
   PIP/PDP/PEP; map to the three patterns. *(diagram)*
   - **Credential vending** — catalog vends down-scoped, short-lived creds.
     *(2 diagrams)*
   - **Server-side planning** — client asks the catalog to pre-plan a query;
     enables file/column/row-level control. *(diagram)*
   - **Trusted compute** — trust the engine to enforce policy; how trust is
     established (credentials vs. identity attestation); human vs. system
     principals and accountability. *(diagram)*
3. **Governance in the agentic Lakehouse** — taint propagation; why the catalog
   lacks the context to decide on tool use; governance as a platform-level
   responsibility. *(diagram)* Ends on the three "means" bullets.

## 6. Source material

- *Code (cross-repo):* the concrete mechanics behind the three patterns live in
  our own stack — cite with pinned refs when the draft makes specific claims:
  - `unitycatalog` — credential vending / server-side planning / catalog policy
    surface (pin a ref).
  - `delta-kernel-rs`, `delta-rs` — table read path, metadata/statistics that
    motivate server-side planning (pin a ref).
  - Delta Sharing — cited in the alt draft as exercising the server-side-planning
    pattern for secure external exchange (confirm + pin).
- *Prior art / what this responds to:* the **Snowflake blog** positioning the
  catalog (IRC) as the governance focal point — this post argues the opposite.
  Link it and characterize its claim fairly.
- *External refs:* NIST SP 800-207 Zero Trust Architecture
  (https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.800-207.pdf);
  policy engines named in the draft — Open Policy Agent, OpenFGA, "CDAR"
  (verify this name/expansion before publish); Iceberg REST Catalog + the
  **tags/labels proposal** (candidate CTA, see §7).

## 7. Call to action

**Still open (flagged in review).** Author + reviewer (Michelle Leon) agreed the
CTA should point at the **labels/tags proposal** (Iceberg REST Catalog tags).
Decide: point concretely at the IRC tags/labels proposal, or keep it generic and
tee up the follow-on posts. Recommendation: name the labels proposal and frame
it as the first concrete step, since this is the series foundation.

## 8. Publishing target / format

Company blog. Foundation post for a series ("Building the Open Lakehouse" — this
post anchors the arc's governance/trust thread); subsequent posts go deeper into
the stack's architecture and the DAIS demos continue the storyline. Needs:
final CTA; author/date/status metadata (the doc's header table was empty).
Diagrams are committed SVGs rendered from D2 sources in `assets/` — the
publishing target may want them re-exported (e.g. PNG, or inline) to fit its
asset pipeline. Confirm PM sign-off before publish.

## 9. Verification / accuracy notes

- **Cut-off sentence (reviewer-flagged, still present in `draft.md`):** the
  Trusted-compute paragraph beginning "However, if one can exert the required
  controls over any user environment…" trails off; the Server-side-planning
  section ends abruptly at "Luckily we can do better." Finish both thoughts.
- Verify the policy-engine names, especially **"CDAR"** (likely a typo/wrong
  expansion — confirm what was meant).
- Typo to fix in draft: "maintaining teh filtering fleet".
- Re-anchor any product-specific or performance claim on a public source; this
  originates in a Databricks context — keep internal/pre-release detail out.
- Confirm the Delta Sharing / server-side-planning characterization against
  public docs before asserting it.

## 10. Open questions / risks

- **Thesis implications (reviewer Michelle Leon):** where does this lead the
  reader — toward "each catalog enforces natively + exchange/sync governance
  metadata" (cross-catalog governance), or is it a tee-up for ABAC with a
  follow-on unpacking the crawl/walk/run to cross-catalog governance? Resolve
  the landing before finalizing, since it sets up the series.
- Which follow-on posts this foundation references (name them once scoped) and
  how the DAIS demos map to them → a `Building the Open Lakehouse` entry
  in `SERIES.md` once post 2 earns a brief.
- **COI / disclosure:** Databricks-authored, argues against a named competitor's
  (Snowflake) model — keep the critique technical and fair, disclose affiliation
  per the publishing target.
