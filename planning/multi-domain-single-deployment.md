# One deployment, three domains — a feasibility & design study

> **Status:** design / ideation. Feasible. This document is the deliverable.
> **Last updated:** 2026-07-22
> **Question:** Can one deployment + one backend serve
> `docs.openlakehouse.io`, `docs.delta.io`, and `docs.unitycatalog.io`, scoping
> the site down by the domain the visitor arrived from?

## TL;DR

**Yes — and most of the mechanism already exists.** The site already scopes all
content down to `delta` or `unitycatalog` via a derived predicate
(`site/src/scope.ts`), today driven by a user-picked `?scope=` query param. The
only new idea this study adds is: **derive that same scope from the request
host instead of the query param.** `docs.openlakehouse.io` is the unscoped
superset (`open-lakehouse` = the implicit "all"); `docs.delta.io` and
`docs.unitycatalog.io` are the two existing scopes, selected automatically.

No content is duplicated, no second backend is stood up, and the LikeC4 model
does not change. This is a routing/config change layered over an
already-multi-tenant content model — not a re-architecture.

---

## Why this is a good fit (grounding facts)

The pieces the question needs are already in place:

1. **The content is one corpus, three projects.** `content/` holds
   `open-lakehouse/` (2 pages), `delta/` (7 pages), and `unitycatalog/` (14
   pages) — Diátaxis docs sharing one frontmatter vocabulary and one remark
   pipeline. It is already authored as a single consolidated body of docs.

2. **A scope predicate already exists.** `site/src/scope.ts` defines a `SCOPES`
   registry (`delta`, `unitycatalog`) and `inScope(page, scopeId)`. A page is in
   scope if its `project` frontmatter matches **or** its effective LikeC4 model
   references intersect the scope's anchors (`deltaSpec` / `ucSpec`), expanded
   one hop over the stable altitude edges (`specifies` / `realizes` /
   `implements` / `consumes`). So `delta` catches delta-rs / Delta Spark pages
   even when they only reference an *implementation* of the Delta spec, not the
   spec itself. `open-lakehouse` is the implicit "all" — no filter.

3. **Scope already flows through the whole UI.** `filterByScope()` narrows every
   axis index; `withScope()` preserves the active scope across nav links;
   `useScope()` reads/writes it; `Shell.tsx` already applies a per-project accent
   (`data-accent`) driven by the active scope. The scope is a first-class,
   plumbed-through concept — not a bolt-on.

4. **The model already anchors the three.** In the LikeC4 model, Delta and Unity
   Catalog are `openSpecification` elements (`deltaSpec`, `ucSpec`) with
   `link`s to `https://delta.io` / `https://www.unitycatalog.io`, and
   `open-lakehouse` is the estate boundary that contains everything (ADR-0007).
   The containment the question assumes — `open-lakehouse ⊇ {delta, unitycatalog}`
   — is exactly how the model is already structured. Nothing about the domain
   split needs to be expressed as a new model tag or kind.

