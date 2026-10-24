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
bun emit.mjs --slug unity-catalog-delta-api             # every target in its `target:` list
bun emit.mjs --slug unity-catalog-delta-api --target unitycatalog,delta
```

This is the **deterministic, scriptable half** of the emitter. It needs no agent
and no network. Actual *delivery* to a target
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
cross-publishing (unitycatalog → delta → …) is non-destructive. Each LikeC4
view's Mermaid is generated once into `dist/.likec4-export/<viewId>.mmd`
(target-agnostic) from the unified `architecture/model` workspace.

For the `unitycatalog` (RICH, component) target, `dist/unitycatalog/`:

- **`index.mdx`** — a rich Astro MDX post with UC-shaped frontmatter:
  - `::::journey` → `<Journey><JourneyStep>`; `likec4` blocks → `<LikeC4View>`
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
blockquotes, `likec4` and `trestle` blocks → the alt text plus the diagram's Mermaid,
and hard-wrapped prose reflowed to one
line per paragraph. See [`targets/md-twin.mjs`](targets/md-twin.mjs).

## How it reuses the preview's transforms

The snippet-extraction and prose-colon guard are **target-agnostic** — they must
have exactly one implementation. `emit.mjs` imports them **verbatim** from `site/`
by relative path (they are dependency-free ESM):

- `../site/src/plugins/remark-code-snippets.mjs` — inlines `file=`/`start=`/`end=`.
- `../site/src/plugins/remark-directive-prose-guard.mjs` — undoes false-positive
  text directives so prose colons (`**1:1**`, `8080:8080`) survive.

The rich constructs need a *different* rendering per target — the preview emits
React (JSX) components; this emitter emits Markdown. So the journey/callout/image
transforms have **Markdown-emitting** variants living here in `plugins/`
(`remark-journey-md.mjs`, `remark-callouts-md.mjs`, `remark-images-md.mjs`,
`remark-code-caption.mjs`). Diagram markers are resolved by core passes every
target runs (`remark-likec4-blocks.mjs`, `remark-trestle-md.mjs`), each target
choosing the node a marker becomes (`renderLikeC4`, `renderTrestle`). One implementation per render flavor, deliberately.
`remark-code-caption` is used only by **FLATTENING** targets (md-twin) — it exists
because plain Markdown has no code-block chrome to hang a filename on, so it lifts a
fence's `title=` into a bold caption line; the `unitycatalog`/`delta` targets instead
leave `title=` on the fence for Expressive Code to render.

## Cross-posting — one primary, canonical cross-posts

A draft's `target:` is one site or a list (`target: [unitycatalog, delta]`). Without
`--target` the core emits every listed target; `--target` (repeatable, or a comma
list) picks some, with a warning for one the draft doesn't list. Targets render in
list order, and the LikeC4 Mermaid is generated once for all of them.

The first listed target is the **primary**. Every other target's frontmatter hook
receives `{ canonical }`, the primary's delivered URL, built by the primary module's
`postUrl(post_dir)` from its entry in `.emitted.json`, and writes it as `canonical`
so the copy defers to the primary in search. Until the primary has a recorded
delivery its URL is unknown: the core prints `canonical: pending` and emits the
cross-post without one, to re-emit once the primary is delivered. `assets.json`
carries `primary` and `canonical` for the delivery step.

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

`--target` (or each entry of the draft's `target:` list) selects a target module in
`targets/`; a listed site without one (`openlakehouse`) fails with
`no emitter for target`:

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
another upgrades to components, over one shared `resolve` core. A blog target also
declares `siteUrl` and `postUrl(postDir)`, which a cross-post's canonical is built from. A new target is a new
`targets/<name>.mjs` (+ any rewrite plugins in `plugins/`) plus a
`references/<name>-target.md` runbook in the `/blog-emit` skill; the core stays
untouched.

## Docs-site emission (`docs/`)

`docs/emit-docs.mjs` (`just emit-docs <site>`) is a second driver over the same
`emitOne` core. It renders a whole project (`content/<project>/`) into a static
site shell under `../sites/<site>/`. Each page goes through `emitOne` twice: the
`docs-site` target (authored Markdown, directives kept, snippets inlined) and
`md-twin`. The driver then adds navigation, head metadata, llms.txt, the
sitemap, scripts, and the vendored preview plugins.

A `nav.yml` entry `page: <project>:<bucket>/<slug>` cross-publishes another
project's page onto the site at `/<project>/<bucket>/<slug>`; its canonical URL
names the page on its own project's site.

It renders everything in memory, writes only files whose bytes changed, and
prints a page-level change report against the target's `.docs-emit.json`. The
site config (`docs/sites/<site>.mjs`) holds the project and the URL scheme.
Design: [`docs/design/docs-site-emission.md`](../docs/design/docs-site-emission.md).
Tests: `bun test docs`.

## Prerequisites

- Bun (matches `preview/`). Deps installed via `bun install`, plus `site/`'s
  (`likec4`, for the views' Mermaid).
