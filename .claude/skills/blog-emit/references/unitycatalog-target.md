# `unitycatalog` target — delivery runbook

The delivery step (step 3 of `/blog-emit --target unitycatalog`) copies the core's
rich `.mdx` post into the sibling **uc-website** repo (open-lakehouse/uc-website:
TanStack Start, content-collections, `@mdx-js/rollup`, Bun). This runbook is the
CREATE-or-UPDATE mechanics (§§A–C); §D is what the site already provides.

**Where the repo is:** `$UC_WEBSITE_DIR`, else `uc-website` beside the *main*
docs-factory checkout. From a worktree, `../uc-website` is wrong; resolve it the
way the docs emitter does:

```bash
UCW="${UC_WEBSITE_DIR:-$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/../uc-website}"
```

Confirm it exists and is on a clean working branch (never `main`) before writing
into it. The docs emitter writes there too (`src/content/docs/` and friends);
blog delivery never touches those directories. This never pushes or opens a PR
unless the user asks.

## A. Reconcile the author → profile (BEFORE copying)

The schema checks every `authors` id against `src/content/profiles/<id>/index.md`,
and the build FAILS on an unknown one. For each id in the render's frontmatter:

- Check `$UCW/src/content/profiles/<id>/index.md` exists.
- **If missing, HALT and report**: don't invent a profile (it needs a real
  `name`, `title`, and `photo`). Ask the user to add
  `src/content/profiles/<id>/{index.md,photo.jpg}`, or to map the draft's
  `author` to an existing id.

## B. Copy into the sibling repo — CREATE or UPDATE

The post dir is `<YYYY-MM-DD>-<slug>`: the draft's `date` (ISO), else today on
CREATE. On UPDATE, reuse `existing.post_dir` verbatim, so the post's id and URL
stay stable. The site's URL for it is `/blogs/<slug>/` (the folder name after the
date, lowercased), which is what `postUrl` and cross-post canonicals use.

```
DEST=$UCW/src/content/blog/<YYYY-MM-DD>-<slug>
```

- `mkdir -p "$DEST"`; copy `dist/unitycatalog/index.mdx` → `$DEST/index.mdx`.
- For each `images[]` entry, copy `localPath` → `$DEST/<filename>` (co-located;
  the MDX references `./<filename>`, which the site's image pipeline resolves).
- If `likec4-webcomponent.mjs` was produced, copy it to
  `$UCW/public/likec4/likec4-webcomponent.mjs` (the shared path `LikeC4View`
  loads; generated from the whole model, so safe to overwrite). The docs keep
  their own copy under `public/docs/likec4/`.
- If `assets.json` lists `public` files, copy `dist/unitycatalog/public/.` over
  `$UCW/public/`: the `<trestle-view>` bundle at `public/trestle/` and each
  diagram's snapshot under `public/trestle/<slug>/`.
- If `assets.json` has a `thumbnail`, copy its `localPath` → `$DEST/<filename>`.
  The render's frontmatter already carries `thumbnail: ./<filename>` (the core
  finds `assets/thumbnail.<ext>` or the draft's `thumbnail`/`hero`). The build
  fails on a thumbnail whose file is missing.

## C. Build-verify, then report

```bash
cd "$UCW" && bun install && bun test && bun run build && bun run links:dist
```

The build validates the frontmatter, compiles the MDX, and its crawler fails on a
dead internal link, including a `/docs/…` link to a page the docs don't publish.
Then `bun run preview` and check the post in a real browser: journey steps (one
number each), `:::` callouts as styled asides, and LikeC4 or Trestle diagrams
hydrating. Report the post dir and preview URL; the skill's step 4 records the
sidecar block `{ post_dir, updated }`.

## D. What the site provides (reference / re-verify)

- **Schema** (`content-collections.ts`): `title`, `authors` (profile ids),
  `category: guide`, optional `topics` (`guide`, `releases`, `getting-started`,
  `ai`, `integrations`, `governance`; the site infers them from the id when
  absent), `date` (a human string such as `July 3, 2026`), optional
  `description`, `thumbnail`, `slug`, and `canonical` (a cross-post's original,
  which the page puts in `<link rel="canonical">`).
- **Components** (`src/components/blog/index.ts`): `Journey`, `JourneyStep`,
  `LikeC4View`, `TrestleView`, passed to every post by name.
  `plugins/post-module.ts` strips the render's `import … from
  "@/components/blog/*.astro"` lines, so the core's imports don't need to resolve.
- **Callouts**: `:::tldr|tip|note|info|warning|caution|danger` directives, styled
  by `src/lib/remark-callouts.mjs`; the core leaves them as written.
- **Code blocks**: Expressive Code, which turns a fence's `title="x.py"` into a
  filename tab.
- **Docs links**: the core emits links to docs pages as root-relative `/docs/…`
  paths, since the docs are on this site (`emit/blog-links.mjs` `onSite`).

## What the docs-factory core emits (for reference)

`bun emit.mjs --slug <slug> --target unitycatalog` → `blogs/<slug>/dist/unitycatalog/`:

- `index.mdx` — frontmatter (`title`, `authors`, `category: guide`, `topics` from
  the draft's tags when they imply any, `date`, optional `description`, and
  `canonical` on a cross-post whose primary is another site), the component
  imports, then the body: `::::journey` → `<Journey><JourneyStep step="…">`,
  ```` ```likec4 ```` → `<LikeC4View viewId="…" alt="…" />`, ```` ```trestle ````
  → `<TrestleView src="/trestle/<slug>/…" alt="…" />`, callouts left as
  directives, and MDX-significant prose characters escaped.
- `assets.json` — the image manifest, `public` files, and `existing` (null →
  CREATE, set → UPDATE in place).
- `likec4-webcomponent.mjs` and `public/` — present when the post has a LikeC4 or
  Trestle diagram.

## Gotchas

- **Don't add `remark-mdx` to the emit parser.** The core serializes MDX only, so
  a bare `<>` in draft prose isn't parsed as JSX; prose is entity-escaped instead.
- **An UPDATE keeps the published date**: a draft without `date` takes it from
  `existing.post_dir`, so a re-emit doesn't re-date a live post.
