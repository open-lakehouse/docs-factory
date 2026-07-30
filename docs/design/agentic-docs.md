# Agentic-optimized documentation site — design & phased plan

**Status:** design. Phase 0 (SEO-shell prerender), **Phase 1** (.md twins +
`:::tldr`, site llms.txt, sitemap/robots, RSS, `.md` content negotiation, 308s),
and **Phase 3** (runnable-script linking) have **shipped**. Phases 2 (C4 model
integration) and 4 (hosted MCP) are not yet built.
**Scope:** cross-cutting — `site/`, `emit/`, `content/`, `blogs/`, `architecture/`,
`tools/docsnip/`, plus a new `mcp/` package.
**Last updated:** 2026-07-30.

Companion to [`build-pipeline.md`](./build-pipeline.md) (the parsing/artifact
mechanics this plan extends) and [`information-system.md`](./information-system.md)
(how content joins the estate model — tags / `references:` → LikeC4 → entity
pages, backlinks, llms.txt). This document is about making those artifacts
**first-class for LLM/agent consumption** and applying the SEO practices that
also benefit AI crawlers. See also [`interactive-docs-site.md`](./interactive-docs-site.md)
for the site's original feasibility study.

## Context

The documentation site (`site/`) is a **client-rendered Vite 8 + React 19 SPA**,
deployed to Vercel via the **Build Output API** (`.vercel/output/`). Until Phase 0
of this plan, every route resolved to a bare `index.html` shell (`<div id="root">`
+ one `<title>`, no meta), because
[`gen-vercel-config.mjs`](../../site/scripts/gen-vercel-config.mjs) routes
everything except `/api/*` and filesystem assets to `/index.html`. **So crawlers
and non-JS agents received an empty shell for every page — no content, no
metadata.** That was the foundational gap.

We want to make the site first-class for LLM/agent consumption *and* apply the SEO
practices that also benefit AI crawlers, and to go further by leveraging two
assets we already maintain: the **LikeC4 architecture model** (a 46-element
knowledge graph in [`architecture/dist/model.json`](../../architecture/dist/model.json),
bound to doc pages via frontmatter `explains`/`references`) and our
**git-committed, unit-tested PEP 723 runnable scripts** (colocated with tutorials,
parsed authoritatively by
[`tools/docsnip/src/docsnip/scriptmeta.py`](../../tools/docsnip/src/docsnip/scriptmeta.py)).

**Intended outcome:** an agent (Claude/Cursor/etc.) can discover our docs via
`/llms.txt`, fetch clean markdown twins of any page, pull the surrounding C4
architectural context, and follow a link to a runnable, CI-verified example it can
execute — while search engines index rich, prerendered HTML.

### Decisions

- **Site is public.** The GitHub login gate is temporary; the final site exposes
  **everything viewable-as-anonymous, regardless of login status** — it is a
  public documentation site. So the agent-facing corpus (`.md` twins, `/llms.txt`,
  MCP read tools) is **openly readable, no auth**.
- **Index on frontmatter `status: ready`, not the DB `released` gate.** The
  `released` approval state lives in the review DB; consulting it at build time
  would force build-time DB requests. Instead the build-time corpus keys on the
  git-authoritative `status: ready` frontmatter (exactly what
  [`build-llmstxt.mjs`](../../site/scripts/build-llmstxt.mjs) already does). A
  `ready` page may briefly precede its DB `released` state; that skew is accepted
  to keep authoring/deploy DB-free — the same trade-off llms.txt already makes.
- **MCP is not read-only-docs alone, and not on the review Function.** Beyond
  read-only doc/concept/example tools, the MCP server exposes a **generative
  "stack topology" tool** backed by the sibling `trestle` repo's
  `olai-stack-topology` crate compiled to **WASM** (generate Docker Compose /
  Envoy configs from selected platform capabilities). Because that adds a real
  compute + dependency surface (a WASM artifact, coupling to a sibling Rust
  build), the MCP server lives in its **own dedicated Neon Function**, separate
  from the review Function — keeping the review app's dependencies and this
  server's complex logic cleanly apart. See Phase 4.
