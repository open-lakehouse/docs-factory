# site/ — local preview harness

An [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
app that renders the repo's `../content` so you can **see** docs as you write
them. It is a **throwaway preview**, not a publishing target: the authoritative
source is `../content`, which stays builder-agnostic and is migrated into the
separate `delta.io` and `unitycatalog.io` site repos.

## Run it

```bash
cd site
npm install       # uses your configured npm registry (corp proxy is fine — local only)
npm run dev       # http://localhost:4321
```

## How it works (and what it does NOT touch)

- **Content is read in place.** The Starlight docs collection loads
  `../content/**/*.md` directly (`src/content.config.ts`, `base: "../content"`).
  Nothing is copied; no Astro frontmatter is added to the content files.
- **Snippet fences resolve live.** `src/plugins/remark-code-snippets.mjs` reads
  the `file=/start=/end=` fences, slices the region between the `docs-*-start` /
  `docs-*-end` markers in `../examples/…`, and injects the real code at build
  time. Its rules mirror `tools/docsnip` `snippetcheck` exactly, so the preview
  and `uv run docsnip check` never disagree.
- **Nav comes from `_meta.yaml`.** `src/sidebar.mjs` translates each project's
  `content/<project>/_meta.yaml` (label + bucket/page order) into the Starlight
  sidebar.

Everything Astro/Starlight-specific lives here in `site/`. If this directory
were deleted, `../content` would lose nothing — that separation is deliberate,
because the content feeds two *other* Astro builds, not just this one.

## Not wired into CI

There is no GitHub Actions job for the site (`node_modules`, `dist`, `.astro`,
and `package-lock.json` are gitignored). CI validates content via
`docsnip check`, which mirrors the snippet contract without needing Node.
