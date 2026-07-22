# Interactive docs site — planning & findings

> **Status:** planning / ideation. No implementation yet — this document is the
> deliverable and the basis for further planning.
> **Last updated:** 2026-07-12

## Context

`docs-factory` is the **builder-agnostic content source** for the restructured
`delta.io` / `unitycatalog.io` sites. Content is plain Markdown/MDX in `content/`;
the Astro + Starlight app in `site/` is an explicit *throwaway preview harness*,
not the publishing target.

The bet worth testing: now that agents make full sites cheap to build, should we
drop Astro/Starlight and hand-build a React site to make the docs richer and more
interactive (hover diagrams, filterable matrices, an eventual Delta log explorer,
a roadmap board)?

Priority interactive directions: **interactive diagrams**, **feature matrix +
timelines**, **Delta log explorer (embed contract only)**, and a **roadmap
component** — a headless component driving quarterly-style visualizations of the
Delta & Unity Catalog roadmaps with feature-request / voting / GitHub-issue
integration.

**Platform (decided):** site hosted on **Vercel**; backend platform **Neon
(Postgres)**; login via **Neon Auth** (managed, Better-Auth-powered, GitHub OAuth).

---

## What already exists (grounding facts)

The content pipeline has **three framework-independent contracts** that any builder
decision must preserve — they are the real asset, not the SSG:

1. **Neutral frontmatter vocabulary** — `summary / diataxis / project / engines /
   delta_features / status / prerequisites / snippets`
   (`site/src/content.config.ts`). Content never carries Starlight-specific
   frontmatter; the SSG tolerates the contract, the content owns it.