- **Prerender approach:** **SEO-shell prerender** (not full react-dom/server SSG).
- **Frontmatter `summary` is the one exposed description; TL;DR stays a body
  construct.** The meta description, OpenGraph/Twitter, the `/llms.txt` entry, and
  the MCP `get_doc` summary all come from frontmatter `summary` (stable,
  single-purpose, always prose). A TL;DR / key-takeaways box —
  [`blogs/QUALITY.md`](../../blogs/QUALITY.md) calls it "the single most-quoted
  block" for AI — is authored **in the body** and rendered nicely, but is **not**
  extracted as the description. It is marked with a first-class **`:::tldr`
  directive** (alongside `:::callout` / `::::journey`), so it parses and renders
  unambiguously and never leaks into the auto-derived description. When `summary`
  is absent, the description falls back to the first substantial prose paragraph;
  `head.mjs`'s `firstParagraph` already skips `:::`-directive blocks, so a
  `:::tldr` is skipped by construction — no Phase 0 change needed. The `:::tldr`
  renderer is Phase 1 emitter work (see Phase 1a). Rejected alternatives: making
  TL;DR a description fallback (couples the exposed summary to an optional,
  historically inconsistent block) and a `key_takeaways:` frontmatter list
  (duplicates the in-body box and doubles author maintenance).

### Cross-cutting principles

- **`content-core` owns identity/URLs; the emitter owns rich rendering.** Every
  new generator resolves identity/URLs through `site/src/content-core/*.mjs`
  (`walk`, `frontmatter`, `identity`, `vocab`), like `build-llmstxt.mjs` does. But
  the reader-optimized `.md` twins are produced by the **emitter pipeline**
  (`emit/`) — the same machinery that renders the sibling sites — via a new
  `md-twin` target, NOT by re-flattening annotations in content-core. New shared
  metadata logic (head/JSON-LD) lands as new content-core modules.
- **`status: ready` gating** stays the build-time visibility key for the
  public/agent corpus. No review DB at build (Phases 0–3 are DB-free & static).
- **One PEP 723 parser.** `scriptmeta.py` stays authoritative; the JS build shells
  out to a docsnip CLI JSON command rather than forking the parser.
- **`config.json` (via `gen-vercel-config.mjs`) is the single place** for response
  headers (`X-Robots-Tag`, `Content-Type`, `Vary`), 308 redirects, `.md` content
  negotiation, and the `/api/mcp` proxy. Never a committed `vercel.json`.
- **Canonical always points at the clean HTML route**; `.md` twins and `.py` files
  carry `X-Robots-Tag: noindex` so the HTML stays the indexed canonical and agents
  fetch markdown.

---

## Phase 0 — Foundation: per-route HTML for crawlers (SEO-shell prerender) — SHIPPED

**Goal:** every public route returns real HTML with a correct per-route `<head>`
(title, description, canonical, OpenGraph, Twitter, JSON-LD, `rel=alternate`
links) plus a `<noscript>` content fallback. Unblocks all SEO items and makes
non-JS agents/crawlers see content.

**Why SEO-shell, not full SSG:** the app tree is deeply browser-coupled
(`AccessGate` + Neon Auth context, TanStack Query, Connect RPC clients,
`import.meta.glob` eager content, interactive LikeC4 diagrams, `next-themes`).
Full `react-dom/server` + hydration means untangling all of that and adding a
hydration path the codebase has never had — high effort, high regression risk, and
most interactive surface must not be prerendered. The SEO-shell approach leaves
`#root` empty (the existing client bundle boots exactly as today — no hydration
mismatch to manage) and injects semantic `<head>` + `<noscript>` body, which is
what crawlers/agents actually need.

**Shipped as:**
- [`site/src/content-core/head.mjs`](../../site/src/content-core/head.mjs) —
  framework-free pure builders from `{identity, meta, body}`: `canonicalUrl`
  (reuses `hrefFromIdentity`), `metaDescription` (frontmatter `summary` → first
  substantial prose paragraph, skipping label-only blocks like `**TL;DR**`),
  `ogTags`, `twitterTags`, `jsonLd`. JSON-LD types: `WebSite`+`Organization` on
  `/`, `TechArticle` for docs, `BlogPosting` for blog (Phase 2 adds
  `Product`/`SoftwareApplication` when a page `explains` a service element).
  Reused later by twins, sitemap, and MCP.
- [`site/src/content-core/render-markdown.mjs`](../../site/src/content-core/render-markdown.mjs)
  — minimal `mdast → hast → html` pipeline (GFM only) for the `<noscript>` body.
  Separate from the Vite MDX pipeline (13 app-specific plugins + JSX); here we only
  need semantic HTML. **Prefer feeding it the rich twin body from Phase 1a**
  (emitter output — snippets inlined, constructs flattened, PNGs referenced) once
  twins exist; until then it renders the raw body as a usable fallback.
