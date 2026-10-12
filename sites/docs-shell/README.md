# Docs shell

The layout, components, styles, and build every docs site shares. It is never
installed or built on its own: each site in `sites/` reaches it through a
committed `shell -> ../docs-shell` symlink and supplies its brand in
`src/brand/`. The contract, and why it works this way, is in
[One shell, many brands](../../docs/design/docs-site-emission.md#one-shell-many-brands).

| Path | Contents |
| --- | --- |
| `src/` | The app: routes, layout, the ⌘K palette, doc and API pages, the components the vendored plugins render into, and `styles.css` (everything but the brand's `--accent*` tokens). |
| `src/brand.ts` | The `Brand` type a site's `src/brand/brand.ts` implements. |
| `src/pages/home.tsx` | Blocks a site's `HomePage.tsx` composes: hero, quick start, paths, engines, kinds, community. |
| `vite.base.ts` | `docsSiteConfig({ root, port })`: the MDX, remark, and Shiki pipeline and the `@` / `@brand` aliases. |
| `scripts/prerender.mjs` | `bun run build` in a site: client and SSR bundles, then `dist/<route>.html` per route. |
| `tsconfig.base.json` | Compiler options a site's `tsconfig.json` extends. |

A change here changes every site, so build and look at each one (`just uc-docs`,
`just delta-docs`). A new dependency goes into every site's `package.json`, and
each site's `bun.lock` has to be updated with it.
