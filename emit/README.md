# `emit/` — the deterministic emitter core

A blog `index.md` is **canonical, portable CommonMark** — richness is a property
of the *renderer*, never the source (see [`blogs/CONVENTIONS.md`](../blogs/CONVENTIONS.md)
§5). The `site/` preview is one renderer (rich, interactive). This `emit/`
package is the **other end**: it *resolves* a draft and *flattens* its rich
constructs into portable, self-contained Markdown that a downstream target can
consume.

```bash
cd emit
bun install                                             # first run only
bun emit.mjs --slug unity-catalog-delta-api --target unitycatalog
#   → blogs/unity-catalog-delta-api/dist/unitycatalog/index.mdx
#   → blogs/unity-catalog-delta-api/dist/unitycatalog/assets.json
```

This is the **deterministic, scriptable half** of the emitter. It needs no agent
and no network beyond the one-time LikeC4 PNG export. Actual *delivery* to a target
(copying the MDX post into the sibling site repo, uploading images) is a separate,
agent-driven step — the `/blog-emit` skill — because that needs judgment and
filesystem writes into another repo.

> **Review happens in-app, not in an external Google Doc.** The `site/` app has a
> per-section commenting + review/release surface (allowlisted reviewers comment
> on the deployed draft; re-editing re-anchors comments instead of orphaning
> them). The old `gdocs` export target was removed once this landed — share the
> deployed draft URL for review instead.

## What it produces

Output is written **per target** under `blogs/<slug>/dist/<target>/`, so
cross-publishing (unitycatalog → delta → …) is non-destructive. The
regenerated LikeC4 PNG export is shared at `dist/.likec4-export/`
(target-agnostic) and comes from the unified `architecture/model` workspace.

For the `unitycatalog` (RICH, component) target, `dist/unitycatalog/`:

- **`index.mdx`** — a rich Astro MDX post with UC-shaped frontmatter:
  - `::::journey` → `<Journey><JourneyStep>`; `likec4=` images → `<LikeC4View>`
    (interactive canvas); `:::` callouts are **left as directives** (the site styles
    them); `file=` snippets inlined; a snippet's filename is **kept on the fence** as
    `title="x.py"` meta — the site renders fences with Expressive Code, which turns
    that into a native filename frame (so, unlike a flattening target, this one does
    NOT run `remark-code-caption`).
  - Frontmatter is **mapped** to the site's zod schema (title / authors[] from the
    draft author / `category: guide` / human date / optional description); the title
    is NOT emitted as a body H1 (the site renders it) and prose is not unwrapped.
  - MDX-significant chars in prose (`<`, `>`, `{`, `}`) are entity-escaped.
- **`likec4-webcomponent.mjs`** — the framework-agnostic LikeC4 web-component
  bundle (when the post has a diagram).
- **`assets.json`** — a manifest of every image in the output, so a delivery
  adapter can upload/insert images from data rather than re-parsing Markdown.

The `delta` target (`dist/delta/`) is the same shape with a delta-io-shaped
frontmatter schema and a callout-vocabulary remap.

The one **FLATTENING** target is the internal `md-twin` (used by the site build,
not `/blog-emit`): it renders portable CommonMark instead of MDX components —
`::::journey` → numbered `### Step N — …` headings, `:::` callouts → bold-led
blockquotes, `likec4=` images → plain images, and hard-wrapped prose reflowed to one
line per paragraph. See [`targets/md-twin.mjs`](targets/md-twin.mjs).

## How it reuses the preview's transforms

The snippet-extraction and prose-colon guard are **target-agnostic** — they must
have exactly one implementation. `emit.mjs` imports them **verbatim** from `site/`
by relative path (they are dependency-free ESM):

- `../site/src/plugins/remark-code-snippets.mjs` — inlines `file=`/`start=`/`end=`.
- `../site/src/plugins/remark-directive-prose-guard.mjs` — undoes false-positive
  text directives so prose colons (`**1:1**`, `8080:8080`) survive.