- [`site/scripts/prerender-shells.mjs`](../../site/scripts/prerender-shells.mjs) —
  post-`vite build` step. Reads the built `dist/index.html` as the template (so it
  inherits Vite's hashed asset tags — never hand-write the template). Walks content
  (`walkContent`/`walkBlogs`), computes identity (`docIdentity`) + href
  (`hrefFromIdentity`), and for each public route (`/`, `/docs`, `/blog` indexes +
  every `ready` doc/blog) writes `dist/<href>/index.html` = template + injected
  `<head>` + `<noscript>` body. Injection is **idempotent** via HTML-comment
  markers (the `/` route writes to `dist/index.html`, which is also its template
  source). Wired into `build:vercel` after `vite build`, before
  `assemble-vercel-output.mjs`.

**Follow-up (deferred):** `gen-vercel-config.mjs` currently serves the prerendered
`dist/.../index.html` via the existing `{handle:"filesystem"}` before the SPA
catch-all. **Validate on a preview deploy** that Vercel resolves `/docs/a/b/c` →
`/docs/a/b/c/index.html` (directory-index). If not, emit explicit per-route
rewrites or `<route>.html` naming.

**Risks:** Vercel nested directory-index resolution (verify on a preview);
canonical must always point at the clean HTML route to avoid duplicate-content
competition with the `.md` twins.

---

## Phase 1 — .md twins, site-level llms.txt, sitemap, robots, RSS, 308s — SHIPPED

**Shipped notes (deviations from the plan below, worth knowing):**
- The twin/PNG/script generation runs in a **CI prebuild** (Chromium + `uv`), via a
  `site/scripts/build-artifacts.mjs` orchestrator wired into `build:vercel` as
  `build:artifacts` (script-index → twins → prerender shells → sitemap → rss →
  site-llmstxt); the Vercel build consumes the produced `dist/`.
- The emitter core was extracted as an exported `emitOne({inputPath, target,
  modelDir, likec4OutDir, assetsDir})` in `emit/emit.mjs`; the blog CLI `main()`
  calls it. `emit/targets/md-twin.mjs` uses `unwrapProse: true` and a
  paragraph-wrapped `renderImage` (a bare inline image node dropped block
  separators). The driver `site/scripts/build-md-twins.mjs` post-injects `canonical:`.
- **1a §F (added):** `prerender-shells.mjs`'s `<noscript>` body now renders from the
  twin (never raw source) — closing the raw-markdown leak that shipped in Phase 0.
- 308s come from a committed `site/redirects.json` (empty today), validated against
  known routes in `build-redirects.mjs`; `gen-vercel-config.mjs` exposes a pure
  `buildRoutes()`.


**Goal:** emit the static machine-readable corpus + SEO discovery files, all
through content-core + the emitter. Needs only `head.mjs` from Phase 0 (for
canonical URLs); each sub-generator is independently shippable.

**1a. Per-page `.md` twins — the RICHEST READABLE variant, via the emitter.**

The twins must NOT be the raw canonical source. Canonical source
(`content/**/*.md`, `blogs/*/index.md`) is annotation-heavy and authoring-shaped:
`file=` fences, `:::callout`, `::::journey`, `model:` links, `likec4=<viewId>`
embeds. The twin an agent fetches should be the *reader-optimized* rendering —
snippets inlined, callouts/journeys flattened to clean readable markdown, LikeC4
views resolved to referenced PNGs — i.e. exactly what our **emitter pipeline**
already produces for the sibling sites. **Reuse the emitter, don't reimplement.**

The emitter ([`emit/emit.mjs`](../../emit/emit.mjs)) is a **target-agnostic** parse
→ resolve → render core with per-target renderers in `emit/targets/*.mjs`; adding
a target is the intended extension point (the `delta` target was added exactly this
way). It already: inlines `file=`/`start=`/`end=` snippets
(`site/src/plugins/remark-code-snippets.mjs`, imported verbatim), flattens
`:::callout` → blockquote (`remark-callouts-md.mjs`), flattens `::::journey` →
numbered `### Step N — …` (`remark-journey-md.mjs`), and **regenerates LikeC4
PNGs** (`regenerateLikeC4()` → `likec4 export png --sequence --flat` →
`dist/.likec4-export/<viewId>.png`, keyed by view id) with a per-image
`assets.json` manifest (`{filename, localPath, altText, likec4}`).

**Add `emit/targets/md-twin.mjs`** (a target module, mirroring `gdocs.mjs`, the
closest flattening target): reuse the `-md` construct plugins (callouts, journey) +
shared snippet inlining; `titleAsH1: false`, `unwrapProse: false` (preserve
authored breaks for readability); a small preamble/frontmatter hook (title,
canonical site URL, summary, diataxis, project); `renderImage` emitting a
site-served PNG path (see PNG handling below); `outputFile` shaped to the twin
route. `likec4=` handled by the `-md` variant (`remark-likec4-md.mjs`) →
`![alt](<png-url>)` referencing the regenerated PNG (not the interactive component
— a twin is static markdown).

**Add a `:::tldr` construct.** A key-takeaways box — per
[`blogs/QUALITY.md`](../../blogs/QUALITY.md), "the single most-quoted block" for
AI — is authored as a `:::tldr` container directive (3–5 fact-rich bullets),
first-class alongside `:::callout` / `::::journey`. It needs a small renderer per
target family: an `-md` variant (`emit/plugins/remark-tldr-md.mjs`) that flattens
it to a labelled block for the flattening targets (gdocs, the new md-twin), and an
`-mdx` variant for the rich sibling-site targets (a styled callout component). The
twin therefore carries the TL;DR bullets inline where an agent will see them — but
the exposed **description stays frontmatter `summary`** (see Decisions); the
`:::tldr` is body content, never the extracted summary. Two existing TL;DRs
(`blogs/unity-catalog-delta-api/index.md` as a `**TL;DR**` label,
`blogs/unity-catalog-storage/source-import.md` as a `# TL;DR` heading) migrate to
the directive, and `blogs/QUALITY.md` / `blogs/CONVENTIONS.md` document it as the
canonical marker. The site preview renderer (`site/src/plugins/`) gains a matching
`:::tldr` handler so the box renders in-app too.

**Extend the emitter to run on `content/` docs, not just `blogs/`.** Today
`emit.mjs` operates on `blogs/<slug>/index.md`. Twins need it invoked over every
public `content/**` doc page too. Either generalize the emitter's input resolution
to accept a content path, or add a thin site-side driver
(`site/scripts/build-md-twins.mjs`) that invokes the emitter core per page with the
`md-twin` target and writes `dist/docs/<project>/<bucket>/<slug>.md` +
`dist/blog/<slug>.md`. Keep identity/URL through `content-core` (`docIdentity`,
`hrefFromIdentity`) so twin paths match canonical routes.

**LikeC4 PNGs as site assets — currently MISSING, this phase adds it.** The site
today persists **no** LikeC4 PNGs — diagrams render only as interactive canvases
via the Vite LikeC4 plugin; `site/public/` has no diagram images. So a twin that
references a diagram has nothing to point at. The emitter's `regenerateLikeC4()`
already produces the PNGs into `dist/.likec4-export/<viewId>.png`; the twin build
must **copy those PNGs into the site's served assets** (e.g.
`dist/assets/likec4/<viewId>.png`) and have `md-twin`'s `renderImage` emit that
URL. This gives twins working diagram references and, as a bonus, makes static
LikeC4 PNGs available for OpenGraph images (Phase 2) and the `<noscript>` shell
(Phase 0). Requires the LikeC4 export prerequisite (headless Chromium via
Playwright) in the build environment — flag for the Vercel build (may need a
prebuilt-PNG step run in CI rather than in the Vercel build image).

