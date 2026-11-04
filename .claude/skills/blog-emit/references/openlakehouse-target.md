# `openlakehouse` target — delivery runbook

The delivery step (step 3 of `/blog-emit --target openlakehouse`) copies the core's
`.mdx` post into the sibling `openlakehouse-io` repo (the openlakehouse.io site:
Vite + React 18 + `@mdx-js/rollup`, a client-rendered SPA on Vercel). It is a
human-in-the-loop copy into a repo the user owns: never push or open a PR unbidden.

The sibling repo is expected at `../openlakehouse-io`. Confirm it exists and is on a
clean branch (its `.agents/rules/branching-rule.mdc` governs naming) before writing.

## What the docs-factory core emits

`bun emit.mjs --slug <slug> --target openlakehouse` → `blogs/<slug>/dist/openlakehouse/`:

- `index.mdx` — the site's post frontmatter (`title`, ISO `date`, `authors: [<slug>]`,
  `excerpt` from the draft `summary`, `tags`, `include: [blog]`, `kind: post`, and on a
  cross-post `originalUrl` + `originalPublisher`, which the site treats as a
  republished post: canonical to the original, left out of the sitemap). The body
  uses only the site's `MdxProvider` components, so it has no component imports:
  - `:::tldr` → `<Callout type="info" title="TL;DR">`; `:::note`/`:::info` → `info`,
    `:::tip` → `tip`, `:::warning`/`:::caution`/`:::danger` → `warn`; a `[Label]`
    becomes `title`.
  - `::::journey` → `<Steps><Step title="…">`.
  - ```` ```likec4 ```` → `<LikeC4View viewId alt>`; ```` ```trestle ```` →
    `<TrestleView src alt>`.
  - local images → `import imgN from "./<file>"` + `<Figure src={imgN} alt>`.
  - Any other directive fails the emit (the site has no remark-directive).
- `assets.json` — `images[]` to copy beside the post, `public[]` for the site root.
- `likec4-webcomponent.mjs` and `public/` (the `<trestle-view>` bundle and the post's
  snapshots), when the post has those diagrams.

## A. Place the post — CREATE or UPDATE

The site routes a post by its folder: `src/content/posts/<category>/<slug>/index.mdx`
→ `/blog/<category>/<slug>`. On CREATE, `<category>` comes from the target's tag map
(`category(tags)` in `emit/targets/openlakehouse.mjs`: the first tag that names one,
else `lakehouse`), and `post_dir` is `<category>/<slug>`. On UPDATE, reuse
`existing.post_dir` verbatim so the URL stays stable.

```
DEST=../openlakehouse-io/src/content/posts/<post_dir>
```

## B. Reconcile authors (BEFORE copying)

Each `authors` slug needs `src/content/authors/<slug>.mdx` (frontmatter `name`, `role`,
optional `github`/`linkedin`/`twitter`/`avatar`, then a one-paragraph bio). The site
drops an unknown author silently, so check, don't rely on the build. If one is
missing, **HALT and ask** for the name, role, and bio rather than inventing them.

## C. Copy

- `dist/openlakehouse/index.mdx` → `$DEST/index.mdx`; each `images[]` `localPath` →
  `$DEST/<filename>`. A colocated `thumbnail.{png,jpg,webp}` is picked up as the card
  image; otherwise the category default is used.
- `likec4-webcomponent.mjs`, if produced → `../openlakehouse-io/public/likec4/`.
- If `public[]` is non-empty: `cp -R dist/openlakehouse/public/. ../openlakehouse-io/public/`.

Both diagram components must exist in `src/components/mdx/` and be registered in
`src/components/MdxProvider.tsx` (`LikeC4View`, `TrestleView`). A post naming a
component the provider lacks crashes the page (no error boundary), so check this
before copying a post with diagrams.

## D. Verify, then report

```bash
cd ../openlakehouse-io && bun install && bun run build && bun run test
bun run strip-lock-proxy:check
```

`prebuild` regenerates `public/sitemap.xml` and `public/llms*.txt`; commit them with
the post. Then `bun run preview` and check the post in a real browser: callouts and
steps styled, code titles, images, and any diagram drawn with no console errors.
Report the post dir and URL; step 4 of the skill records
`{ "openlakehouse": { "post_dir": "<category>/<slug>", "updated": "<date>" } }`.
