# Delta Lake documentation

The source of the Delta Lake docs site: a static site for Delta Lake,
prerendered to HTML and hydrated in the browser.

**This repository is generated.** Pages, examples, and the site itself are
written, tested, and reviewed in docs-factory, and a bot opens a
`docs-factory/sync` pull request here whenever they change. Merging that PR
deploys to production. A hand edit to any file here, except `.github/` and
`LICENSE`, is overwritten by the next sync, so propose changes in docs-factory
instead.

`.docs-emit.json` records the docs-factory commit each build came from.

## Build locally

```bash
bun install
bun run build     # dist/<route>.html per route
bun run preview   # serve dist/ at http://localhost:4323
```
