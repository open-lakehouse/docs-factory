# Unity Catalog docs site

A static documentation site for Unity Catalog OSS. Content is authored, tested,
and reviewed in [docs-factory](../../README.md) and **emitted** here; this package
only renders it. Every route is prerendered to HTML at build time and hydrated in
the browser, so crawlers and agents get the full page without running JS.

## Who owns what

The emitter (`just emit-docs unitycatalog-docs` in docs-factory) owns these
paths and overwrites them on every run. Don't edit them by hand:

| Path | Contents |
| --- | --- |
| `src/content/<bucket>/<slug>.md` | Pages: portable Markdown with snippets inlined, links resolved to site routes, `:::` directives kept. |
| `src/generated/site.json` | Navigation tree, page list (route, title, headings, prev/next), REST API specs (route, pinned spec URL). |
| `src/generated/heads.json` | Per-route `<head>`: title, description, canonical, OpenGraph, JSON-LD, `.md` twin link. |
| `src/vendor/plugins/` | The factory preview's remark plugins, copied verbatim, so `:::` directives render the same way here. |
| `public/` | `.md` twins, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `robots.txt`, `scripts.json` + runnable scripts, `search-index.json` (per-section text for the ⌘K palette; page records add the summary and the model concepts and journeys the page covers), images, LikeC4 PNGs and web component. |
| `.docs-emit.json` | Emit manifest: per-page source hashes and per-file output hashes. The next emit diffs against it to write only what changed. |

Layout, components, styles, and the build come from the shared
[docs shell](../docs-shell/README.md), linked here as `shell`. The Delta Lake
site renders through the same shell. What is this site's own is its brand in
`src/brand/`: `brand.ts` (wordmark, socials), `Logo.tsx`, `theme.css` (the UC
yellow accent), and `HomePage.tsx`.

The site ships from its own upstream repo, which is a mirror of this directory
(see [Delivery](../../docs/design/docs-site-emission.md#delivery)). Vercel
builds it from `vercel.json`. `upstream/` holds the files that replace this
README and the repo-level `.gitignore` there.

`vercel.json` also carries the permanent redirects from the legacy docs URLs
(`/usage/*`, `/server/*`, `/integrations/*`, `/ai/*`). Each points at the
nearest published page, and the emitter fails if a destination isn't a route or
heading it serves. Repoint one when a closer page is released.

The vendored plugins import their components from `@/components/{callout,tldr,content-tabs,journey,LikeC4View}`
(`@` is the shell), so those module paths and export names are part of the
contract with the emitter.

REST API pages (`/reference/api/<slug>`) render the spec at `specUrl` with
Scalar, client-side and lazily loaded: `shell/src/pages/ApiPage.tsx` and
`shell/src/components/ApiReference.tsx`, themed onto the site tokens in
`shell/src/components/api-reference.css`.

## Commands

```bash
bun install
bun run build     # client + SSR bundles, then dist/<route>.html per route
bun run preview   # serve dist/ at http://localhost:4322
bun run dev       # client-rendered dev server (no prerender)
```

From docs-factory, `just uc-docs` emits (including drafts), builds, and previews
in one step.
