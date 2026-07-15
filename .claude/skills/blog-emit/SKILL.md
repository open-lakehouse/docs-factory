---
name: blog-emit
description: |
  Emit a canonical blog draft (blogs/<slug>/draft.md) to a downstream target,
  starting with Google Docs for review. Runs the deterministic emitter core
  (resolves file= snippets, regenerates LikeC4 PNGs, flattens journeys and
  callouts to portable Markdown), then creates OR updates a Google Doc in place
  and reports its URL. Does NOT share the Doc — sharing is always the user's
  action. Use when the user wants to emit/export a draft to Google Docs, or push
  draft updates to an existing Doc.
argument-hint: 'A blogs/<slug> to emit (defaults target to gdocs; add --target <name> for others)'
---

# blog-emit: emit a draft to a downstream target

A blog `draft.md` is **canonical, portable CommonMark** — richness is a property of
the *renderer*, never the source (see
[`blogs/CONVENTIONS.md`](../../../blogs/CONVENTIONS.md) §5). This skill is the
delivery half of the emitter: it runs the deterministic core to produce a
self-contained, flattened Markdown render, then delivers it to a target. Today the
one target is **Google Docs**.

The split is deliberate:

- **Deterministic core** — [`emit/`](../../../emit/), a committed Node package. It
  does everything scriptable: resolve `file=` snippets, regenerate LikeC4 PNGs,
  flatten `::::journey`/`:::callout`/`likec4=` constructs to portable Markdown.
  **Do not reimplement any of this in the agent** — run the script.
- **Delivery adapter (this skill)** — the part that needs the Google MCP tools,
  which a Node script can't call. It creates/updates the Doc, uploads and inserts
  images, and shares.

The source of truth for *what the flattened Markdown contains* is
[`blogs/CONVENTIONS.md`](../../../blogs/CONVENTIONS.md) §5 and
[`emit/README.md`](../../../emit/README.md) — read them if a construct's rendering
is unclear; don't restate them here.

## Steps

### 1. Run the deterministic core

From the repo root:

```bash
cd emit && bun install    # first run only (installs unified/remark deps)
bun emit.mjs --slug <slug> --target gdocs
```

This writes `blogs/<slug>/dist/<slug>.md` and `blogs/<slug>/dist/assets.json`, and
prints whether delivery should **CREATE** a new Doc or **UPDATE** an existing one.
If the LikeC4 export fails for want of a browser, run `bunx playwright install
chromium` once and re-run.

### 2. Read the render + manifest

- `dist/<slug>.md` — the flattened Markdown to deliver.
- `dist/assets.json` — `{ slug, target, title, existing, images: [...] }`.
  - `existing` is the **create-vs-update decision**, sourced from the post's
    `.emitted.json` sidecar: `null` → create; an object `{ doc_id, url, updated }` →
    update that Doc in place.
  - each `images[]` entry is `{ filename, localPath, altText, likec4 }`;
    `localPath` is the real PNG/SVG on disk to upload (for a `likec4=` image it is
    the freshly regenerated export, not the committed copy).

The flattened Markdown carries one **image placeholder** per image — a line
`[[IMAGE: <filename>]]` (see `emit/targets/gdocs.mjs`). You will replace each with
the real inline image after the Doc exists.

### 3. Deliver to Google Docs — CREATE or UPDATE

Follow the fixed MCP runbook in
[`references/gdocs-target.md`](references/gdocs-target.md). In short:

- **CREATE** (`existing` is null): `docs_document_create_from_markdown` with the
  `dist/<slug>.md` body and `title` from the manifest → get the new `documentId`.
- **UPDATE** (`existing` set): reuse `existing.doc_id` — `docs_document_edit_section`
  with `mode: "replace_section"` anchored on the title H1 replaces the whole body
  from the new `dist/<slug>.md`, so the **URL and sharing survive**. This is what
  makes re-emitting idempotent: the draft stays canonical and the same Doc is
  refreshed, never duplicated. (Reviewer comments on replaced text are orphaned —
  the runbook dry-runs first so you can check.)

Then, for every image (from `assets.json`): upload the `localPath` to Drive
(`drive_file_create`), make it link-readable (`drive_permission_create`), find its
`[[IMAGE: <filename>]]` placeholder in the Doc, insert the image inline there
(`docs_document_batch_update` → `insertInlineImage`), and delete the placeholder
text — all per the runbook.

Finally, run the **style pass** (runbook §B2): Google's Markdown import renders
fenced code as justified, unshaded monospace paragraphs — one `batch_update`
grey-shades and left-aligns the code ranges and left-aligns the whole body, so code
reads as real blocks and the justified spacing is gone. Required on both CREATE and
UPDATE (import resets styling each time).

### 4. Record the delivery + report

- **On CREATE**, record the mapping in the post's sidecar so the next emit updates
  in place. In `blogs/<slug>/.emitted.json` (create it as `{}` if absent), set the
  `gdocs` key — leaving any other target keys untouched:
  ```json
  {
    "gdocs": {
      "doc_id": "<documentId>",
      "url": "<web_view_link>",
      "updated": "<YYYY-MM-DD>"
    }
  }
  ```
  Commit it (it is tracked, not gitignored). The mapping is now persisted for next
  time.
- **On UPDATE**, refresh `gdocs.updated` to today's date in the sidecar.
- **Report the Doc URL to the user.** Do **not** share it — see below.

## What this skill must NOT do

- **NEVER share the Doc or change its permissions.** Sharing is always the user's
  action — do not call `drive_permission_create` (or any permission change) on the
  Doc under any circumstances, even if the runbook mentions it, even for a
  "review" doc, even `anyone`-with-link, even if it seems implied. Just report the
  URL; the user shares it themselves.
- **Never edit `draft.md`** — the draft is canonical. The only per-post state this
  skill writes is `blogs/<slug>/.emitted.json` (the delivery mapping); it never
  touches any other file under `blogs/<slug>/` besides the generated `dist/` (which
  the core owns).
- **Never feed raw `draft.md` to the Doc importer** — its `file=` fences are empty
  and its `::::journey`/`:::tip` markers leak as literal text. Always deliver the
  core's `dist/<slug>.md`.
- **Never reimplement the flattening** — if the Markdown looks wrong, fix the core
  (`emit/`), not the agent.

## Adding a target

A new target (Delta.io, UC.io, …) is a new `emit/targets/<name>.mjs` (reusing the
whole `resolve → flatten` core) plus a new `references/<name>-target.md` runbook and
a short branch in step 3. The core and the ledger are already target-keyed
(`<slug>::<target>`), so idempotency carries over for free.
