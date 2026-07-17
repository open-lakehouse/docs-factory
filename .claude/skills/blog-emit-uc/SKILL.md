---
name: blog-emit-uc
description: |
  Emit a canonical blog draft (blogs/<slug>/draft.md) INTO the sibling
  unitycatalog-website repo as a native Astro MDX blog post, retaining rich
  rendering — interactive LikeC4 diagrams (web component), <Journey> step
  timelines, and :::callouts. Runs the deterministic emitter core (target
  `unitycatalog`), reconciles the draft author against the site's profiles
  collection, then copies index.mdx + co-located assets + the LikeC4 web-component
  bundle into the site and records the delivery. Use when the user wants to
  cross-publish / push a draft to unitycatalog.io (OpenLakehouse), or refresh an
  already-published post there.
argument-hint: 'A blogs/<slug> to emit to the unitycatalog-website repo'
---

# blog-emit-uc: emit a draft to the UnityCatalog.io site

A blog `draft.md` is **canonical, portable CommonMark** — richness is a property of
the *renderer*, never the source (see
[`blogs/CONVENTIONS.md`](../../../blogs/CONVENTIONS.md) §5). This skill is the
delivery half for the **`unitycatalog`** target: it runs the deterministic core to
produce a self-contained `.mdx` post that renders RICHLY on the Astro site
(interactive LikeC4, `<Journey>` timelines, `:::` callouts), then copies it into the
sibling `unitycatalog-website` repo.

The split mirrors `/blog-emit`:

- **Deterministic core** — [`emit/`](../../../emit/), a committed Node package. For
  `--target unitycatalog` it: resolves `file=` snippets, regenerates LikeC4 PNGs,
  rewrites `::::journey`→`<Journey>` and `likec4=`→`<LikeC4View>` (leaving `:::`
  callouts as directives for the site to style), maps the draft frontmatter to the
  site's zod schema, and generates the LikeC4 web-component bundle. **Do not
  reimplement any of this** — run the script.
- **Delivery (this skill)** — the part that needs judgment/filesystem writes into an
  external repo: reconcile the author against the site's `profiles` collection, copy
  the post folder + assets in, and record the delivery. No MCP needed — it's a repo
  the user owns, so a human-in-the-loop copy (like `/blog-emit` never auto-shares).

The sibling repo is expected at `../unitycatalog-website` relative to this repo.
Confirm it exists (and is on a clean working branch) before writing into it.

## Steps

### 1. Run the deterministic core

From the repo root:

```bash
cd emit && bun install    # first run only
bun emit.mjs --slug <slug> --target unitycatalog
```

This writes, under `blogs/<slug>/dist/unitycatalog/`:

- `index.mdx` — the rich MDX post, with UC-shaped YAML frontmatter, component
  imports, `<Journey>`/`<JourneyStep>`, `<LikeC4View>`, and `:::` callouts intact.
- `assets.json` — `{ slug, target, title, existing, images: [...] }`.
- `likec4-webcomponent.mjs` — the framework-agnostic LikeC4 bundle (present only
  when the post has a `likec4=` diagram).

and, shared at `blogs/<slug>/dist/.likec4-export/<viewId>.png`, the regenerated PNG
fallbacks. If the LikeC4 export fails for want of a browser, run `bunx playwright
install chromium` once and re-run.

### 2. Read the render + manifest

- `existing` in `assets.json` is the **create-vs-update decision**, from the post's
  `.emitted.json` sidecar under the `unitycatalog` key: `null` → the post dir does
  not exist yet (CREATE); an object `{ post_dir, updated }` → refresh that dir
  (UPDATE), reusing its exact folder name so the collection `id` stays stable.
- each `images[]` entry is `{ filename, localPath, altText, likec4 }`. `localPath`
  is the real file to copy in (for a `likec4=` image it is the freshly regenerated
  `<viewId>.png` fallback). `filename` is what the MDX references as `./<filename>`.