2. **Snippet fences** — ` ```lang file=… start=… end=… ` resolved from tested
   `examples/`, with rules mirrored between the remark plugin
   (`site/src/plugins/remark-code-snippets.mjs`) and the Python `docsnip` CI tool
   (`tools/docsnip/…/snippetcheck.py`). Docs never inline code.
3. **Sidebar ordering** in each `content/<project>/_meta.yaml`
   (`site/src/sidebar.mjs`) — ordering lives with content, not the builder.

Also relevant:
- The **live in-browser Delta+DataFusion query engine already exists** as
  `deltalake-wasm` (`../delta-rs/crates/wasm`), consumed by mangrove
  (`@open-lakehouse/query`) for UC table previews. A future log explorer / query
  playground is *real*, not hypothetical — reason to keep the door open, not to
  build it now.
- The `<Tabs>`/`<TabItem>` engine-tab pattern is already used in
  `content/delta/how-to/read-a-delta-table.mdx` — the existing "island" precedent.
- The feature-matrix data source is `research/delta-matrix.json` (secondary;
  unverified — see `research/table-formats/report.md`).
- The `content/delta/explanation/delta-kernel-architecture.md` "C-shaped API /
  three layers" prose is the strongest interactive-diagram candidate.

---

## Recommendation: keep Astro, add React islands (do NOT hand-build a full React site)

| Dimension | Astro + React islands (recommended) | Full custom React site |
|---|---|---|
| Content pipeline (3 contracts above) | **Reused as-is** | Rebuilt (MDX loader, snippet resolver, `_meta.yaml` nav) |
| Routing / nav / search / theming | **Free** (Starlight + pagefind) | Rebuilt from scratch |
| Interactivity ceiling | High — any React component mounts as an island in MDX | Highest (marginally) |
| JS shipped to reader | **Zero by default**; only islands hydrate | Whole-app hydration unless SSG'd carefully |
| Effort to first interactive component | ~1 day (`@astrojs/react` + one component) | Weeks (rebuild platform, then components) |
| Risk to the "builder-agnostic" promise | **None** — islands are `site/`-local | High — a bespoke site tempts content→framework coupling |

The interactivity we want (hover diagrams, filterable matrices, embedded explorer,
roadmap board) is **component-level, not layout-level**. Astro islands deliver
exactly that: interactive React where you want it, static HTML everywhere else, and
the content pipeline stays untouched. A full custom site pays a large platform-
rebuild cost to gain freedom the docs don't need — and threatens contracts #1–#3,
the repo's core value.

**Revisit the full-React option only** if we later want the *whole* site to be an
app-like experience (global state, cross-page live query sessions). The log
explorer alone does not justify it.

**The roadmap's stateful/voting parts do NOT change this.** Islands hydrate and
`fetch`; the roadmap island calls the backend at runtime. Only the read-your-write
voting UX needs a server — the SSG shell does not.

### What this means concretely (next session)

- Add `@astrojs/react` to `site/` and a `site/src/components/` dir. Islands are a
  `site/` concern; **content stays pure** — it references a component the same way
  it already imports `<Tabs>`.
- Keep every island **degradable**: it must render meaningful static content (an
  `<img>` / table / `<details>`) with JS off, so content value never depends on
  hydration and the builder-agnostic promise holds.

---

## Roadmap component (headless) — design

The one component with a **data structure + backend** — and the repo already models
most of its domain.

### Reuse the existing trestle tracker proto — do not invent a new schema

`proto/docs_factory/tracker/v1/models.proto` already defines the roadmap domain:
- **`Project`** — "Unity Catalog", "Delta Lake" (the two roadmaps).
- **`Release`** — the roadmap item, *already* with quarterly-vague timing: a target
  **window** (`target_earliest`..`target_latest`) + graded **`ReleaseConfidence`**
  (`SPECULATIVE` "sometime in Q3" → `ESTIMATED` → `SCHEDULED` → `CONFIRMED`) +
  **`ReleaseStatus`** (`PLANNED`/`IN_PROGRESS`/`SHIPPED`/`CANCELLED`). Exactly
  "quarterly, sharpening over time."
- **`Task`** — a work item under a release, **already carrying a typed GitHub
  reference**: `GithubIssueRef { repo, number }` + `ref_url` / `ref_status`.
- **Associations** wire release → tasks, release → artifacts.

The tracker service (`proto/.../service.proto`) generates Axum routes + typed
clients via trestle. **This is the roadmap's backend.** No new API framework.

> `proto/` is marked "leave alone" in `AGENTS.md`. Read it for the view model; any
> edit needs explicit sign-off. The decisions below avoid needing a proto change.

### The headless component contract

A **headless React component**: a hook + typed view model with **zero built-in
visuals**, so the same data drives multiple renderings. The view model is
*projected* from the proto (not the wire types) to keep the UI decoupled:

```ts
type Confidence = "speculative" | "estimated" | "scheduled" | "confirmed";
type Status     = "planned" | "in_progress" | "shipped" | "cancelled";

interface RoadmapItem {
  id: string;
  project: "delta" | "unitycatalog";
  title: string;
  version?: string;
  window: { earliest?: string; latest?: string }; // ISO; may be quarter-only
  quarter?: string;            // derived label, e.g. "Q3 2026", for column bucketing
  confidence: Confidence;
  status: Status;
  issues: { repo: string; number: number; url: string; state?: "open" | "closed" }[];
  votes?: { count: number; hasVoted: boolean }; // present only when voting is enabled
}

