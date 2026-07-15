# `emit/` — the deterministic emitter core

A blog `draft.md` is **canonical, portable CommonMark** — richness is a property
of the *renderer*, never the source (see [`blogs/CONVENTIONS.md`](../blogs/CONVENTIONS.md)
§5). The `site/` preview is one renderer (rich, interactive). This `emit/`
package is the **other end**: it *resolves* a draft and *flattens* its rich
constructs into portable, self-contained Markdown that a downstream target can
consume.

```bash
cd emit
bun install                                             # first run only
bun emit.mjs --slug unity-catalog-delta-api --target gdocs
#   → blogs/unity-catalog-delta-api/dist/unity-catalog-delta-api.md
#   → blogs/unity-catalog-delta-api/dist/assets.json
```

This is the **deterministic, scriptable half** of the emitter. It needs no agent
and no network beyond the one-time LikeC4 PNG export. Actual *delivery* to a target
(creating a Google Doc, uploading images, sharing) is a separate, agent-driven step
— the `/blog-emit` skill — because that needs the Google MCP tools, which a plain
Node script can't call.

## What it produces

Under `blogs/<slug>/dist/`:

- **`<slug>.md`** — resolved, self-contained CommonMark + GFM:
  - `file=` snippet fences are **inlined** with the real code from `snippets/*`.
  - `::::journey` timelines are **flattened** to numbered `### Step N — …` headings.
  - `:::tip` / `:::warning` / … callouts are **flattened** to bold-led blockquotes.
  - `likec4=`-titled images become plain images pointing at the regenerated PNG.
  - Frontmatter is consumed (its `title` becomes the top `#` heading); HTML
    `<!-- comments -->` are stripped.
  - Hard-wrapped prose is **unwrapped** to one line per paragraph (code untouched)
    so Google Docs' in-place `replace_section` converter reflows it cleanly instead
    of shredding each wrapped line into its own paragraph.
- **`assets.json`** — a manifest of every image in the output, so a delivery
  adapter can upload/insert images from data rather than re-parsing Markdown.

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

## Idempotency — update the same Doc, don't duplicate

`draft.md` (and its `dist/<slug>.md` render) is the canonical source; a delivered
Google Doc is a *copy* that should be **refreshed in place** on re-emit, not
duplicated. The delivery mapping lives in a committed **sidecar dotfile next to the
draft**, `blogs/<slug>/.emitted.json`, keyed by target — so it is self-contained in
the post folder and travels with the post (no global registry), while `draft.md`
itself stays pure (no tooling state in the canonical source):

```json
{
  "gdocs": {
    "doc_id": "1AbC…",
    "url": "https://docs.google.com/document/d/1AbC…/edit",
    "updated": "2026-07-14"
  }
}
```

On each run the core reads `.emitted.json` and prints — and echoes into
`assets.json` as `existing` — whether delivery should **CREATE** a new Doc or
**UPDATE** the recorded one. The `/blog-emit` skill performs the create/update and,
on create, writes the target's entry back into the sidecar. The sidecar is tracked
(a dotfile so it reads as tooling metadata, not content; only `dist/` is
gitignored).

## What it does NOT do

- **Never edits `draft.md`.** It reads the draft in place and writes only to
  `blogs/<slug>/dist/` (gitignored — a throwaway render, like `preview/dist/`). The
  draft stays byte-for-byte canonical; the only per-post state the delivery step
  writes is the sidecar `.emitted.json`, never the draft itself.
- **Does not deliver.** It stops at the flattened Markdown + manifest. Delivery is
  the `/blog-emit` skill.
- **Is not wired into CI.**

## Targets

`--target` selects a target module in `targets/`. Today: `gdocs` (Google Docs).
A new target (Delta.io, UC.io) is a new `targets/<name>.mjs` reusing the whole
`resolve → flatten` core, plus a short section in the delivery skill.

## Prerequisites

- Bun (matches `preview/`). Deps installed via `bun install`.
- For LikeC4 PNG regeneration: a headless Chromium — run `bunx playwright install
  chromium` once. The `--sequence` export lays a dynamic view out as a real
  sequence (lifelines), per `blogs/CONVENTIONS.md` §5.