The consequence: the hard part (a correct, model-derived scoping predicate that
doesn't require per-page manual tagging) is **done**. What remains is choosing
the scope from the host and telling the CDN to serve all three domains from one
deployment.

---

## The design

### 1. Scope source: host → scope, param as override

Introduce a single resolver that picks the active scope in priority order:

```
resolveScope(host, searchParams):
  1. explicit ?scope=<id>   (kept — deep links, the DevPersonaSwitcher, previews)
  2. host → scope map        (docs.delta.io → delta, docs.unitycatalog.io → unitycatalog)
  3. ALL_SCOPE               (docs.openlakehouse.io and any other host → open-lakehouse)
```

The host→scope map is config, colocated with the existing `SCOPES` registry —
adding a `homeHost` field to each `Scope` keeps "adding a project is a
config-only change" (already the stated design goal of `scope.ts`). Example:

```ts
// scope.ts — add one field; the registry is otherwise unchanged.
export interface Scope {
  id: string;
  label: string;
  projects: string[];
  anchorIds: string[];
  accent?: "delta" | "unitycatalog";
  /** Host that auto-selects this scope (single-deployment multi-domain). */
  homeHost?: string; // "docs.delta.io" / "docs.unitycatalog.io"
}
```

`useScope()` changes from "read `?scope=`, else ALL" to "read `?scope=`, else
host lookup, else ALL". That is the **entire** application-code delta for the
core feature. Everything downstream (`filterByScope`, `withScope`, the accent,
the sidebar) already consumes `scopeId` and needs no change.

`window.location.hostname` is available client-side today; because the app is a
SPA (client-rendered, see below), reading the host in the browser is sufficient
and needs no server round-trip.

### 2. Serving three domains from one Vercel deployment

Vercel supports multiple custom domains on a single project natively — this is a
project-settings + DNS change, not code:

- Add `docs.openlakehouse.io`, `docs.delta.io`, `docs.unitycatalog.io` as
  domains on the one Vercel project.
- Point each domain's DNS (CNAME) at Vercel. We own all three domains, so this
  is unblocked.
- The existing `vercel.json` SPA rewrite (`/((?!assets/).*) → /index.html`) is
  **host-agnostic** and already correct for all three — every domain serves the
  same `index.html`, and the client resolves scope from `location.hostname`.

No per-domain build, no per-domain deploy. One artifact, three domains.

### 3. The canonical-URL / SEO seam (the one real design decision)

A single SPA served on three hosts means the *same page* is reachable at three
URLs (e.g. a Delta how-to at both `docs.delta.io/...` and
`docs.openlakehouse.io/...`). Two things to get right:

- **`rel=canonical` per page** must point at the page's *home* domain — a
  delta-scoped page canonicalizes to `docs.delta.io`, an open-lakehouse-only
  page to `docs.openlakehouse.io`. The scope predicate already computes a page's
  home project, so canonical is derivable, not hand-maintained.
- **Cross-scope links.** A `docs.delta.io` visitor who follows a link to an
  open-lakehouse-only concept either (a) stays on `docs.delta.io` but shows the
  page unscoped, or (b) is sent to `docs.openlakehouse.io`. Recommendation: keep
  navigation *within* the current host (option a) and rely on canonical tags for
  SEO — simpler, no cross-domain redirects, and the scope predicate already
  degrades gracefully to "show it" for out-of-scope pages when you choose to.

This is the only genuinely new surface. It is small and it is a rendering
concern, not an architecture concern.

### 4. What each domain shows

| Domain | Scope | Content shown |
|---|---|---|
| `docs.openlakehouse.io` | `open-lakehouse` (all) | every page, all projects — the superset |
| `docs.delta.io` | `delta` | pages whose `project=delta` **or** whose model refs touch `deltaSpec` (+1 hop: delta-rs, Delta Spark, Open Sharing…) |
| `docs.unitycatalog.io` | `unitycatalog` | pages whose `project=unitycatalog` **or** whose model refs touch `ucSpec` (+1 hop) |

Per-domain accent (`data-accent`) already follows the scope, so each domain
gets its project's visual identity for free.

---

## What does *not* need to change

- The LikeC4 model (`architecture/model/`) — the specs and boundary already
  encode the containment.
- The content (`content/`) — already tagged by `project` + model refs.
- The backend (Neon + Connect RPC review/release surface) — it is a single
  logical service; requests from all three hosts hit the same functions. Auth
  (Neon Auth / GitHub OAuth) is per-user, not per-domain.
- The remark pipeline, sidebar generation, or any of the five axis routes.

---

## Risks & open questions

1. **Auth callback origin (needs verification).** Neon Auth / the GitHub OAuth
   app registers redirect/callback URLs. A single OAuth app may need all three
   hosts registered as authorized origins/redirects, or the login flow pinned to
   one canonical auth host (e.g. always `docs.openlakehouse.io`) with the session
   shared. **This is the one item to confirm before committing** — cross-subdomain
   cookie/session behavior and the OAuth app's allowed-origins list. It is a
   config question, not a blocker to the architecture.

2. **Cross-domain cookies.** The three are sibling subdomains of *different*
   apex domains (`openlakehouse.io` vs `delta.io` vs `unitycatalog.io`), so a
   single cookie cannot span them. If in-page authed actions (voting, comments)
   are wanted on `docs.delta.io` as well, either (a) each domain runs its own
   login against the shared backend, or (b) authed actions live only on the
   canonical host and the scoped domains are read-only. Recommend (b) initially.

3. **SEO duplicate content** — handled by the per-page canonical tag (§3). Worth
   a follow-up to confirm canonical generation covers the axis-index pages, not
   just doc detail pages.

4. **SSR/prerender for scope.** Today scope is resolved client-side from the
   host — fine for a SPA. If we later want per-host static prerendering (better
   SEO, no client flash of unscoped content), Vercel can key a rewrite on the
   `Host` header to inject the scope, or we prerender per host. Not needed for v1;
   noted as the upgrade path.

---

## Verdict

Feasible, and cheap. The content model is already multi-tenant; the scope
predicate is already correct and model-derived; the UI already threads scope
end-to-end. The work is:

1. Add a `homeHost` to each scope and make `useScope()` fall back host → scope.
2. Add the three domains to one Vercel project + DNS.
3. Add per-page `rel=canonical` keyed on the page's home scope.
4. Confirm the Neon Auth / GitHub OAuth allowed-origins story for three hosts
   (the one thing to verify before building).

Items 1–3 are a small, well-scoped change over the existing site; item 4 is a
config verification. There is no re-architecture and no content duplication.
```

