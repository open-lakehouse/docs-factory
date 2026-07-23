# `site/` — unified local preview (docs + blogs)

A **throwaway** Vite + React + MDX harness that reads builder-agnostic content in
place and renders it with site-like styling, build-time Shiki code blocks, and
interactive LikeC4 diagrams. One preview for both areas:

- **`content/`** — Diátaxis docs (`/docs/:project/:bucket/:slug`)
- **`blogs/`** — narrative drafts (`/blog/:slug`)
- **`architecture/model/`** — estate LikeC4 model (`/explain/:elementId`)

```bash
just preview              # http://localhost:4321
just preview-build        # static build into site/dist/
cd site && bun run check  # likec4 validate over architecture/model
```

## What it does — and does NOT — touch

- **Reads content in place.** Nothing is copied; `import.meta.glob` loads files
  from `../content/` and `../blogs/*/draft.md`.
- **Never edits source files.** Richness (interactive diagrams, callouts, tabs,
  journeys) is added by remark plugins here — never by putting JSX into the content.
- **Is not wired into CI** (optional smoke: `bun run build` in CI). Produces no
  committed artifact except the throwaway `dist/`.

## UI stack

- **shadcn/ui** (new-york) for behavior primitives: Dialog, Tabs, Breadcrumb,
  DropdownMenu, Collapsible, Alert.
- **Console chrome** in `index.css` for code blocks, journeys, and the mangrove
  palette — design tokens bridge shadcn components onto the DevHub/Delta look.

## Remark pipeline

All `.md` / `.mdx` files share one pipeline (`vite.config.ts`):

| Plugin | Effect |
|---|---|
| `remark-code-snippets` | Resolve `file=`/`start=`/`end=` fences |
| `remark-callouts` | `:::tip` → `<Callout>` |
| `remark-journey` | `::::journey` → timeline steps |
| `remark-tabs` | `::::tabs` / `:::tab[Label]` → synced engine tabs |
| `remark-fence-meta` | Attach filename/lang metadata for code chrome |
| `remark-likec4-views` | `likec4=<viewId>` images → interactive views |
| `remark-resolve-images` | Relative `./assets/` paths → Vite `/@fs/` URLs |
| `@shikijs/rehype` | Build-time syntax highlighting |

The same `remark-code-snippets` and `remark-directive-prose-guard` plugins are
imported verbatim by `emit/` for blog flattening.

## LikeC4 — one runtime

The site uses a single `LikeC4VitePlugin` workspace: `../architecture/model`.
That workspace serves virtual modules (`likec4:react`, `likec4:single-project`,
...) used by both `/explain` and Markdown `likec4=<viewId>` embeds.

Blog-specific diagrams live as dedicated views in
`../architecture/model/blog-views.likec4`. This keeps the heavy LikeC4 runtime
loaded once, avoids generated React modules, and still allows a post to have a
purpose-built view with protocol-level participants.

## Adding a content area

Register a new `import.meta.glob` in `src/content.ts` and a route in `src/App.tsx`.
Docs nav order comes from each doc's **filename numeric prefix** (`001-…`, `002-…`;
stripped from the URL) via `src/sidebar.ts` — there is no `_meta.yaml`. See
[`../content/README.md`](../content/README.md).