Scaffold "Related concepts" / "Runnable examples" sections here; fill in Phases
2–3.

**1b. `Accept: text/markdown` negotiation** — feasible on the Build Output API
**because the `.md` files already exist**. Add to `gen-vercel-config.mjs`, before
the filesystem handler:

```json
{ "src": "/(docs/.*|blog/.*)",
  "has": [{ "type": "header", "key": "accept", "value": "(.*text/markdown.*)" }],
  "dest": "/$1.md" }
```

plus `Vary: Accept` on HTML routes. **Fallback** if `has` header-value regex proves
flaky on the Build Output API: skip transparent negotiation and rely on the
advertised explicit `.md` URLs (`rel=alternate` + llms.txt) — fully sufficient for
agents. Treat transparent negotiation as nice-to-have, not a blocker.

**1c. X-Robots-Tag on `.md`** — in `gen-vercel-config.mjs`:

```json
{ "src": "/(.*)\\.md",
  "headers": { "X-Robots-Tag": "noindex",
               "Content-Type": "text/markdown; charset=utf-8",
               "Vary": "Accept" },
  "continue": true }
```

**1d. Site-level `/llms.txt` + `/llms-full.txt`** — **reconcile with the existing
per-project files.** Today `build-llmstxt.mjs` emits `public/<project>.llms.txt`
pointing at *external* published sites (delta.io, docs.unitycatalog.io) — an
**outbound** index; leave it as-is. Add `site/scripts/build-site-llmstxt.mjs` (or
refactor the existing renderer with a "self" target) emitting `/llms.txt` indexing
**this** site's routes: H1 + blockquote summary + H2 Diátaxis sections, each entry
linking the canonical route and its `.md` twin; and `/llms-full.txt` concatenating
every `ready` twin body with route headers. Reuses `walkContent`,
`splitFrontmatter`, `parseDocPath`, `hrefFromIdentity`, `DIATAXIS`, `status:ready`.

