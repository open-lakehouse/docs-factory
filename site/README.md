# `site/` — the review + admin app

A login-gated Vite + React + MDX app for reviewing content. It reads
builder-agnostic content in place and renders it with build-time Shiki code
blocks and interactive LikeC4 diagrams, inside the review workspace:

- **`/review`**: the 3-pane workspace (content tree, page tabs, comment rail).
  Narrow screens get the dashboard until a page is opened.
- **`/review/dashboard`**: pending work, latest comments, review requests.
- **`/admin`**: allowlist and user roster (site admins only).

It reads `content/` (Diátaxis docs), `blogs/` (narrative drafts), and the
`architecture/model/` LikeC4 model. A page's content path (`/docs/:project/:bucket/:slug`,
`/blog/:slug`) opens it in the workspace. The reader-facing sites are emitted
separately (`just emit-docs`, see `sites/`).

```bash
just preview              # http://localhost:4321
just preview-build        # static build into site/dist/
cd site && bun run check  # likec4 validate over architecture/model
```

## Local dev: two modes

The site sits behind a login gate, resolved by the review API (`../server`).
Locally there is no GitHub OAuth, so pick one of two modes:

| Command | What you get |
|---|---|
| `just preview` | **Offline**: no Docker, DB, or server. If nothing answers on `:8787`, you are admitted as a synthetic `local-author` maintainer and every page is visible. The top bar shows **API offline**; the review chrome is off. |
| `just dev` | **Full stack**: Postgres + the review API (`AUTH_MODE=mock`) + versions registered + the preview. Falls back to offline when Docker isn't running. |

In the full stack, the persona is a mock login: the transport sends it as
`x-dev-persona`. Switch it from the avatar menu's **Dev** section (reviewer /
maintainer / admin; the default is maintainer). **Log out** drops to anonymous,
and the sign-in screen offers the personas again. The same menu holds the
rail/inline review display toggle. All of this is `import.meta.env.DEV`-only
and stripped from prod builds.

## What it does — and does NOT — touch

- **Reads content in place.** Nothing is copied; `import.meta.glob` loads files
  from `../content/` and `../blogs/*/index.md`.
- **Never edits source files.** Richness (interactive diagrams, callouts, tabs,
  journeys) is added by remark plugins here — never by putting JSX into the content.
- **Produces no committed artifact.** The build writes `dist/`, plus the `.md`
  twins and `scripts.json` the workspace's twin and script tabs fetch.

## UI stack

- **shadcn/ui** (new-york) for behavior primitives: Dialog, Tabs, DropdownMenu,
  HoverCard, Select, Alert.
- **Console chrome** in `index.css` for code blocks, journeys, and the mangrove
  palette — design tokens bridge shadcn components onto the DevHub/Delta look.

## Remark pipeline

All `.md` / `.mdx` files share one pipeline (`vite.config.ts`):

| Plugin | Effect |
|---|---|
| `remark-code-snippets` | Resolve `file=`/`start=`/`end=` fences (via `src/content-core/fences.mjs`) |
| `remark-callouts` | `:::tip` → `<Callout>` |
| `remark-journey` | `::::journey` → timeline steps |
| `remark-tabs` | adjacent `:::tab[Label]` containers → one label-synced tab group |
| `remark-fence-meta` | Attach filename/lang metadata for code chrome |
| `remark-likec4-views` | `likec4=<viewId>` images → interactive views |
| `remark-resolve-images` | Relative `./assets/` paths → Vite `/@fs/` URLs |
| `@shikijs/rehype` | Build-time syntax highlighting |

The same `remark-code-snippets` and `remark-directive-prose-guard` plugins are
imported verbatim by `emit/` for blog flattening.

### Code fence meta

A fence's meta string carries chrome hints the `<Pre>` component reads:

| Meta | Effect |
|---|---|
| `title="server.py"` | Slim filename header + language glyph |
| `file=./x.py start=… end=…` | Inline a snippet / region from a colocated file |
| `collapse` | Render collapsed behind a click-to-expand header — for boilerplate meant to be copied, not read. Expands automatically if a review comment anchors a line inside it. |

```
```python title="setup.py" collapse
# long boilerplate — collapsed by default, one click to reveal
```
```

## LikeC4 — one runtime

The site uses a single `LikeC4VitePlugin` workspace: `../architecture/model`.
That workspace serves virtual modules (`likec4:react`, `likec4:single-project`,
...) used by Markdown `likec4=<viewId>` embeds and model-ref diagrams.

Blog-specific diagrams live as dedicated views in
`../architecture/model/blog-views.likec4`. This keeps the heavy LikeC4 runtime
loaded once, avoids generated React modules, and still allows a post to have a
purpose-built view with protocol-level participants.

## Adding a content area

Register a new `import.meta.glob` in `src/content.ts` and a branch in the
workspace tree (`src/components/review/workspace/tree-model.ts`). Docs order in
the tree comes from each doc's **filename numeric prefix** (`001-…`, `002-…`;
stripped from the URL) via `src/doc-nav.ts` — there is no `_meta.yaml`. See
[`../content/README.md`](../content/README.md).
