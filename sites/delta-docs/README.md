# Delta Lake docs site

A static documentation site for Delta Lake. Content is authored, tested, and
reviewed in [docs-factory](../../README.md) and **emitted** here; this package
only renders it. It is the Unity Catalog site's twin: both render through the
shared [docs shell](../docs-shell/README.md), and this directory holds only
what makes it Delta Lake.

| Path | Owner |
| --- | --- |
| `src/brand/` | This site: `brand.ts` (wordmark, socials), `Logo.tsx` (the Δ glyph), `theme.css` (Delta teal accent), `HomePage.tsx` (the curated home page). |
| `shell` | A symlink to [`../docs-shell`](../docs-shell/README.md): layout, components, styles, and the build. |
| `src/content/`, `src/generated/`, `src/vendor/`, `public/`, `.docs-emit.json` | The emitter (`just emit-docs delta-docs`); see the [UC site README](../unitycatalog-docs/README.md#who-owns-what). |

The site has no env bundle and no REST API pages: Delta's scripts run against
local files, and each page's own Prerequisites box says what it needs.

Upstream delivery isn't wired yet. `upstream/` already holds the overlay the
mirror would copy (see [Delivery](../../docs/design/docs-site-emission.md#delivery)).

## Commands

```bash
bun install
bun run build     # client + SSR bundles, then dist/<route>.html per route
bun run preview   # serve dist/ at http://localhost:4323
bun run dev       # client-rendered dev server (no prerender)
```

From docs-factory, `just delta-docs` emits (including drafts), builds, and
previews in one step.