The rich constructs need a *different* rendering per target — the preview emits
React (JSX) components; this emitter emits Markdown. So the journey/callout/likec4
transforms have **Markdown-emitting** variants living here in `plugins/`
(`remark-journey-md.mjs`, `remark-callouts-md.mjs`, `remark-likec4-md.mjs`,
`remark-code-caption.mjs`). One implementation per render flavor, deliberately.
`remark-code-caption` is used only by **FLATTENING** targets (md-twin) — it exists
because plain Markdown has no code-block chrome to hang a filename on, so it lifts a
fence's `title=` into a bold caption line; the `unitycatalog`/`delta` targets instead
leave `title=` on the fence for Expressive Code to render.

## Idempotency — update the same post, don't duplicate

`index.md` (and its `dist/<target>/index.mdx` render) is the canonical source; a
delivered post is a *copy* that should be **refreshed in place** on re-emit, not
duplicated. The delivery mapping lives in a committed **sidecar dotfile next to the
draft**, `blogs/<slug>/.emitted.json`, keyed by target — so it is self-contained in
the post folder and travels with the post (no global registry), while `index.md`
itself stays pure (no tooling state in the canonical source):

```json
{
  "unitycatalog": {
    "post_dir": "2026-07-03-unity-catalog-delta-api",
    "updated": "2026-07-17"
  }
}
```

On each run the core reads `.emitted.json` and prints — and echoes into
`assets.json` as `existing` — whether delivery should **CREATE** a new post or
**UPDATE** the recorded one. The `/blog-emit` skill performs the create/update and,
on create, writes the target's entry back into the sidecar. The sidecar is tracked
(a dotfile so it reads as tooling metadata, not content; only `dist/` is
gitignored).

## What it does NOT do

- **Never edits `index.md`.** It reads the draft in place and writes only to
  `blogs/<slug>/dist/` (gitignored — a throwaway render, like `preview/dist/`). The
  draft stays byte-for-byte canonical; the only per-post state the delivery step
  writes is the sidecar `.emitted.json`, never the draft itself.
- **Does not deliver.** It stops at the rendered Markdown/MDX + manifest. Delivery is
  the one `/blog-emit` skill, which dispatches on `--target` and follows a per-target
  runbook in its `references/`.
- **Is not wired into CI.**

## Targets

`--target` is **required** and selects a target module in `targets/`:

- **`unitycatalog`** — the UnityCatalog.io / OpenLakehouse Astro site (a RICH,
  component target: MDX with interactive LikeC4 + `<Journey>` + `:::` callouts).
- **`delta`** — the Delta.io Astro site (`delta-io/website`, sibling `../website`) —
  also a RICH, component target (same interactive LikeC4 + `<Journey>` + `:::`
  callouts), with a delta-shaped frontmatter schema and callout-vocabulary remap.

Delivery for both is the single `/blog-emit` skill (`--target` picks the runbook).
There is also an internal **`md-twin`** (FLATTENING) target, invoked by the site
build (`site/scripts/build-md-twins.mjs`), not by `/blog-emit`.

The pipeline is **target-aware**: a target module declares its per-construct
renderers (`constructs: { callouts, journey, codeCaption, likec4 }`) plus flags
(`titleAsH1`, `unwrapProse`, `stringifyExtension`, `safeText`, `outputFile`,
`componentImportBase`, `likec4WebComponent`) — so one target can flatten while
another upgrades to components, over one shared `resolve` core. A new target is a new
`targets/<name>.mjs` (+ any rewrite plugins in `plugins/`) plus a
`references/<name>-target.md` runbook in the `/blog-emit` skill; the core stays
untouched.

## Prerequisites

- Bun (matches `preview/`). Deps installed via `bun install`.
- For LikeC4 PNG regeneration: a headless Chromium — run `bunx playwright install
  chromium` once. The `--sequence` export lays a dynamic view out as a real
  sequence (lifelines), per `blogs/CONVENTIONS.md` §5.