**1e. sitemap.xml + robots.txt** — `site/scripts/build-sitemap.mjs`:
`dist/sitemap.xml` (canonical HTML routes only, `<lastmod>` from frontmatter
`date`/git mtime) + `dist/robots.txt` (allow all, `Sitemap:` line, note that `.md`
twins + `/llms.txt` exist). Do **not** list `.md` twins (they're noindex).

**1f. RSS** — `site/scripts/build-rss.mjs`: `dist/blog/rss.xml` from the blog
ordering in `content.ts`. Advertised via `rel=alternate type=application/rss+xml`
in the Phase-0 head on `/blog` and `/`.

**1g. 308 redirects** — frontmatter `slug:` already preserves identity across
renames. Add `site/scripts/build-redirects.mjs` reading a committed redirect map
(or a new `former_slugs: []` frontmatter field) and emitting `{src, dest, status:
308}` routes into `config.json`.

**Modify:** `site/package.json` (add generators to the build chain, ideally behind
one `scripts/build-artifacts.mjs` orchestrator; they write into `dist/`, so run
after `vite build`, before `assemble-vercel-output.mjs`); `gen-vercel-config.mjs`
(1b, 1c, 1g — `/api` proxy stays first, SPA catch-all stays last).

---

## Phase 2 — C4 model integration for agents

**Goal:** expose the knowledge graph + per-page concept context so agents (and
JSON-LD) navigate doc ↔ element ↔ source-repo. Depends on Phase 1 twins/llms.txt to
link into; the projection script itself is independently testable.

**Add** `site/scripts/build-model-projection.mjs` — reads
[`architecture/dist/model.json`](../../architecture/dist/model.json) +
[`architecture/canonicals.yaml`](../../architecture/canonicals.yaml) (`js-yaml` is
already a dep) + a build-time binding pass over content frontmatter
`explains`/`references` (mirroring
[`site/src/explain-bindings.ts`](../../site/src/explain-bindings.ts), which is a
*runtime* registry populated by `content.ts` — the build must re-derive it). Emits
`dist/concepts.json`: per element `{id, title, description, kind, links,
explainedBy: <route + .md>, referencedBy: [routes], canonicalDoc, sourceRepo,
relations: [{kind, target}]}`. Single artifact consumed by the twins' "Related
concepts" block, the MCP `get_c4_context` tool, and JSON-LD enrichment.

**Enrich** `build-md-twins.mjs` — fill each page's "Related concepts" section from
the projection (element titles, descriptions, canonical routes, source-repo links)
so an agent fetching a twin gets the architectural context inline.

**Enrich** `head.mjs` JSON-LD — when a page `explains` a service/implementation
element, add `Product`/`SoftwareApplication` JSON-LD using the element's `links`
(homepage/repo); OG description can incorporate the element title/kind (the "OG
tied to C4" idea).

**Serve** `dist/concepts.json` statically and list it in `/llms.txt` as a
first-class resource. No API needed — keeps the graph DB-free; the MCP server reads
the same file. This is the agent-facing complement to
[`information-system.md`](./information-system.md).

---

## Phase 3 — Runnable-script linking — SHIPPED

**Shipped as:** `docsnip scripts --json` (a versioned `{version, scripts:[…]}`
wrapper over `scriptmeta.discover()`, `tutorial_slug` strips the `NNN-` prefix);
`site/scripts/build-script-index.mjs` (shells out, asserts the version, writes
`dist/scripts.json`, copies raw `.py` byte-identically to its served path);
`build-md-twins.mjs` fills a tutorial twin's "Runnable examples" from
`scripts.json`; `build-site-llmstxt.mjs` lists `scripts.json`; the `.py` noindex +
`text/x-python` header rule is in `gen-vercel-config.mjs`.


**Goal:** from a page's `.md` twin / llms.txt / MCP, an agent gets a
machine-readable pointer to the raw git-committed, CI-verified PEP 723 script plus
its runtime contract, so it can fetch and `uv run` it. Depends on Phase 1 twins to
enrich.

**One parser, no drift:** `scriptmeta.py` (Python `tomllib` + PEP 723 regex) is
authoritative. **Shell out** rather than reimplement in JS. Add a docsnip
subcommand `docsnip scripts --json` (in
[`tools/docsnip/src/docsnip/cli.py`](../../tools/docsnip/src/docsnip/cli.py))
wrapping `scriptmeta.discover(content_root)`, printing `[{path, requires_python,
dependencies, compose, services, base_url_env, tutorial_slug}]`. **Fallback** if
invoking Python in the Vercel build is undesirable: a minimal JS PEP 723 reader
guarded by a cross-language drift test (like the existing frontmatter one) — but
shelling out is preferred.

**Add** `site/scripts/build-script-index.mjs` — invokes `docsnip scripts --json`,
writes `dist/scripts.json` (per script: fetch URL, runtime contract, owning
tutorial route). Also **copy the raw `.py` files into `dist/`** (e.g.
`dist/docs/<project>/tutorials/<slug>/snippets/x.py`) served with
`Content-Type: text/x-python` + `X-Robots-Tag: noindex`, so an agent can fetch the
exact committed script same-origin without repo access — and also record the
canonical git path.

**Enrich** `build-md-twins.mjs` — append a "Runnable examples" section to tutorial
twins: fetch URL, PEP 723 runtime contract (deps that `uv run` resolves, compose
services needed), and a "CI-verified; the script *is* the test" note. **Enrich**
`/llms.txt` — list `dist/scripts.json`. **Modify** `gen-vercel-config.mjs` —
noindex + `Content-Type` header rule for `.py` files.

**Risk:** the docsnip CLI JSON output is now a build contract — version it.

---

## Phase 4 — Hosted MCP server at `/api/mcp` — dedicated Function

**Goal:** an MCP server so agents pull docs/concepts/examples as tools over
Streamable HTTP, same-origin — **and** generate deployment topologies (Docker
Compose / Envoy) from selected platform capabilities via a WASM-compiled `trestle`
core. Serves Phases 1–3 artifacts; ships last; developable in parallel against
fixtures once the Phase-1 output layout is fixed.

**Hosting: a dedicated Neon Function, not the review Function.** The review
Function ([`server/src/app.ts`](../../server/src/app.ts), Hono + Connect RPC) stays
lean. The MCP server — which carries the MCP SDK, a bundled WASM module, and the
corpus-fetch/cache logic — goes in its **own** Function (a new top-level `mcp/`
package with its own Hono app + `handler.ts`, mirroring `server/`'s structure).
This keeps the two dependency graphs and deploy lifecycles separate. Routing: add a
route in `gen-vercel-config.mjs` mapping `/api/mcp(.*)` → the MCP Function host (a
second `NEON_FUNCTION_HOST`-style env, e.g. `MCP_FUNCTION_HOST`), sequenced
**before** the existing `/api/(.*)` → review-Function route so `/api/mcp` isn't
swallowed. MCP Streamable HTTP is a POST (+ optional GET SSE) endpoint — a natural
Hono route; the review app's existing SSE (`/events/comments`) proves the
serverless pattern (same caveat: stateless request/response, no long-held
streams).

### 4a. Read-only docs/concept/example tools

`mcp/src/tools/docs.ts`, exposing:

- `search_docs` / `list_docs` — over the `status: ready` corpus (same set as
  llms.txt; **DB-free**, never consults the review DB).
- `get_doc` — a page's `.md` twin body by route/slug.
- `get_c4_context` / `get_concept` — an element's `concepts.json` entry (title,
  description, relations, explainedBy route, source repo).
- `list_examples` / `get_script` — runnable scripts for a doc (from `scripts.json`)
  + raw source + PEP 723 runtime contract.

**Auth:** public `ready` corpus is **openly readable** — these tools require no
bearer (matches the public-site decision).

**Corpus source (single source of truth, no rebundle-on-deploy):** the Function
fetches the deployed static artifacts (`/llms-full.txt`, `/concepts.json`,
`/scripts.json`) from the static origin at cold start and caches them, rather than
bundling a copy into the Function deploy.

### 4b. Generative tool: `generate_stack_topology` (trestle via WASM)

The sibling repo `trestle` already ships a **wasm-ready, pure** generation core —
`crates/stack-topology` (`olai-stack-topology`): `Catalog::plan(Selection, PlanCtx)
-> Plan` then `render_all(Plan) -> Artifacts { compose, envoy, env, gitignore }`.
Input→string, no tokio/fs/TLS/getrandom; disk I/O is a separate `std-io` feature
not in the render path; the repo already builds WASM (`crates/olai-http-wasm`).
`Selection` carries `capabilities: Vec<String>` + `modules` + `knob_overrides` —
literally the "platform capabilities" input the tool takes. (Capability ids align
with the logical capabilities in [`architecture/canonicals.yaml`](../../architecture/canonicals.yaml)
and the LikeC4 model, so `get_c4_context` and `generate_stack_topology` speak the
same vocabulary.)

- **Build:** add a `wasm-bindgen` wrapper crate in trestle (or a thin wrapper here)
  exposing `render_all`/`baseline_catalog` and binding `Selection`/`PlanCtx` (in) +
  `Artifacts` (out); compile to `wasm32-unknown-unknown` with default features only
  (no `std-io`, no `catalog`). Vendor the built `.wasm` + JS glue into the MCP
  Function package (a pinned artifact — no Rust toolchain in the Function deploy).
  Version the WASM artifact against a trestle tag/commit.
- **Tool:** `generate_stack_topology(capabilities: string[], modules?, knobs?,
  ports?) -> { compose, envoy, env, gitignore }` — deserializes args into
  `Selection`/`PlanCtx`, calls the WASM `render_all`, returns the artifact strings.
  **Pure/read-only in effect** (generates config text; writes nothing, touches no
  infra). A companion `list_capabilities` tool surfaces `baseline_catalog()` so an
  agent can discover what it can select.
- **Why it belongs here:** it turns the docs MCP into a hands-on assistant — an
  agent reading a tutorial can generate the exact Compose stack for the
  capabilities that tutorial teaches, grounded in the same topology engine the
  platform ships (see [`generator.md`](../../architecture/design/generator.md)).

### Files

**Add** (new dedicated Function package, e.g. `mcp/`): `mcp/src/app.ts` (Hono app),
`mcp/src/handler.ts`, `mcp/src/mcp/server.ts` (MCP SDK server + tool registration),
`mcp/src/mcp/transport.ts` (Streamable HTTP, stateless), `mcp/src/tools/docs.ts`
(4a), `mcp/src/tools/topology.ts` + vendored WASM (4b), `mcp/src/corpus.ts`
(fetch+cache static artifacts). **Add** (trestle side or a wrapper): `wasm-bindgen`
binding crate + a CI target building `wasm32-unknown-unknown`. **Modify**
`gen-vercel-config.mjs` — add the `/api/mcp(.*)` → `MCP_FUNCTION_HOST` route before
`/api/(.*)`.

**Risks:** MCP SDK + Streamable HTTP on an evictable Function (stateless mode; SSE
de-risks it); WASM-artifact/trestle-version drift (pin + version it, rebuild on
trestle bumps); corpus sync solved by fetching static artifacts; keep the two
Functions' deploy lifecycles independent so a trestle/WASM change never risks the
review app.

---

## Dependency graph & independence

- **Phase 0** — foundation, no deps. **Shipped.**
- **Phase 1** — needs only `head.mjs`; each sub-generator ships independently.
- **Phase 2** — needs Phase 1 twins/llms.txt to link into; projection independently
  testable.
- **Phase 3** — needs Phase 1 twins to enrich; docsnip CLI + script-index
  independently testable.
- **Phase 4** — serves Phases 1–3; ships last; parallel-developable against
  fixtures. Its own dedicated Function; the WASM tool (4b) can land after the
  read-only tools (4a).

Phases 0–3 are **build-time, DB-free, static** (preserving the current property).
Only Phase 4 stands up a Function — a **new dedicated** one, leaving the review
Function untouched.

## Top risks (carry into implementation)

1. **SPA prerender scope creep** — resist full SSG; SEO-shell is the right call.
   Validate Vercel nested directory-index resolution on a preview deploy.
2. **`Accept` negotiation on Build Output API** — `has` header-value matching is the
   least-proven feature; keep the explicit-`.md`-URL fallback ready.
3. **Python↔JS PEP 723 drift** — mitigated by shelling out to docsnip; else a
   mandatory cross-language drift test.
4. **MCP on evictable serverless** — stateless Streamable HTTP; dedicated Function;
   read tools open, no write tools.
5. **Duplicate content** — canonical always at the clean HTML route; `.md`/`.py`
   carry `X-Robots-Tag: noindex`.
6. **WASM / trestle drift** — the `generate_stack_topology` tool depends on a built
   `olai-stack-topology` WASM artifact pinned to a trestle version; rebuild +
   revalidate on trestle bumps, and keep it in the MCP Function only so it never
   touches the review app's deploy.
7. **LikeC4 PNG generation in the build** — twins reuse the emitter's
   `regenerateLikeC4()`, which shells out to `likec4 export png` and needs headless
   Chromium (Playwright). The Vercel build image may not have it. Likely run PNG
   export (and possibly the whole twin/emit step) in a **CI prebuild** that
   commits/uploads the PNGs + twins as build inputs, rather than inside the Vercel
   build. Decide where the emitter runs in the pipeline early.
8. **Emitter blogs→content generalization** — the emitter targets `blogs/` today;
   twins need it over `content/**` too. Verify the resolve stage isn't
   blogs-path-coupled; add a content driver if so.

## Verification (per phase)

- **Phase 0:** build the site; `curl` a doc route from `dist/` (or a preview
  deploy) and confirm real `<title>`, meta description, canonical, OG/Twitter,
  `<script type="application/ld+json">`, and a `<noscript>` body; confirm the SPA
  still boots in a browser. Run the built HTML through a schema.org / OG validator.
  (Automated coverage:
  [`site/src/content-core/__tests__/head.test.mjs`](../../site/src/content-core/__tests__/head.test.mjs).)
- **Phase 1:** confirm `dist/docs/<...>.md` twins are the RICH emitter output —
  snippets inlined, `:::callout`/`::::journey` flattened to readable markdown, and
  `likec4=` diagrams referencing a real PNG that resolves under the site's served
  assets (`dist/assets/likec4/<viewId>.png`); spot-check a twin against the
  emitter's `assets.json` manifest. `curl -H 'Accept: text/markdown'` a doc route →
  markdown (or, in the fallback, the advertised `.md` URL resolves); fetch
  `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt`, `/blog/rss.xml`;
  confirm `.md` responses carry `X-Robots-Tag: noindex`; confirm a renamed page
  308s to its new URL.
- **Phase 2:** validate `dist/concepts.json` against `model.json` (all 46 elements,
  correct `explainedBy`/`referencedBy` from frontmatter); confirm a twin's "Related
  concepts" links resolve; validate the `Product`/`SoftwareApplication` JSON-LD.
- **Phase 3:** `docsnip scripts --json` matches `scriptmeta.discover`; the served
  `.py` files are byte-identical to the committed sources; a tutorial twin's
  "Runnable examples" URLs fetch and `uv run` succeeds; `.py` responses are
  `noindex`.
- **Phase 4:** connect an MCP client (Claude/Cursor) to `/api/mcp`; exercise
  `search_docs`/`get_doc`/`get_c4_context`/`get_script`; confirm no auth required
  for the ready corpus and answers match the static artifacts. For 4b: call
  `list_capabilities` then `generate_stack_topology(["experiment_tracking",
  "data_catalog"])` and confirm the returned `compose`/`envoy` match what `cargo run
  -p olai-stack-topology --example render_stack -- ...` (or `trestle env new`)
  produces for the same selection — the WASM path must equal the native path.
  Confirm the review Function is unchanged/unaffected.

## Critical files

- `site/scripts/gen-vercel-config.mjs` — headers, 308s, `.md` negotiation,
  `/api/mcp` + `/api` routing
- `site/scripts/build-llmstxt.mjs` — existing per-project (outbound) llms.txt; the
  pattern to mirror
- `site/src/content-core/head.mjs` + `render-markdown.mjs` + `prerender-shells.mjs`
  — Phase 0 (shipped)
- `emit/emit.mjs` + `emit/targets/*.mjs` — the emitter core + targets; add an
  `md-twin` target here (rich twins). `regenerateLikeC4()` already exports view PNGs
- `emit/plugins/remark-{callouts,journey,likec4}-md.mjs` — the flattening plugins
  the twin target reuses
- `site/src/content-core/identity.mjs` — canonical identity/URL mapping (reused
  everywhere)
- `site/src/explain-bindings.ts` — runtime element→href registry; the build-time
  projection re-derives it
- `architecture/dist/model.json` + `architecture/canonicals.yaml` — the C4 graph +
  doc/repo bindings
- `tools/docsnip/src/docsnip/scriptmeta.py` + `cli.py` — authoritative PEP 723
  parser; add `scripts --json`
- `server/src/app.ts` — the review Function (reference structure for the new MCP
  Function; NOT modified)
- `trestle` `crates/stack-topology` (`olai-stack-topology`) — wasm-ready topology
  core: `Catalog::plan` → `render_all` → `Artifacts`; source for the
  `generate_stack_topology` tool
- `trestle` `crates/olai-http-wasm` — existing WASM-build precedent in trestle
