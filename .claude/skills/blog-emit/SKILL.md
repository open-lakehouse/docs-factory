---
name: blog-emit
description: |
  Emit a canonical blog draft (blogs/<slug>/draft.md) to a downstream target. Runs
  the deterministic emitter core (resolves file= snippets, regenerates LikeC4 PNGs,
  renders journeys/callouts/diagrams per the target), then delivers the result and
  records the delivery for idempotent re-emits. Targets:
    - gdocs (default) — create OR update a Google Doc in place for review; reports
      the URL, never shares it.
    - unitycatalog — a rich native Astro MDX post in the sibling unitycatalog-website
      repo (interactive LikeC4, <Journey> timelines, :::callouts).
    - delta — a rich native Astro MDX post in the sibling delta-io/website repo
      (../website), same rich rendering.
  Use when the user wants to emit / export / cross-publish a draft to Google Docs,
  unitycatalog.io, or delta.io, or to refresh an already-delivered post there.
argument-hint: 'A blogs/<slug> to emit. Add --target <gdocs|unitycatalog|delta> (defaults to gdocs).'
---

# blog-emit: emit a draft to a downstream target

A blog `draft.md` is **canonical, portable CommonMark** — richness is a property of
the *renderer*, never the source (see
[`blogs/CONVENTIONS.md`](../../../blogs/CONVENTIONS.md) §5). This skill is the
**delivery** half of the emitter: it runs the deterministic core to produce a
target-shaped render, then delivers it to that target and records the delivery so a
re-emit updates in place rather than duplicating.

The design is a **target-agnostic spine + one per-target runbook**:

- **Deterministic core** — [`emit/`](../../../emit/), a committed Node package. It
  does everything scriptable: resolve `file=` snippets, regenerate LikeC4 PNGs, and
  render each rich construct (`::::journey`, `:::callout`, `likec4=`, code captions)
  the way the chosen target needs — flattened to portable Markdown (gdocs) or
  upgraded to site components (unitycatalog, delta). It dispatches on `--target`;
  each target is a module in [`emit/targets/`](../../../emit/targets/). **Do not
  reimplement any of this in the agent** — run the script.
- **Delivery adapter (this skill)** — the part that needs judgment, MCP tools, or
  filesystem writes a Node script can't/shouldn't do. The **spine below (steps 1–2,
  4) is identical for every target**; the target-specific delivery mechanics live in
  a single sidecar runbook, [`references/<target>-target.md`](references/), which you
  load in step 0 and follow in step 3.

The source of truth for *what a target's render contains* is
[`blogs/CONVENTIONS.md`](../../../blogs/CONVENTIONS.md) §5,
[`emit/README.md`](../../../emit/README.md), and the target module
(`emit/targets/<target>.mjs`) — read them if a construct's rendering is unclear;
don't restate them here.

## Steps

### 0. Resolve the target and load its runbook

Read `--target` from the arguments; **default to `gdocs`** if absent. Valid targets
are the modules in `emit/targets/` (`gdocs`, `unitycatalog`, `delta`).

Then **read the matching runbook and follow it for step 3** — and only that one (this
is the progressive-disclosure seam; don't load the others):

| target        | runbook                                      | delivers to                              |
| ------------- | -------------------------------------------- | ---------------------------------------- |
| `gdocs`       | [`references/gdocs-target.md`](references/gdocs-target.md)               | a Google Doc (MCP)                        |
| `unitycatalog`| [`references/unitycatalog-target.md`](references/unitycatalog-target.md) | `../unitycatalog-website` (Astro MDX)     |
| `delta`       | [`references/delta-target.md`](references/delta-target.md)               | `../website` — delta-io/website (Astro MDX) |

### 1. Run the deterministic core

From the repo root:

```bash
cd emit && bun install    # first run only (installs unified/remark deps)
bun emit.mjs --slug <slug> --target <target>
```

This writes, under `blogs/<slug>/dist/<target>/`:

- the render — `<slug>.md` (gdocs) or `index.mdx` (unitycatalog, delta);
- `assets.json` — `{ slug, target, title, existing, images: [...] }`;
- `likec4-webcomponent.mjs` — the interactive-diagram bundle (rich targets, only when
  the post has a `likec4=` diagram);

and, shared at `blogs/<slug>/dist/.likec4-export/<viewId>.png`, regenerated PNGs. It
also prints whether delivery should **CREATE** or **UPDATE**. If the LikeC4 export
fails for want of a browser, run `bunx playwright install chromium` once and re-run.

### 2. Read the render + manifest

- the render file — deliver **this**, never the raw `draft.md` (its `file=` fences are
  empty and its `:::`/`::::` markers would leak).
- `dist/<target>/assets.json`:
  - `existing` is the **create-vs-update decision**, sourced from the post's
    `.emitted.json` sidecar under the `<target>` key: `null` → CREATE; an object →
    UPDATE that delivery in place. Its **shape is target-specific** (gdocs:
    `{ doc_id, url, updated }`; unitycatalog/delta: `{ post_dir, updated }`) — the
    runbook you loaded describes it.
  - each `images[]` entry is `{ filename, localPath, altText, likec4 }`; `localPath`
    is the real file on disk to upload/copy (for a `likec4=` image it is the freshly
    regenerated export, not any committed copy).

### 3. Deliver — follow the runbook from step 0

Do the CREATE-or-UPDATE delivery exactly as the target's runbook specifies. That is
the only target-specific part of this skill.

### 4. Record the delivery + report

The delivery mapping lives in a **committed sidecar dotfile** next to the draft,
**`blogs/<slug>/.emitted.json`**, keyed by target — self-contained in the post's
folder (it travels with the post, no global registry) while `draft.md` stays pure.

- **On CREATE**, read the sidecar (treat missing as `{}`), set the `<target>` key to
  the block the runbook specifies, **leaving any other target keys untouched**, write
  it back, and commit it (tracked, not gitignored). This is what makes the next emit
  an UPDATE, not a duplicate.
- **On UPDATE**, refresh that target's `updated` to today's date.
- **Report** the result (Doc URL / post dir + preview URL) to the user.

## What this skill must NOT do (all targets)

- **Never edit `draft.md`** — the draft is canonical. The only per-post state this
  skill writes is `blogs/<slug>/.emitted.json` (the delivery mapping); it never
  touches any other file under `blogs/<slug>/` besides the generated `dist/` (which
  the core owns).
- **Never feed raw `draft.md` to the target** — always deliver the core's
  `dist/<target>/` render (see step 2).
- **Never reimplement the core's transforms** — if the render looks wrong, fix the
  core (`emit/`, a plugin, or the target module), not the agent.
- **Never publish/share on the user's behalf.** This is the shared invariant behind
  every runbook's "do NOT share / do NOT push": for `gdocs`, never change the Doc's
  permissions (report the URL, the user shares it); for the repo targets, never push
  or open a PR on the sibling repo without explicit instruction. Delivery stops at a
  local artifact the user then chooses to release.

## Adding a target

A new target is: (1) a new `emit/targets/<name>.mjs` (reusing the whole
`resolve → render` core — declare its `constructs`, `frontmatter`, and flags, per the
module docs in `emit/targets/gdocs.mjs`); (2) a new `references/<name>-target.md`
runbook; (3) a row in the step-0 table above. The core and the `.emitted.json` ledger
are already target-keyed, so idempotency carries over for free. The delta target was
added exactly this way — its runbook doubles as a worked example, including the
one-time sibling-repo site wiring a rich MDX target needs.