### 3. Reconcile the author → profile (the sharp edge — do this BEFORE copying)

The site's blog schema requires `authors: [reference("profiles")]`; a build FAILS if
any author id has no `src/content/profiles/<id>/` entry. The core already slugified
the draft `author` into the `authors` list in `index.mdx` frontmatter. For each id:

- Check `../unitycatalog-website/src/content/profiles/<id>/index.md` exists.
- **If missing, HALT and report** — do not invent a profile (it needs a real `name`,
  `title`, and `photo.jpg` you can't fabricate). Tell the user:
  "Author profile `<id>` not found in unitycatalog-website. Create
  `src/content/profiles/<id>/{index.md,photo.jpg}` (or map the draft's `author` to an
  existing profile id) and re-run." Only proceed once every author id resolves.

### 4. Copy into the sibling repo — CREATE or UPDATE

Determine the dated post dir name: `<YYYY-MM-DD>-<slug>` where the date is the
draft's `date` frontmatter (ISO). On UPDATE, reuse `existing.post_dir` verbatim.

```
DEST=../unitycatalog-website/src/content/blog/<YYYY-MM-DD>-<slug>
```

- Create `DEST` (mkdir -p). Copy `dist/unitycatalog/index.mdx` → `$DEST/index.mdx`.
- For each `images[]` entry, copy `localPath` → `$DEST/<filename>` (co-located; the
  MDX references `./<filename>`, which Astro's image pipeline resolves).
- If `likec4-webcomponent.mjs` was produced, copy it to
  `../unitycatalog-website/public/likec4/likec4-webcomponent.mjs` (a shared, stable
  path the `LikeC4View.astro` component loads via `<script is:inline>`). It is safe
  to overwrite — the bundle is generated from the whole `blogs/` model.
- (Optional) If a thumbnail is desired, copy a hero image in and add
  `thumbnail: ./<file>` to the frontmatter — otherwise omit (schema allows it).

The **first time** this target is used, the sibling repo must have the one-time
enabling wiring (MDX integration, the `:::` callout remark handler, the
`Journey`/`JourneyStep`/`LikeC4View` components + CSS, the `@/*` alias, and the
`**/index.{md,mdx}` loader glob). See
[`references/unitycatalog-target.md`](references/unitycatalog-target.md) — check it's
present; if not, that reference lists exactly what to add.

### 5. Build-verify in the sibling repo

```bash
cd ../unitycatalog-website && pnpm install && pnpm build
```

Must pass zod schema validation + MDX compile. Then `pnpm preview` and confirm the
post renders: journey timeline, `:::` callouts as styled asides, and the LikeC4
canvas hydrates (a real browser check — the web component defines `<likec4-view>`
and attaches a shadow root; a static HTML grep is not sufficient for the diagram).

### 6. Record the delivery + report

- **On CREATE**, in `blogs/<slug>/.emitted.json` (create as `{}` if absent) set the
  `unitycatalog` key — leaving other target keys (e.g. `gdocs`) untouched:
  ```json
  {
    "unitycatalog": {
      "post_dir": "<YYYY-MM-DD>-<slug>",
      "updated": "<YYYY-MM-DD>"
    }
  }
  ```
  Commit it (tracked, not gitignored).
- **On UPDATE**, refresh `unitycatalog.updated` to today.
- **Report** the post dir path + the local preview URL to the user. Opening a PR on
  the `unitycatalog-website` repo is the **user's** action — prepare the branch/diff
  if asked, but do not push or open the PR without being told to.

## What this skill must NOT do

- **NEVER reimplement the core's transforms** — run `emit.mjs`.
- **NEVER edit `draft.md`.** It reads the draft in place; the only per-post state it
  writes is the `.emitted.json` sidecar.
- **NEVER fabricate an author profile** — halt and ask (step 3).
- **NEVER push or open a PR on the sibling repo** without explicit instruction, and
  never commit into it on the user's behalf beyond staging the prepared change.
