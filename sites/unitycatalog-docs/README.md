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
| `src/generated/site.json` | Navigation tree, page list (route, title, headings, prev/next). |
| `src/generated/heads.json` | Per-route `<head>`: title, description, canonical, OpenGraph, JSON-LD, `.md` twin link. |
| `src/vendor/plugins/` | The factory preview's remark plugins, copied verbatim, so `:::` directives render the same way here. |
| `public/` | `.md` twins, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `robots.txt`, `scripts.json` + runnable scripts, `search-index.json` (per-section text for the ⌘K palette), images, LikeC4 PNGs and web component. |
| `.docs-emit.json` | Emit manifest: per-page source hashes and per-file output hashes. The next emit diffs against it to write only what changed. |

Everything else (layout, components, styles, the build) belongs to this site.

The vendored plugins import their components from `@/components/{callout,tldr,content-tabs,journey,LikeC4View}`,
so those module paths and export names are part of the contract with the emitter.

## Commands

```bash
bun install
bun run build     # client + SSR bundles, then dist/<route>.html per route
bun run preview   # serve dist/ at http://localhost:4322
bun run dev       # client-rendered dev server (no prerender)
```

From docs-factory, `just uc-docs` emits (including drafts), builds, and previews
in one step.
