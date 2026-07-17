# `unitycatalog` target — the sibling-repo wiring

The `/blog-emit-uc` skill copies a rich `.mdx` post into `unitycatalog-website`.
For that post to render, the site needs a **one-time** set of enabling changes.
This reference is the checklist; if a run finds any piece missing, add it (exact,
pinned versions per the repo's convention — no `^`/`~`).

The site is **Astro 6, pnpm, Tailwind v4 (via `astro-orbit`)**, blog posts under
`src/content/blog/<YYYY-MM-DD-slug>/index.{md,mdx}` (a `blogLoader` requires the
dated folder name), authors are `reference("profiles")`, `category` is the enum
`"guide"`, `date` is a human string (e.g. `July 3, 2026`).

## What the docs-factory core emits (for reference)

`bun emit.mjs --slug <slug> --target unitycatalog` →
`blogs/<slug>/dist/unitycatalog/`:

- `index.mdx` — frontmatter first (`title`, `authors: [<profile-id>]`,
  `category: guide`, `date`, optional `description`), then default imports
  `import Journey from "@/components/blog/Journey.astro"` (+ `JourneyStep`,
  `LikeC4View`), then body. `::::journey`→`<Journey><JourneyStep step="…">`;
  `likec4=`→`<LikeC4View viewId="…" />`; `:::` callouts LEFT as directives;
  MDX-significant chars in prose (`<`,`>`,`{`,`}`) escaped to HTML entities.
- `assets.json` — image manifest (`filename` = `./<filename>` in the MDX;
  `localPath` = file to copy in, incl. the regenerated LikeC4 PNG fallback).
- `likec4-webcomponent.mjs` — the `<likec4-view>` custom-element bundle (present
  when the post has a diagram). Attributes: `view-id`, `dynamic-variant`.

## Required one-time wiring in `unitycatalog-website`

1. **MDX + directive deps** (exact-pinned; MDX 6.x peers on Astro `^6.4.0`, so
   Astro is bumped within 6.x to satisfy it):
   ```bash
   pnpm add -E astro@6.4.8 @astrojs/mdx@6.0.3 remark-directive@4.0.0
   ```

2. **`astro.config.mjs`** — register the MDX integration, the `@/*`→`src/*` Vite
   alias, and the callout remark plugins on the base Markdown pipeline (MDX extends
   it, so `.md` and `.mdx` both get callouts):
   ```js
   import { fileURLToPath } from "node:url";
   import mdx from "@astrojs/mdx";
   import remarkDirective from "remark-directive";
   import remarkCallouts from "./src/lib/remark-callouts.mjs";
   // …
   vite: { resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } },
   markdown: { remarkPlugins: [remarkDirective, remarkCallouts] },
   integrations: [ mdx(), astroOrbit(), /* …existing… */ ],
   ```

3. **`tsconfig.json`** — the `@/*` path (no `baseUrl`; deprecated in TS 6+):
   ```json
   "compilerOptions": { "paths": { "@/*": ["./src/*"] } }
   ```

4. **`src/content.config.ts`** — broaden the blog loader glob:
   `pattern: "**/index.{md,mdx}"` (was `**/index.md`). Zod schema unchanged.

5. **`src/pages/blogs/[id].astro`** — pass the components to `<Content>`:
   ```astro
   import Journey from "../../components/blog/Journey.astro";
   import JourneyStep from "../../components/blog/JourneyStep.astro";
   import LikeC4View from "../../components/blog/LikeC4View.astro";
   const mdxComponents = { Journey, JourneyStep, LikeC4View };
   // …
   <Content components={mdxComponents} />
   ```
   (Callouts need NO component — they're `:::` directives styled to `<aside>` by
   the remark handler.)

6. **Components + CSS** in `src/components/blog/`:
   - `Journey.astro` — `<ol class="jr">` wrapping the steps (CSS-counter numbered).
   - `JourneyStep.astro` — `<li class="jr-step">` with bubble/title/body slot.
   - `LikeC4View.astro` — emits `<likec4-view view-id={viewId} dynamic-variant="sequence">`
     + `<script type="module" src="/likec4/likec4-webcomponent.mjs" is:inline>`
     (the `is:inline` is REQUIRED — a bundled `import` of a `/public` path fails the
     Vite build).
   - `blog-rich.css` — `.jr-*` / `.callout-*` / `likec4-view` styling, scoped under
     `.blog-article`, mapped onto astro-orbit's `--color-*` tokens. Imported once by
     `src/components/pages/blog/BlogPost.astro`.
   - `src/lib/remark-callouts.mjs` — the directive→`<aside class="callout"
     data-type>` handler (inline SVG icons; recurses so callouts nested in a journey
     step transform too; dependency-free tree walk, no `unist-util-visit`).

7. **`public/likec4/likec4-webcomponent.mjs`** — the delivery step drops the
   generated bundle here (loaded by `LikeC4View.astro`).

## Gotchas confirmed during bring-up

- **Astro components are default exports** — the emitter imports `Journey` etc. as
  DEFAULT imports from per-component `.astro` files, not named imports.
- **Do not add `remark-mdx` to the emit parser.** The core uses a serialize-only
  MDX extension (`mdast-util-mdx`'s `mdxToMarkdown`) so a bare `<>` in draft prose
  isn't parsed as JSX at parse time; prose is separately entity-escaped.
- **`is:inline` on the LikeC4 script** — otherwise Vite tries to bundle the
  `/public` path and the build fails to resolve it.
- The repo's `pnpm typecheck` has a **pre-existing** unrelated error in
  `src/lib/searchPlugin.ts` (present on `main`); it is not introduced by this work.
