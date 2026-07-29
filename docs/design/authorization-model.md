# Authorization model — a Cedar PDP for the review server

> **Status: living design doc / feasibility study.** Not yet implemented. This is
> the reference we tighten as the review server's permission surface grows. Update
> it in place as decisions firm up; promote the settled "why" into an ADR
> (`docs/decisions/`) when we commit to building.

## Context — why this doc exists

The review/release server (`server/`) has grown a real authorization surface. What
started as two guard helpers now decides: who can comment, who can approve, who can
release, who sees an unpublished draft, who can dismiss whose approval, and — since
the maintainer admin surface (#91) — who can manage the allowlist, discover
registered users, and erase a user's personal data.

Today those decisions are **scattered and implicit**:

- Two guards in `server/src/auth/context.ts` — `requireAllowlisted` (reviewer or
  maintainer) and `requireMaintainer` — called at the top of ~28 of the 30 RPC
  handlers in `server/src/services/review.ts`.
- Plus **ad-hoc escalation** inside handlers: `dismissApproval` calls
  `requireAllowlisted` then conditionally `requireMaintainer` when the target isn't
  the caller's own approval; `manageAllowlist` enforces a "can't remove the last
  maintainer" invariant imperatively.
- Plus a **content-visibility rule duplicated three times**: the `listDrafts` SQL
  filter, the `getDraftContent` code gate, and the frontend reconciler in
  `site/src/lib/content-visibility.ts` — the rule "public ⟺ frontmatter `ready`
  AND the `content_revops.published` latch set."
- Plus a **non-human principal**: `registerVersion` is guarded by a shared build
  secret, not viewer auth — a second, unrelated authorization mechanism.

There is **no single policy source and no explainability**: a denial is an opaque
`PermissionDenied`, and "what are all the rules?" can only be answered by reading
every handler.

We are DevRel, and governance/policy is a technology we actively showcase. The
estate's own governance story
([`architecture/design/governance.md`](../../architecture/design/governance.md))
already frames access control in NIST 800-207 terms — **PAP / PDP / PEP / PIP** —
with Cedar as the policy engine. This doc proposes making the review server a
**concrete, first-party instance of that model**: extract the scattered checks into
a small, declarative, validatable [Cedar](https://www.cedarpolicy.com/) policy set,
evaluated by a server-side **PDP**, with the RPC handlers as the **PEP**.

**Intended outcome:** one policy set is the source of truth for the app's
permissions; denials become explainable; and we get a shipping governance showcase
that mirrors the abstract lakehouse model with a real TypeScript implementation.

## Feasibility (confirmed)

Cedar ships official, production-grade npm packages (mid-2026):

| Package | Version | Role |
|---|---|---|
| `@cedar-policy/cedar-wasm` | 4.11.2 | low-level WASM bindings (browser + Node); Node CJS entry `/nodejs` |
| `@cedar-policy/cedar-authorization` | 0.2.0 | `CedarInlineAuthorizationEngine` wrapper; `isAuthorized(request, entities)` → `{type:'allow', authorizerInfo:{determiningPolicies}} \| {type:'deny'} \| {type:'error', message}` |

Cedar is the engine behind AWS Verified Permissions. Both packages run in Node; the
wrapper avoids hand-managing the `.wasm` asset (see *Risks*).

**Scope of this cut:** server-side PDP + written showcase, **real enforcement**. The
frontend keeps calling the same RPCs unchanged — **no browser WASM yet** (a later
cut can share the same policy set client-side for UX gating; see *Deferred*).

---

## The permission surface today (the thing we're modeling)

30 RPCs on `ReviewService`
(`proto/docs_factory/review/v1/review_service.proto`). Guards as of #91:

| Guard | Count | Notes |
|---|---|---|
| conditional public / allowlist | 2 | `ListDrafts`, `GetDraftContent` — public iff `ready && published` |
| `requireAllowlisted` | 19 | the reviewer working set (comments, threads, review state, revops, requests, versions…) |
| `requireMaintainer` | 6 | `ReleaseContent`, `RequestChangesOnPublished`, `ManageAllowlist`, `ListAllowlist`, `ListRegisteredUsers`, `EraseUser` |
| inline escalation | 1 | `DismissApproval` — allowlisted for own, maintainer for another's |
| build secret (non-viewer) | 1 | `RegisterVersion` — build pipeline, not a human |
| public | 1 | `GetViewer` |

The interesting parts for a policy model are **not** the flat RBAC (`isAllowlisted`
/ `role == maintainer`) — those are one-liners. They are the **ABAC / relationship**
rules:

- **content visibility** — resource attributes (`frontmatterStatus`, `published`)
  decide, and the rule is duplicated 3×;
- **dismiss ownership** — `approval.approverLogin == principal.login` OR maintainer;
- **release precondition** — `content.hasOpenRequiredRequests` blocks release (today
  a `FailedPrecondition`, distinct from a role denial);
- **last-maintainer invariant** — an allowlist mutation may not drop the maintainer
  count to zero;
- **non-human principal** — the build pipeline registering a version.

These are exactly what a policy engine expresses better than nested `if`s.

---

## The (action, resource) taxonomy — the organizing spine

Cedar authorizes on an explicit **`Action`** against a **resource** for a
**principal**. So the model's backbone is a taxonomy that assigns every RPC a single
`(action, resource)` pair. Principals, resources, and actions:

### Principals
- **`User`** — a human viewer. Attributes: `role` (`"anonymous" | "reviewer" |
  "maintainer"`), `login`, `userId`, `isAllowlisted`.
- **`Service`** — a non-human caller (the build pipeline). Attribute: `kind`
  (e.g. `"build"`). This is how `RegisterVersion` joins the same PDP instead of
  living as a separate secret check. *(Decision: model the build principal
  first-class — one PDP for human and machine.)* The shared-secret check remains as
  **authentication** (proving the caller is the build service); Cedar then handles
  **authorization** (what a `Service` of kind `build` may do).

### Resources
`Content` (draft/version — carries `area`, `slug`, `frontmatterStatus`,
`published`, `hasOpenRequiredRequests`), `Comment`/`Thread`, `Approval` (carries
`approverLogin`), `ReviewRequest`, `RevOps` metadata, `ContentEvent`, `Version`,
`Allowlist` entries, `RegisteredUser`, and a `System` singleton for global admin
actions.

### Actions → RPC map
| Action | Resource | RPC(s) | Rule class |
|---|---|---|---|
| `ViewContent` | Content | `GetDraftContent`, `ListDrafts`* | ABAC visibility |
| `Comment` | Content/Thread | `CreateComment`, `ListComments`, `ListRecentComments`, `ResolveThread`, `UnresolveThread`, `MarkThreadSeen`, `GetSourceFile` | RBAC allowlist |
| `Transition` | Content review-state | `TransitionReview` | RBAC allowlist |
| `Approve` | Approval | `RecordApproval` | RBAC allowlist |
| `DismissApproval` | Approval | `DismissApproval` | ABAC ownership |
| `Release` | Content | `ReleaseContent` | RBAC maintainer + precondition |
| `SetRevOps` | RevOps | `SetPriority`, `SetTargetReleaseDate` | RBAC allowlist |
| `RequestReview` / `CancelReview` / `ListRequests` | ReviewRequest | `RequestReview`, `CancelReviewRequest`, `ListReviewRequests` | RBAC allowlist (cancel: requester-or-maintainer) |
| `ViewTimeline` | ContentEvent | `ListContentEvents` | RBAC allowlist |
| `ReopenPublished` | Content | `RequestChangesOnPublished` | RBAC maintainer |
| `ManageAllowlist` / `ViewAllowlist` | Allowlist / System | `ManageAllowlist`, `ListAllowlist` | RBAC maintainer + last-maintainer invariant |
| `DiscoverUsers` | System | `ListRegisteredUsers` | RBAC maintainer |
| `EraseUser` | User | `EraseUser` | RBAC maintainer |
| `ViewVersions` | Version | `ListVersions`, `GetVersionTree`, `ProductChanges` | RBAC allowlist |
| `RegisterVersion` | Version | `RegisterVersion` | **Service** principal (build) |
| `ViewSelf` | — | `GetViewer` | public |

\* `ListDrafts` visibility stays SQL-enforced — see *Consolidation*.

---

## Consolidation: taxonomy-first, keep RPCs fine-grained

The question that prompted this doc: as we tighten authz and introduce actions +
resources anyway, **should we consolidate the 30 RPCs?**

**Decision: keep RPCs fine-grained — one action per RPC — and let the (action,
resource) taxonomy, not the method count, be what we consolidate around.**

Rationale — a single action per RPC gives a **clean 1:1 mapping to a Cedar
`Action`**, which is precisely what makes the PDP call trivial and the policy set
readable. The tempting move — collapse the 8 `List*` RPCs into one
`List(resourceType, filters)` — is an **anti-pattern here**: it would force the
authorization decision *back inside* the handler as a `switch (resourceType)`,
re-scattering exactly what we're extracting. A parameterized mega-RPC trades a clean
policy surface for a murky one.

Where consolidation *is* right: **only fold RPCs that already multiplex actions.**
`ManageAllowlist` already dualizes add/remove/update-role behind an enum — that's
fine, it maps to one `ManageAllowlist` action with the sub-verb as context. We do
**not** chase the theoretical 30→21 reduction.

Net: the taxonomy above *is* the consolidation — it collapses 30 methods into ~16
distinct actions over ~11 resources, without touching the wire API or re-scattering
authz.

---

## The Cedar model (sketch)

Author as canonical files (`server/src/authz/schema.cedarschema`,
`policies.cedar`) — the source for `cedar validate` in CI — then surface to the
engine as **inlined string constants** so no runtime `fs` read of `.cedar`/`.wasm`
happens on the Neon Function (see *Risks*).

Policies reproducing today's behavior (illustrative):

```cedar
// RBAC — reviewer working set
permit (principal, action == DocsFactory::Action::"Comment", resource)
when { principal.isAllowlisted };

// RBAC — maintainer admin/release actions
permit (principal,
  action in [DocsFactory::Action::"Release",
             DocsFactory::Action::"ReopenPublished",
             DocsFactory::Action::"ManageAllowlist",
             DocsFactory::Action::"ViewAllowlist",
             DocsFactory::Action::"DiscoverUsers",
             DocsFactory::Action::"EraseUser"],
  resource)
when { principal.role == "maintainer" };

// ABAC — content visibility (the rule duplicated 3× today)
permit (principal, action == DocsFactory::Action::"ViewContent", resource)
when { principal.isAllowlisted ||
       (resource.frontmatterStatus == "ready" && resource.published) };

// ABAC — dismiss ownership
permit (principal, action == DocsFactory::Action::"DismissApproval", resource)
when { principal.role == "maintainer" ||
       (principal.isAllowlisted && resource.approverLogin == principal.login) };

// Release precondition — modeled as forbid for the audit story;
// surfaced at the call site as FailedPrecondition (not PermissionDenied).
forbid (principal, action == DocsFactory::Action::"Release", resource)
when { resource.hasOpenRequiredRequests };

// Non-human principal — the build pipeline
permit (principal, action == DocsFactory::Action::"RegisterVersion", resource)
when { principal is DocsFactory::Service && principal.kind == "build" };
```

**Open modeling questions (to tighten later):**
- **Last-maintainer invariant** — Cedar decides on the *proposed* request; "would
  this leave zero maintainers?" needs a fact (`system.maintainerCount`) supplied as
  a PIP-style attribute, or it stays an imperative post-check. Lean: supply the
  count as context and model it as a `forbid` for the showcase; confirm feasibility.
- **`CancelReviewRequest`** requester-or-maintainer rule — model like dismiss
  (ownership OR maintainer) once we confirm the requester identity is on the
  `ReviewRequest` resource.
- Normalize `login`/`approverLogin` to lowercase in entity builders to match the
  DB's case-insensitive matching.

---

## Integration seam (when we build)

- **New `server/src/authz/` module**: `schema.cedarschema` + `policies.cedar`
  (canonical), `policy-source.ts` (inlined strings), `engine.ts` (build the engine
  once at cold-start + `decide()` + a cold-start smoke self-test), `actions.ts`,
  `resources.ts` (build principal/resource entity slices from the `Viewer` + DB rows
  already in scope), `audit.ts`.
- **Keep the guards as the seam.** `requireAllowlisted` / `requireMaintainer` stay
  **synchronous** thin wrappers for the pure-RBAC sites (their predicate is the same
  boolean the PDP makes) — so none of the ~28 call sites change signature. Add an
  **async `authorize(ctx, action, resource, ctx?)`** only for the ABAC/precondition
  sites (`getDraftContent`, `dismissApproval`, `releaseContent`, and the
  last-maintainer check) — those are already inside `async` handlers.
- **`ListDrafts` stays SQL-enforced** (the filter must live in SQL for
  pagination/ordering); Cedar's `ViewContent` policy is the *spec*, SQL the
  *enforcement*, and a consistency test ties them.
- **`RegisterVersion`**: keep the shared-secret check as authentication → mint a
  `Service` principal → authorize via Cedar.

## Explainability / audit (the showcase payoff)

- `toConnectError` keeps the top-level message stable (no frontend change) but
  attaches Cedar's `determiningPolicies` + a human reason in ConnectError metadata.
  A release-precondition `forbid` maps back to `FailedPrecondition` to preserve the
  wire contract.
- `audit.ts` emits a structured decision line (principal, action, resource, allowed,
  determiningPolicies) — the "watch the PDP decide" artifact the current system
  lacks. **Fail closed:** engine error → deny + error-level log.

## Risks & mitigations

- **WASM asset dropped by the neonctl/esbuild bundle** (Neon Functions, Node 24) —
  the one that can silently break prod. Mitigate: the wrapper (vendors WASM), inlined
  policy strings (no runtime fs read), a cold-start smoke self-test, and a
  preview-deploy authz self-check that **gates the merge**.
- **ESM/CJS friction** — server is `"type":"module"` / NodeNext; use the wrapper's
  ESM path, avoid `cedar-wasm/nodejs` CJS.
- **Sync→async guard mismatch** — keep the two RBAC guards sync (call sites
  untouched); only ABAC sites gain `await authorize()`.
- **Release error-code contract** — precondition is a Cedar `forbid` but must surface
  as `FailedPrecondition`; `toConnectError` inspects the determining policy.

## Showcase docs (when we build)

- Extend
  [`architecture/design/governance.md`](../../architecture/design/governance.md)
  with a "docs-factory review PDP" section — a *built* instance of the PAP/PDP/PEP/PIP
  model it already describes abstractly.
- Add an ADR (`docs/decisions/`, next in sequence) recording the settled decisions:
  Cedar over ad-hoc guards, wrapper over raw wasm, server-side over browser,
  fine-grained-RPC / taxonomy-first, Service principal for the build pipeline.
- The parked `blogs/cross-repo-abac/` post already uses Cedar + PDP vocabulary — add
  the review server as a concrete "one we actually run" example.
- One deployment-layer LikeC4 `role` (review server realizes governance PDP+PEP) via
  the `update-architecture` skill. Don't expand the logical layer.

## Verification (when we build)

- `bun test` PDP fixtures per rule class (reviewer can comment / anon can't; anon
  sees only `ready && published`; maintainer releases only when no open required
  requests; own-vs-other dismiss; build `Service` can register; last-maintainer
  blocked). Assert `determiningPolicies` names.
- A `consistency.test.ts` proving the `ListDrafts` SQL branch and the Cedar
  `ViewContent` decision agree across the (allowlisted × status × published) grid.
- CI: `cedar validate` + a drift check that `policy-source.ts` matches the canonical
  `.cedar`/`.cedarschema`.
- The preview-deploy WASM self-check gates the merge.

## Deferred

- Browser-side Cedar (share the policy set client-side for UX gating).
- Migrating `reviewer_allowlist` into Cedar entities.
- Routing all handlers through async `authorize()` (vs the sync-wrapper seam).
- Aggressive RPC consolidation (explicitly rejected above; recorded for posterity).
