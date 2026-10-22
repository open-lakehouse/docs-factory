# Consolidating unitycatalog.io and its docs into one site

**Status:** proposal. The decisions in [§8](#8-decisions-to-make) are open.
**Scope:** `sites/`, `emit/targets/`, `emit/docs/`, `blogs/`, the delivery
workflow, and the sibling `unitycatalog-website` repo.

Unity Catalog has two web properties today, and they share nothing: not the
stack, the host, or the look.

| | **unitycatalog.io** (marketing + blog) | **UC docs site** (the `docs.unitycatalog.io` target) |
| --- | --- | --- |
| Repo | sibling `unitycatalog-website` | `sites/unitycatalog-docs` + `sites/docs-shell`, mirrored upstream by `uc-docs-sync.yml` |
| Stack | Astro 6, MDX, Alpine.js header, Expressive Code, Pagefind, pnpm | Vite, React 19, React Router, MDX, Shiki, MiniSearch ⌘K, Scalar; every route prerendered and hydrated; bun |
| Styling | `src/layouts/theme.css`; Plus Jakarta Sans; strawberry `#f43ba6`, yellow `#ffbc00`, sky `#00bfff` on navy; dark only | hand-written `docs-shell/src/styles.css` over CSS variables; Inter + Geist Mono; Primer neutrals, UC yellow accent; light, dark, System |
| Host | Netlify (`netlify.toml`, `_headers`), Plausible | Vercel (`vercel.json`), Vercel Analytics |
| Content | 26 posts, 17 author profiles (zod schemas in `src/content.config.ts`); home sections Hero, Benefits, FeatureDetails, PartnerEcosystem, Endorsements, Cta; `/blogs`, `/blogs/[id]`, 404 | emitted pages, `site.json`, `heads.json`, `.md` twins, `llms.txt`, sitemap, search index, scripts, environment bundles |
| Delivery from here | `blog-emit` → `emit/targets/unitycatalog.mjs` writes Astro MDX (`<Journey>`, `<LikeC4View>`) | `just emit-docs` + mirror |

`docs.unitycatalog.io` still serves the legacy MkDocs site, and the new docs
site isn't live yet. That makes this the cheapest moment to merge the two
rather than cut over the docs and then migrate again.

We want one React + Vite + Tailwind + shadcn site that keeps the docs shell's
console look, and that also does what a marketing site needs: brand
expression, fast landing pages, social cards, a blog with feeds, partner
logos, and copy that people who aren't engineers can edit.

## 1. Goal and non-goals

**Goal:** one site, one build, one deploy for unitycatalog.io, covering
marketing, the blog, docs, and the REST API reference. It keeps what the
factory guarantees today: prerendered HTML, `.md` twins, `llms.txt`, JSON-LD,
ready-only emits ([ADR-0002](../decisions/ADR-0002-git-ready-is-release.md)),
and tested snippets.

**Not in this round:** a CMS, i18n, an SSR or edge runtime, and migrating
delta.io. The design must still carry over to delta.io ([§9](#9-delta-lake)).

## 2. Target architecture

### Extend the docs shell; don't start a new app

The shell already has most of what we need: Vite + React 19, prerender and
hydrate (`shell/scripts/prerender.mjs`), routing from `site.json`, per-route
heads, and a brand seam (`src/brand/{brand.ts,Logo.tsx,theme.css,HomePage.tsx}`).
`App.tsx` already routes `/` to `@brand/HomePage`. Consolidation generalizes
that seam into **page kinds**:

| Kind | Source | Rendered by |
| --- | --- | --- |
| `marketing` | brand-owned React pages in `src/brand/pages/`, copy in `src/brand/content/*.yml` | a route table the brand exports |
| `blog` | emitted Markdown + frontmatter, authors, tags | shell blog index, tag, author, and post pages |
| `doc` | emitted Markdown (today) | `DocPage` |
| `api` | spec URL (today) | `ApiPage` (Scalar) |

There are two layouts. `MarketingLayout` is wide, with full-bleed sections, a
top nav, and a footer. `DocsLayout` is today's `Shell`: sidebar, on-this-page
TOC, status bar. Both share the topbar, ⌘K palette, theme switch, and footer,
so moving from the home page into the docs reads as one product.

### Tailwind v4 and shadcn, token first

Add `@tailwindcss/vite` and map the existing CSS variables (`--accent*`, the
Primer neutrals, `--font-sans`, `--font-mono`) into `@theme`. Tailwind
utilities and the current stylesheet then resolve to the same tokens, so
`styles.css` can be ported component by component with no visible change. A
Playwright screenshot diff of UC and Delta routes in light and dark gates
each step.

shadcn is copy-in. The shell takes its own copies of the primitives it needs
(Button, Dialog, DropdownMenu, Tabs, HoverCard, Badge, Input), using
`site/src/components/ui/` as the reference set. It doesn't import from `site/`,
which keeps the [emission](./docs-site-emission.md) invariant that the shell
imports nothing from docs-factory. The ⌘K palette's native `<dialog>` and the
copy-page menu are the first candidates to move onto the primitives.

### A console look for marketing

The docs already read like a console: mono chrome, a status bar, quiet
neutrals, one accent. Marketing uses the same language at a larger scale:

- Mono display type for headings, labels, and numbers.
- A terminal hero that shows the real getting-started commands. `pages/home.tsx`
  already derives them from the tutorial (`environmentCommands()`), so the
  hero can't drift from the tested page.
- Bracketed section labels, status-bar strips, and logo walls on a quiet grid.
- UC's strawberry, yellow, and sky as accents on marketing surfaces only; the
  neutrals stay Primer ([D3](#8-decisions-to-make)).

### Rendering and performance

Every route stays prerendered and hydrated. Marketing and docs routes are
lazy chunks, so the home page doesn't load Scalar, LikeC4, or the search
index until a reader needs them. Budget: home LCP under 2.0 s and initial JS
under 150 KB gzipped, checked by Lighthouse in CI.

## 3. URLs and domains

The recommended layout is one origin, `unitycatalog.io` ([D1](#8-decisions-to-make)):

| Path | Content |
| --- | --- |
| `/` | home |
| `/community`, `/integrations` | optional new marketing pages |
| `/blog`, `/blog/<slug>`, `/blog/tags/<tag>`, `/blog/authors/<id>` | blog ([D2](#8-decisions-to-make)) |
| `/docs/…` | docs, with today's routes under the prefix |
| `/docs/reference/api/…` | REST API reference |

Redirects ship in `vercel.json`:

- `docs.unitycatalog.io/*` → `unitycatalog.io/docs/*`, with the legacy MkDocs
  paths mapped through the
  [legacy docs migration map](./unitycatalog-documentation-plan.md#legacy-docs-migration-map).
- `/blogs/*` → `/blog/*`, if D2 goes that way.
- `go.unitycatalog.io/docs` and `go.unitycatalog.io/apidocs` re-pointed.

**What it means for the emitter:** the docs-site target gets a `basePath`
(`emit/targets/docs-site.mjs`, `emit/docs/`). It has to reach every place a
route is written: `site.json`, canonicals in `heads.mjs`, absolute URLs in the
twins, `sitemap.xml`, `llms.txt`, the search index, and served script URLs.
The emitter then writes one `llms.txt` and one sitemap at the origin root
that cover docs, blog, and marketing routes.

## 4. Content ownership and delivery

The recommendations for [D4](#8-decisions-to-make) and [D5](#8-decisions-to-make):

- **The shell, the brand, and the marketing pages are authored in
  docs-factory `sites/`.** The shell stays shared with Delta.
- **Marketing copy is data, not JSX.** Hero, benefits, partners, endorsements,
  and CTAs are YAML in `src/brand/content/`. Editing them is a one-file PR.
- **Blog source moves into `blogs/`.** A new target, `emit/targets/site-blog.mjs`,
  writes portable Markdown with directives into the site, and the Astro MDX
  target (`emit/targets/unitycatalog.mjs`) retires. `::::journey`, `likec4=`,
  and callouts already render through the shell's vendored plugins
  (`components/journey.tsx`, `LikeC4View.tsx`, `callout.tsx`).
- **The 26 published posts and 17 profiles are imported once.** A script maps
  `<Journey>` and `<LikeC4View>` back to directives and the profiles into
  `blogs/authors.yml`. Imported posts land at `status: ready`, since they're
  already published.
- **Delivery reuses the mirror.** `uc-docs-sync.yml` and `scripts/mirror-site.sh`
  point at the existing `unitycatalog-website` repo, so the site keeps its name,
  history, and stars. One cutover PR there replaces the Astro tree. Once blogs
  emit on push to main, the deferred "blog release automation" in
  [docs-site-emission](./docs-site-emission.md#deferred) is done.

## 5. Marketing parity checklist

| Need | Today (Astro) | Consolidated site |
| --- | --- | --- |
| Home sections | Hero with floating logos, Benefits, FeatureDetails, PartnerEcosystem, Endorsements, Cta | shell marketing blocks, filled from brand YAML |
| Blog index and post | featured post + paginated grid; TOC, contributors, related posts | `blog` kind; related posts by tag (`blogs/tags.yml`) |
| Search | Pagefind, blog only | MiniSearch ⌘K over docs and blog, results grouped by kind |
| Social cards | post thumbnail or a default image | OG PNGs rendered at build time (satori + resvg in prerender) for every page and post |
| Feeds | none | `/blog/rss.xml` and Atom |
| Newsletter | `Subscribe.astro`, a stub | [D7](#8-decisions-to-make) |
| Analytics | Plausible | [D6](#8-decisions-to-make) |
| Security headers | Netlify `_headers` | `vercel.json` headers (X-Frame-Options, nosniff, Referrer-Policy) |
| Sitemap | `@astrojs/sitemap` | the emitter's sitemap, extended to marketing and blog routes |
| Favicons | astro-favicons | a static set in the brand's `public/` |
| 404 | custom page | shell `NotFound` in the marketing layout |
| Code blocks | Expressive Code (frames, titles, line marks) | `code-block.tsx` (titles, copy); audit imported posts for line marks |

## 6. Migration phases

Each phase ships on its own. Readers see no change until P5.

- **P0 Decide.** Settle D1–D10; record D1 and D4 as ADRs.
- **P1 Tailwind and shadcn in `docs-shell`.** Token bridge, primitives, and an
  incremental port of `styles.css`. Gate: the screenshot diff of about ten UC
  and Delta routes in both themes shows no change, and
  `emit/docs/__tests__/sites.test.mjs` still finds identical dependency lists.
- **P2 Page kinds and base path.** Route table, `MarketingLayout`, the
  emitter's `basePath`. Docs move under `/docs` locally.
- **P3 Blog pipeline.** The `site-blog` target; blog index, post, tag, and
  author pages; feeds and OG images; the one-time import; the `blog-emit`
  skill updated to the new target.
- **P4 Marketing pages.** The console redesign of the home page and blog index,
  filled from YAML. Screenshot review of the design before building it out.
- **P5 Cut over.** A Vercel project on `unitycatalog-website`, the mirror PR that
  replaces the Astro tree, DNS for the apex and `docs.`, the redirect map,
  updated `go.` links and UC repo README, then retiring Netlify.
- **P6 Delta.** The same pattern for delta.io, when that site's owners are ready.

## 7. Risks

- **The mirror overwrites upstream.** Community PRs against marketing copy in
  `unitycatalog-website` would be lost on the next sync. The upstream README
  overlay must send contributors to docs-factory; the package model in D4
  removes the problem at a cost.
- **SEO at cutover.** Every published blog URL and legacy MkDocs URL needs a 301.
  Diff a crawl of the old sitemaps against the new routes before the DNS
  switch.
- **Home-page weight.** Shared shell chunks can leak into the marketing bundle.
  The Lighthouse budget catches it.
- **Brand drift.** Marketing wants color, docs want restraint. D3 has to be
  settled before P4 starts.
- **Lost code-block features** in imported posts. Audit the 26 posts for
  Expressive Code features that `code-block.tsx` doesn't have.

## 8. Decisions to make

| ID | Decision | Recommendation | Alternatives |
| --- | --- | --- | --- |
| D1 | Domain layout | one origin, docs under `/docs`: one sitemap, one `llms.txt`, all search authority on one host | keep `docs.` as a host on the same build, scoped by host as in [multi-domain-single-deployment](./multi-domain-single-deployment.md); or two deploys |
| D2 | Blog path | `/blog` (the conventional path, and `/blog` already redirects) | keep `/blogs`, so no blog redirects are needed |
| D3 | Brand system | console-neutral base, UC tri-color accents on marketing only; Inter + Geist Mono everywhere; light, dark, and System on marketing too | Primer + yellow everywhere; or keep the pink-on-navy marketing look, Plus Jakarta Sans headings, dark-only marketing |
| D4 | Repo and ownership | shell and marketing authored in docs-factory, mirrored to `unitycatalog-website` | publish `@open-lakehouse/docs-shell` as a package (like `trestle-diagram`); each site repo owns its marketing and docs-factory emits only content into it. Better for outside contributors, but more release overhead |
| D5 | Blog source of truth | every post in `blogs/` | published posts stay in the site repo, and only new posts are emitted |
| D6 | Analytics | both for one quarter, then pick one | Vercel Analytics (already in the shell); Plausible (has the history, privacy-friendly) |
| D7 | Newsletter and forms | needs LF and marketing input | none (link to Slack and LinkedIn); a provider embed (Buttondown, HubSpot, LF tooling) |
| D8 | Hosting | Vercel, which the docs pipeline already targets | Netlify, the current marketing host. Either way, confirm who owns the account and DNS |
| D9 | Marketing interactivity | fully hydrated React, one router | partial hydration or islands: less JS, more machinery |
| D10 | Editing for non-engineers | YAML in git | a git-backed CMS (Decap, Tina) later |

## 9. Delta Lake

delta.io would follow the same pattern: the same shell, its own brand
directory, and its own upstream (`delta-io/website`, which today takes no MDX
and has its own callout vocabulary and frontmatter schema). Nothing in P1–P3
may be UC-specific. Marketing blocks live in the shell and copy lives in the
brand, so a second site is a brand directory and a sync job.
