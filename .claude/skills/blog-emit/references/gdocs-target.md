# Google Docs delivery runbook

> **gdocs is now an opt-in flat export, not the review mechanism.** Blog/doc
> review happens in-app: the `site/` app renders the deployed draft and lets
> allowlisted reviewers leave per-section comments that survive edits (re-anchored
> by heading fingerprint, not orphaned on re-emit — the exact gdocs friction we
> left behind). Use this target only when someone specifically wants a Google Doc;
> for review, share the deployed draft URL.

The fixed MCP sequence the `blog-emit` skill follows to deliver a flattened draft
to Google Docs — **create** the first time, **update in place** every time after,
with images inserted inline. All `mcp__google__*` tools; a plain Node script can't
call them, which is why this is an agent step.

Inputs (from the core, step 2 of the skill):
- `blogs/<slug>/dist/<slug>.md` — the flattened Markdown (pass its **path**, not its
  content, to the tools that accept `*_file_path` — they read it server-side).
- `blogs/<slug>/dist/assets.json` — `{ title, existing, images[] }`.

## A. CREATE (assets.json `existing` is null)

1. **Create the Doc from the Markdown file:**
   ```
   docs_document_create_from_markdown(
     title = <assets.json title>,
     markdown_file_path = "<abs>/blogs/<slug>/dist/<slug>.md",
     pageless = true,
   )
   ```
   Capture `document_id` and `web_view_link` from the result.

2. **Insert images** — do section §C for every entry in `images[]`.

3. **Style pass** — §B2.

4. **Report** — §D (report the URL; do NOT share). Then the skill's shared **step 4**
   records the delivery in `blogs/<slug>/.emitted.json` under the `gdocs` key — see
   §E for the exact block. That mapping is what makes the next run an UPDATE.

## B. UPDATE (assets.json `existing` = `{ doc_id, url, updated }`)

The draft is canonical; re-emitting refreshes the **same** Doc (same URL, same
sharing) rather than making a new one. The whole body sits under the top `#` H1
(the post title), so replace that one section wholesale from the new Markdown:

