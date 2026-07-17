# `delta` target — delivery runbook

The delivery step (step 3 of `/blog-emit --target delta`) copies the core's rich
`.mdx` post into the sibling **`delta-io/website`** repo, expected at `../website`.
It renders richly there — interactive LikeC4 (`<likec4-view>`), `<Journey>` step
timelines, and `:::` callouts — via the same one-time wiring the unitycatalog target
uses, ported to this site (§D, already installed).

Confirm `../website` exists and is on a clean working branch before writing into it.
No MCP needed — it's a repo the user owns; this is a human-in-the-loop copy that never
pushes or opens a PR (that is the user's action).

## What the core emits (for reference)

`bun emit.mjs --slug <slug> --target delta` → `blogs/<slug>/dist/delta/`:

- `index.mdx` — delta-shaped YAML frontmatter (`title`, `description`, `author:
  [<profile-id>]`, `publishedAt` ISO date, `thumbnail: ./<file>`), then default
  imports (`Journey`, `JourneyStep`, `LikeC4View` from `@/components/blog`), then body.
  `::::journey`→`<Journey><JourneyStep step="…">`; `likec4=`→`<LikeC4View viewId="…" />`;
  `:::` callouts LEFT as directives but **remapped** to the delta site's vocabulary
  (`tip`→`note`, `caution`→`danger`; `note`/`info`/`warning`/`danger` unchanged);
  MDX-significant chars in prose escaped.
- `assets.json` — image manifest (`filename` = `./<filename>` in the MDX; `localPath`
  = file to copy in, incl. the regenerated LikeC4 PNG fallback).
- `likec4-webcomponent.mjs` — the `<likec4-view>` bundle (present when the post has a
  diagram).

## A. Reconcile the author → profile (the sharp edge — BEFORE copying)

The delta blog schema requires `author` as `reference("profiles")` (single or array);
a build FAILS if any id has no `src/content/profiles/<id>/` entry. The core slugified
the draft `author` into the `author` list. For each id:

- Check `../website/src/content/profiles/<id>/index.md` exists.
- **If missing, HALT and report** — do not invent a profile. The delta profile schema
  wants `name` (required), `photo` (optional image), `role` (optional). Tell the user:
  "Author profile `<id>` not found in delta-io/website. Create
  `src/content/profiles/<id>/index.md` (add `photo.jpg` if desired) or map the draft's
  `author` to an existing profile id, then re-run."

## A2. Verify the REQUIRED fields — `description` and `thumbnail`

Unlike unitycatalog, delta's schema makes **`description` and `thumbnail` required**
(zod fails the build without them). The core emits `description` from the draft's
`summary` and `thumbnail` from a draft `thumbnail`/`hero` field.

- Inspect the emitted `index.mdx` frontmatter. **If `description` is absent** (the
  draft had no `summary`) or **`thumbnail` is absent** (no `thumbnail`/`hero`, or the
  referenced image isn't in `images[]`/on disk to copy), **HALT and report** — do not
  fabricate a description or a placeholder thumbnail. Tell the user which is missing
  and ask them to add `summary:` and/or a `thumbnail:` image to the draft and re-run.
- Only proceed once both resolve.

## B. Copy into the sibling repo — CREATE or UPDATE

Determine the dated post dir: `<YYYY-MM-DD>-<slug>` where the date is the draft's
`date`/`publishedAt` (ISO). On UPDATE, reuse `existing.post_dir` verbatim (keeps the
collection `id` stable).

```
DEST=../website/src/content/blog/<YYYY-MM-DD>-<slug>
```

- Create `DEST` (`mkdir -p`). Copy `dist/delta/index.mdx` → `$DEST/index.mdx`.
- For each `images[]` entry, copy `localPath` → `$DEST/<filename>` (co-located; the
  MDX references `./<filename>`).
- Copy the thumbnail image the frontmatter references (`thumbnail: ./<file>`) into
  `$DEST/<file>` too, if it isn't already one of the `images[]`.
- If `likec4-webcomponent.mjs` was produced, copy it to
  `../website/public/likec4/likec4-webcomponent.mjs` (the stable path
  `LikeC4View.astro` loads). Safe to overwrite — generated from the whole `blogs/`
  model.

## C. Build-verify, then report

```bash
cd ../website && pnpm install && pnpm build
```

Must pass zod schema validation + MDX compile. **Known local caveat:** a full `pnpm
build` fails on the `/learn/videos` page unless a real `YOUTUBE_API_KEY` is set — this
is pre-existing and unrelated to the blog. To verify the post itself without a key,
run `pnpm dev` and fetch the post route
(`/blog/<YYYY-MM-DD>-<slug>/`): confirm the HTML contains `<likec4-view …>`, the
`jr-step`/`jr-bubble` journey markup, and `callout callout-<name>` boxes, and that the
LikeC4 canvas hydrates in a real browser.

Then **report** the post dir + preview URL. The skill's shared step 4 records the
`delta` sidecar block `{ post_dir, updated }`. Opening a PR on `../website` is the
**user's** action — prepare the branch/diff if asked, but never push/open it unbidden.

---

## D. One-time site wiring (installed + verified 2026-07-17 — reference / re-verify)

The below is the enabling wiring the delta site needed to render rich MDX posts. It
was added and verified when the delta target was built; treat this as documentation
and a re-verify checklist. If a `pnpm build`/`pnpm dev` fails on a missing piece,
restore it. The site is **Astro 5, pnpm, `astro-orbit`**; the delta site uses caret
(`^`) version ranges (unlike unitycatalog-website's exact pins), so match that.

1. **MDX integration** — Astro 5 needs `@astrojs/mdx` 4.x (v7 requires Astro 7):
   ```bash
   pnpm add @astrojs/mdx@4.3.14
   ```

2. **`astro.config.mjs`** — register the MDX integration (first in `integrations`)
   and the `@/*`→`src/*` Vite alias. The site's existing `markdown.remarkPlugins`
   (its `lib/remarkPlugins.ts` callout handler) already apply to `.mdx` because MDX
   extends the base Markdown pipeline — so callouts style with no extra wiring:
   ```js
   import { fileURLToPath } from "node:url";
   import mdx from "@astrojs/mdx";
   // …
   vite: { resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } },
   integrations: [ mdx(), /* …existing… */ ],
   ```

3. **`tsconfig.json`** — add the `@/*` path (alongside the existing `@config/*`,
   `@utils/*`): `"@/*": ["src/*"]`.

4. **`src/content.config.ts`** — broaden the blog loader glob to
   `pattern: "**/index.{md,mdx}"` (was `**/index.md`). **This is the easy-to-miss
   one:** without it the `.mdx` post is silently excluded from the collection — no
   build error, just a 404 and a "no matching static path" warning. Zod schema
   unchanged.

5. **`src/pages/blog/[id].astro`** — pass the components to `<Content>`:
   ```astro
   import Journey from "@/components/blog/Journey.astro";
   import JourneyStep from "@/components/blog/JourneyStep.astro";
   import LikeC4View from "@/components/blog/LikeC4View.astro";
   const mdxComponents = { Journey, JourneyStep, LikeC4View };
   // …
   <Content components={mdxComponents} />
   ```
   (Callouts need NO component — they're `:::` directives the site's remark handler
   turns into `<div class="callout callout-<name>">`.)

6. **Components + CSS** in `src/components/blog/` (ported from unitycatalog-website):
   - `Journey.astro` — `<ol class="jr">` wrapping the steps (CSS-counter numbered).
   - `JourneyStep.astro` — `<li class="jr-step">` with bubble/title/body slot.
   - `LikeC4View.astro` — emits `<likec4-view view-id={viewId} dynamic-variant="sequence">`
     + `<script type="module" src="/likec4/likec4-webcomponent.mjs" is:inline>`
     (the `is:inline` is REQUIRED — a bundled import of a `/public` path fails Vite).
   - `blog-rich.css` — `.jr-*` / `.callout-*` / `likec4-view` styling scoped under
     `.blog-body`, mapped onto astro-orbit's `--color-*` tokens. NB: keyed to this
     site's `.callout.callout-<name>` classes (its handler emits a bare `<div>`, so
     there is no `.callout-head`/icon, unlike unitycatalog's `<aside data-type>`).
     Imported once by `Post.astro`.

7. **`src/layouts/Post.astro`** — `import "@/components/blog/blog-rich.css"` and add
   the `blog-body` class to the prose wrapper (`<Typography variant="prose"
   className="blog-body">`) so the CSS scopes to the post body. Post.astro renders the
   title as an `<h1>` from `post.data.title`, which is why the target sets
   `titleAsH1: false`.

8. **`public/likec4/likec4-webcomponent.mjs`** — the delivery step (§B) drops the
   generated bundle here (loaded by `LikeC4View.astro`).

## Gotchas

- **Callout vocabulary is remapped in the emitter, not the site.** The delta site's
  handler only styles `note/info/warning/danger`; the target's
  `remark-callouts-directive-remap` renames our `tip`→`note`, `caution`→`danger`
  before emit, so the site handler needs no change.
- **`author` (singular) not `authors`; `publishedAt` not `date`; `thumbnail`
  required.** The delta schema differs from unitycatalog's — the target's
  `frontmatter` hook maps to it, but the required `description`/`thumbnail` are the
  halt-if-missing checks in §A2.