// Headless: returns data + actions, renders nothing.
function useRoadmap(project): {
  items: RoadmapItem[]; byQuarter: Record<string, RoadmapItem[]>;
  loading: boolean;
  vote(id): Promise<void>;
  requestFeature(input): Promise<{ issueUrl: string }>;
}
```

Renderers (thin, swappable, all degrade to a static list): **quarter board**
(columns = quarters, cards = items, confidence as card treatment), **window
timeline** (horizontal bars spanning `earliest..latest`; wider = less certain),
**status kanban**. The static build can pre-render current roadmap data so the page
has content with JS off; the island then hydrates for votes / live state.

### Voting + feature-request + GitHub issues

- **Link / open GitHub issues** — render `issues[]` as chips; a "Request this
  feature" / "Open an issue" button deep-links to a prefilled GitHub new-issue URL
  (`.../issues/new?title=…&labels=roadmap`). **No backend** — ships first.
- **Voting — DECIDED: GitHub-native 👍 reactions.** No `Vote` resource, no vote
  store, **no proto edit**. "Votes" = the 👍 reaction count on the linked GitHub
  issue via the GitHub API; the vote action adds the viewer's reaction (using the
  logged-in user's token from Neon Auth — see below — or a deep-link when logged
  out). The count lives on GitHub, which developers already trust.
- Sequence: issue-linking (no backend) → read-only reaction counts → one-click
  react once GitHub login exists.

---

## GitHub login / authenticated section (Neon Auth + Vercel)

The audience is developers, so **"Sign in with GitHub" is the natural identity**.
Given Vercel hosting + Neon backend, **Neon Auth** is the fit — don't hand-roll
OAuth. Findings from the Neon docs (sources at bottom):

- **Neon Auth is a managed REST auth service** (Better Auth) storing users,
  sessions, OAuth accounts in Postgres (`neon_auth.user`, `neon_auth.account`),
  queryable with SQL. **It hosts the OAuth callback / token exchange**
  (`{NEON_AUTH_BASE_URL}/callback/github`) — we do **not** run an auth server.
- **Callable straight from a browser island** via `@neondatabase/neon-js/auth`
  (`authClient.signIn.social({ provider: "github" })`). No bespoke Node backend;
  branch-aware; same-region as the DB.
- **GitHub setup**: register a GitHub OAuth app (GitHub needs *custom* creds —
  only Google ships shared dev creds), enter client id/secret in the Neon console,
  register redirect URI `{NEON_AUTH_BASE_URL}/callback/github`, allowlist the Vercel
  origin(s).
- **The GitHub token is retrievable** — `account.getAccessToken()` /
  `authClient.getAccessToken({ providerId: "github" })`, auto-refreshed. So one-click
  **👍-react-to-an-issue** is feasible: request the `public_repo` scope and call the
  GitHub reactions API with that token. Logged out → read-only counts + deep-link.

**Architecture fit:**
- **No custom auth backend, and still no proto change.** Auth is managed; the
  tracker is only the *roadmap data* API, unrelated to sessions.
- **Auth is entirely an island concern.** The static Astro shell (on Vercel) stays
  anonymous; "Sign in" and logged-in affordances live in React islands calling Neon
  Auth at runtime. Logged-out readers get full docs + read-only counts + deep-link
  fallbacks — **login is purely additive**.
- **The few server-side calls** (cached reaction counts to dodge GitHub rate limits;
  any token-holding call) fit as **Vercel serverless/edge functions** in the same
  project — no separate deployment.

**Staging** (each independently shippable):
1. Anonymous docs + prefilled "open an issue" deep-links — no backend.
2. Read-only 👍 counts via a cached Vercel function (unauthenticated GitHub API).
3. GitHub login via Neon Auth → in-page one-click react + personalization
   (watched items, "notify me when this ships").

---

## Interactive component catalog (ranked by value ÷ effort)

### Tier 1 — build first (high value, self-contained, data already exists)

0. **Roadmap board (headless component)** — *flagship, designed above.*
   Quarter / window / kanban renderings of the Delta & UC roadmaps, issue chips, a
   prefilled "Open an issue" button. Ships in stages (static + issue-linking → live
   data + reactions). The only component exercising state + API.
1. **Feature / engine support matrix** *(highest ROI)* — filterable/sortable table:
   rows = features, columns = engines, cells = support + source link. Data generated
   at build from `research/delta-matrix.json` (no hand-authored data). Fills the `reference/table-features.md` stub. Degrades to a
   static table.
2. **Interactive delta-kernel architecture diagram** — the "C-shaped API" + "three
   layers" as an SVG; hover Table/Engine APIs / kernel / engine to highlight + reveal
   a callout, click to pin. Pure SVG + React state. Degrades to the static prose.
3. **Protocol / feature timeline** — protocol reader/writer versions and when
   features landed (deletion vectors, column mapping, variant, liquid clustering…).
   Hover a feature → requirements + doc link. Same matrix data as #1.

### Tier 2 — after Tier 1 proves the island pattern

4. **Time-travel / version visualizer** — interactive strip of table versions; click
   a version to see what "read as of version N" returns. Pairs with
   `query-a-table-as-of-version.md`. Static/mock data first (no WASM dependency).
5. **Write-path / checkpoint flow diagram** — animated step-through of a commit
   (write files → append log entry → checkpoint). Same SVG+state technique as #2.

### Tier 3 — later, likely cross-repo

6. **Delta log explorer (embed contract only)** — the big one; lives in a *separate
   repo*. Here we only specify the docs-side embed contract: a self-contained web
   component / iframe / React package the island mounts, fed a table URL — so
   docs-factory takes a dependency rather than owning the explorer. Real engine
   (`deltalake-wasm`) exists in `../delta-rs` when ready.
7. **Live WASM query playground** — *deprioritized.* Engine exists; not planned now.

---

## Decisions (resolved)

- **Framework** → keep Astro + Starlight, add React islands.
- **Voting** → GitHub-native 👍 reactions on linked issues. No vote store, no proto edit.
- **Identity** → GitHub OAuth via Neon Auth (managed; no hand-rolled auth server),
  built as a general authenticated section, staged so logged-out docs stay functional.
- **Hosting** → static Astro on Vercel; small server needs as Vercel functions; Neon
  Postgres + Neon Auth as backend.

## Decisions still open

- **GitHub OAuth app**: who owns the app org; which scope (`public_repo` for in-page
  reactions, vs `read:user`/none if login is identity-only).
- **GitHub API rate limits** for reaction counts: Vercel function cache TTL; whether
  to use an app token for higher limits.
- **Publishing target runs Astro?** Confirm delta.io/unitycatalog.io will run Astro
  so islands carry over — otherwise components must be framework-portable (plain web
  components) rather than Astro-specific.
- **Tracker service reachability**: deployed/reachable at runtime, or defs-only today?
  The roadmap's live-data step needs a running tracker; the static + issue-linking
  step does not.

## Files referenced (for implementation)

- `site/src/content.config.ts` — neutral frontmatter contract (preserve).
- `site/src/plugins/remark-code-snippets.mjs` + `tools/docsnip/…/snippetcheck.py` — snippet contract (preserve).
- `site/src/sidebar.mjs`, `content/*/_meta.yaml` — nav ordering (preserve).
- `content/delta/explanation/delta-kernel-architecture.md` — source for diagram #2.
- `research/delta-matrix.json` — data for #1 & #3.
- `content/delta/reference/table-features.md` — stub the matrix (#1) fills.
- `content/delta/how-to/read-a-delta-table.mdx` — existing island (`<Tabs>`) precedent.
- `proto/docs_factory/tracker/v1/{models,service}.proto` — roadmap domain + backend
  (read-only; "leave alone" per `AGENTS.md`).

## Verification (acceptance criteria for the first component)

1. `just preview` renders the feature-matrix island; filtering by engine works in-browser.
2. With JS disabled, the same page still shows a complete static table (degradation check).
3. Editing `research/delta-matrix.json` and rebuilding changes the rendered matrix
   (data-source-of-truth check — no duplicated data).
4. `docsnip check` still passes and no Starlight/React import leaked into `content/`
   (builder-agnostic check).

## Sources

- Neon Auth overview — https://neon.com/docs/auth/overview
- Neon Auth: set up OAuth — https://neon.com/docs/auth/guides/setup-oauth
- Better Auth — OAuth / provider access tokens — https://better-auth.com/docs/concepts/oauth