1. **Dry-run the replace first** (surfaces the range + a preview, and warns about
   comments that would be orphaned):
   ```
   docs_document_edit_section(
     document_id = existing.doc_id,
     mode = "replace_section",
     heading = <assets.json title>,   # the top H1
     include_heading = true,          # replace the title line too
     content_file_path = "<abs>/blogs/<slug>/dist/<slug>.md",
     dry_run = true,
   )
   ```
   If the title heading changed since the last emit (so the anchor won't match),
   fall back to anchoring on `index = 1` (document start) with `mode =
   "replace_section"` is not valid — instead use the whole-body approach: inspect
   structure, delete the body range `[1, total_length)` via `docs_document_batch_update`
   raw `requests` (`deleteContentRange`), then `docs_document_edit_section(mode =
   "insert_after", index = 1, content_file_path = …)`. Prefer the heading anchor;
   this is the escape hatch.

2. **Apply** the same call with `dry_run = false`.

3. **Re-insert images** — §C for every entry in `images[]` (the replace removed the
   old inline images along with the old body; the placeholders are back in the
   fresh Markdown).

4. **Refresh** `gdocs.updated` in the post's `.emitted.json` sidecar — §E.

> **Comments caveat.** `replace_section` deletes and re-inserts the body, so any
> reviewer comment anchored to replaced text is orphaned. That is acceptable for a
> review doc; the dry-run preview lets you check before overwriting a
> comment-bearing section. This is the one cost of keeping the Markdown canonical.

## B2. Style pass — make code blocks and alignment read well (CREATE and UPDATE)

Google's Markdown import gets prose/headings/callouts right but renders fenced
**code blocks poorly**: each code line becomes a plain justified paragraph — no
shading, no container, `text-align:justify` stretching the spacing. Fix it with one
`batch_update` styling pass after the content is in place. This is a **rendering**
concern (it doesn't change text/indices), so run it last, after B/§A and the image
insert, and it's safe to re-run.

1. **Find the code paragraphs.** The reliable signal is font: code text is
   `Roboto Mono`, prose is `DM Sans`. The privacy-filtered `docs_document_get`
   hides fonts, so export the doc as **HTML** to see them:
   `drive_file_export(file_id, mime_type="text/html", output_file_path=…, use_cache=false)`,
   then map the `Roboto Mono` spans back to paragraph index ranges via
   `docs_document_inspect_structure(detailed=true, compact=false)` over windows
   (it returns per-paragraph `start_index`/`end_index` + `text_preview`; the code
   paragraphs are the fenced-block lines, the `+---+` output tables, and the bold
   filename captions directly above a block). Merge adjacent code paragraphs into
   contiguous `[start,end]` ranges.
2. **Shade + left-align each code range**, and left-align the whole doc (kills the
   justified prose too) — one `batch_update` with raw `requests`:
   ```
   # per code range:
   { "updateParagraphStyle": {
       "range": { "startIndex": S, "endIndex": E },
       "paragraphStyle": {
         "alignment": "START",
         "shading": { "backgroundColor": { "color": { "rgbColor": {
           "red": 0.95, "green": 0.95, "blue": 0.96 } } } } },
       "fields": "alignment,shading.backgroundColor" } }
   # once for the whole body (alignment only, so it won't wipe the shading):
   { "updateParagraphStyle": {
       "range": { "startIndex": 1, "endIndex": <total_length-1> },
       "paragraphStyle": { "alignment": "START" }, "fields": "alignment" } }
   ```
   `updateParagraphStyle` never shifts indices, so batch all ranges in one call.
   (Empty-paragraph cleanup is optional and index-shifting — skip it unless the
   vertical spacing is a real problem; if you do it, delete from the highest index
   downward so earlier ranges stay valid.)

> **Future improvement.** Finding code ranges by HTML-font-mapping is fiddly. The
> deterministic core (`emit/`) already knows which fences are code — it could emit
> the code-block texts into `assets.json` so this pass locates them by text search
> instead of font inspection. Worth doing if the styling pass becomes routine.

## C. Insert one image inline (used by both CREATE and UPDATE)

For an `images[]` entry `{ filename, localPath, altText }`:

1. **Upload the PNG/SVG to Drive:**
   ```
   drive_file_create(name = filename, ... )   # upload the bytes at localPath
   ```
   Capture the Drive `id`. (If the environment's `drive_file_create` doesn't take
   raw bytes, use the generic `google_write_api_call` to do a Drive `files.create`
   multipart upload of `localPath`.)

2. **Make the uploaded image fetchable by the Docs API.** `insertInlineImage`
   fetches the image by URL, which needs the *image file* (not the Doc) to be
   link-readable. This is a permission change on the **image asset**, so — like Doc
   sharing — treat it as the **user's call, not the skill's**: do NOT set
   `anyone`-readable automatically. Prefer a path that needs no public permission
   (e.g. embedding the bytes, or an already-accessible location); if the only way to
   embed is to make the image link-readable, **stop and ask the user** to okay that
   one permission rather than doing it silently. If images can't be embedded without
   it, leave the `[[IMAGE: …]]` placeholder as a caption and tell the user (they can
   drag the committed PNG in, or grant the permission themselves).

3. **Find the placeholder index.** The Markdown put a line `[[IMAGE: <filename>]]`
   where the image goes. Locate it:
   ```
   docs_document_inspect_structure(document_id = <docId>)   # find the element
   ```
   or `docs_document_get(document_id, bash_query = …)` to grep the placeholder text
   and read its `startIndex`/`endIndex`.

4. **Replace the placeholder with the inline image** in one `batchUpdate` using raw
   `requests` (delete the placeholder text, insert the image at that index):
   ```
   docs_document_batch_update(
     document_id = <docId>,
     requests = [
       { "deleteContentRange": { "range": { "startIndex": S, "endIndex": E } } },
       { "insertInlineImage": {
           "location": { "index": S },
           "uri": "https://drive.google.com/uc?export=download&id=<driveId>",
           # optionally objectSize to bound the width
       } },
     ],
   )
   ```
   Insert images **from last placeholder to first** (descending index) so earlier
   insertions don't shift the indices of later placeholders. Re-inspect if unsure.

## D. Report (do NOT share)

Report the Doc's `web_view_link` to the user. **Never share the Doc or change its
permissions** — do not call `drive_permission_create` (or any permission-changing
tool) on it, under any circumstances. Sharing is always the user's own action; they
decide the audience and do it themselves. This holds even for a "review" doc, even
`anyone`-with-link, even if the request seems to imply sharing.

## E. The `gdocs` sidecar block (recorded by the skill's shared step 4)

Recording the delivery is the skill's shared **step 4** (`blogs/<slug>/.emitted.json`,
keyed by target). The `gdocs` block shape is:

```json
{
  "gdocs": {
    "doc_id": "<documentId>",
    "url": "<web_view_link>",
    "updated": "<YYYY-MM-DD>"
  }
}
```

- **CREATE:** set the whole block (leave other targets' keys untouched).
- **UPDATE:** set `gdocs.updated` to today.

The core reads this same sidecar and echoes the decision into `assets.json` as
`existing` — so CREATE-vs-UPDATE is already decided for you by step 1.

## Notes

- **Never** pass raw `draft.md` to `docs_document_create_from_markdown` — always the
  core's `dist/<slug>.md` (raw draft has empty `file=` fences and leaks `:::`
  markers).
- `docs_document_create_from_markdown` and `docs_document_edit_section` both convert
  Markdown → Docs formatting server-side, so headings, the numbered `### Step N`
  sub-headings, code blocks, tables, and the `> **Warning**` blockquotes all land as
  real Doc formatting. Only images need the manual §C step (Docs can't fetch a local
  path from imported Markdown).
- **Formatting parity between CREATE and UPDATE depends on unwrapped prose.** The
  in-place `replace_section` converter treats every hard newline as a paragraph
  break, so hard-wrapped prose would shred into a ragged one-line-per-source-line
  column. The core's `remark-unwrap-prose` collapses each paragraph to a single line
  (code untouched), so `replace_section` now renders as cleanly as the rich
  `create_from_markdown` importer — the stable-URL update path looks the same as a
  fresh create. Don't reintroduce wrapping in the emitted `dist/<slug>.md`.
