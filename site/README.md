# `site/` — unified local preview (docs + blogs)

A **throwaway** Vite + React + MDX harness that reads builder-agnostic content in
place and renders it with site-like styling, Shiki code blocks, and interactive
LikeC4 diagrams. One preview for both areas:

- **`content/`** — Diátaxis docs (`/docs/:project/:bucket/:slug`)
- **`blogs/`** — narrative drafts (`/blog/:slug`)

```bash
just preview              # http://localhost:4321
just preview-build        # static build into site/dist/
cd site && npm run check  # likec4 validate over blog models
```

## What it does — and does NOT — touch

- **Reads content in place.** Nothing is copied; `import.meta.glob` loads files
  from `../content/` and `../blogs/*/draft.md`.
- **Never edits source files.** Richness (interactive diagrams, callouts, tabs,
  journeys) is added by remark plugins here — never by putting JSX into the content.
- **Is not wired into CI** (optional smoke: `npm run build` in CI). Produces no
  committed artifact except the throwaway `dist/`.

## Remark pipeline

All `.md` / `.mdx` files share one pipeline (`vite.config.ts`):

| Plugin | Effect |
|---|---|
| `remark-code-snippets` | Resolve `file=`/`start=`/`end=` fences |
| `remark-callouts` | `:::tip` → `<Callout>` |
| `remark-journey` | `::::journey` → timeline steps |
| `remark-tabs` | `::::tabs` / `:::tab[Label]` → engine tabs |
| `remark-code-block` | Shiki-highlighted code blocks |
| `remark-likec4-views` | `likec4=<viewId>` images → interactive views |
| `remark-resolve-images` | Relative `./assets/` paths → Vite `/@fs/` URLs |

The same `remark-code-snippets` and `remark-directive-prose-guard` plugins are
imported verbatim by `emit/` for blog flattening.

## Adding a content area

Register a new `import.meta.glob` in `src/content.ts` and a route in `src/App.tsx`.
Docs nav comes from `content/<project>/_meta.yaml` via `src/sidebar.ts`.
