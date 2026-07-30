# Conventions — writing blogs

How we take a blog from a parked idea to a post that's ready to publish: the lifecycle,
what a brief must capture, how we draft and refine, how we cite code that lives
in other repos, and the multi-agent review we run before calling a post done.
This is the reusable playbook; follow it when adding a new post or improving an
existing one.

> **Skill seed → skills.** This doc was written to be lifted into blog skills, and
> now has been: the [`blog-post`](../.claude/skills/blog-post/) authoring skill
> (lifecycle + brief) and the [`blog-review`](../.claude/skills/blog-review/) skill
> (the review pass below) live in `.claude/skills/`. The scored quality *criteria*
> those skills grade against were extracted to [`QUALITY.md`](./QUALITY.md) — this
> doc stays the *process* (lifecycle, how the review is run); QUALITY.md is the
> *criteria* (what "good" is). Keep this doc prescriptive and example-light so it
> stays portable; when you change the process here, update the skills to match.

Blogs differ from the `wikipedia/` articles next door in three ways that shape
everything here: they are **authored and opinionated** (a voice, a stance — not
neutral point of view), they routinely **span several local code repositories**,
and they carry **an idea-parking step** before a full brief. Where the Wikipedia
workflow keeps three files per article (wikitext source + Markdown rendering),
blogs keep one canonical Markdown file — `index.md` *is* the source of truth.

## 1. Lifecycle of a post

The frontmatter `status` has exactly three canonical values — **`idea | draft |
ready`** — unified with content pages. Review is tracked in the DB review lifecycle
(in-review → approved → released), *not* in frontmatter.

1. **Idea.** Park a one-liner in `IDEAS.md`. No folder, no commitment — ideas
   can sit indefinitely. An idea worth ranking or reviewing early can graduate to
   an on-disk `blogs/<slug>/` folder at `status: idea` (the earliest reviewable
   artifact, where structural feedback is welcome) while still coexisting with its
   `IDEAS.md` entry.
2. **Brief (still `status: draft`, or `idea` if very early).** When an idea earns
   investment, create `blogs/<slug>/` and fill `brief.md` (template in §4) —
   especially thesis, audience, and source material (walk the real repos/PRs). This
   fixes *what* the post argues before any prose. Check the idea off in `IDEAS.md`
   and note the slug. Writing the brief is an activity *within* `draft`; the stage
   is signalled by which files exist (a `brief.md` with a thin/absent `index.md`),
   not by a distinct status value.
3. **Draft.** Write `index.md` from the outline. Baseline first (thesis + core
   sections); defer depth. Pull code samples from the cited refs.
4. **Refine / humanize.** Tighten structure and prose, then run the humanizer
   pass (§8). Verify every code sample and factual claim against its cited ref.
   (Refining is an activity, not a status — the post stays `status: draft`.)
5. **Review.** Run the multi-agent quality-review pass (§9), scored against
   [`QUALITY.md`](./QUALITY.md), and resolve its findings. The review outcome is
   recorded DB-side (in-review → approved → released), not in frontmatter.
6. **Ready → released.** Finalize front-matter/target, CTA, and links; the author
   sets `status: ready` once the post is publishable. Actual release is gated by the
   DB review state reaching `approved`/`released` — not by a frontmatter value. When
   rendering to an HTML target, run the **publish-target checklist** in
   [`QUALITY.md`](./QUALITY.md) (Schema.org Microdata, validated in Google's Rich
   Results Test) against the rendered page — this is a publishing concern, not a
   draft one. After publishing, record the live URL in the post's `.emitted.json`
   (per target) and in `README.md`. The SEO canonical `<link>` is emitted by the
   publishing site at render time — not a draft field (§5, "Emit to a downstream
   target").

**Folder rule.** One folder per post, keyed by a kebab-case slug
(`blogs/<slug>/`). Raw ideas live in `IDEAS.md`; a `<slug>/` folder is created when
an idea graduates — either to an early `status: idea` folder (worth ranking/reviewing
before it's briefed) or straight to a brief at `status: draft`. Each folder holds
`brief.md` and `index.md`; `assets/` (images) and `snippets/` (extracted, runnable,
verified code — §5) are created on demand, not scaffolded up front.

## 2. Ideas backlog (`IDEAS.md`)

A single flat, low-ceremony list of one-liners — deliberately lighter than a
brief. Park anything; no commitment. An idea **graduates to its own
`blogs/<slug>/` folder** once you can write its one-line thesis and name its
audience — as an early `status: idea` folder (worth ranking/reviewing before it's
fully fleshed) or straight to a brief at `status: draft`. Either way `IDEAS.md`
stays the home for raw, un-fleshed parking. Entry format: a title, a thesis line,
and optional inline `repos:` / `audience:` / `src:` tags pointing at origin
material. The moment an idea needs more structure than that, it wants a folder.

## 3. Front matter & tags

Both `brief.md` and `index.md` open with a YAML `---` block. Field names align
with MkDocs Material / Docusaurus so a post is portable to a real publishing
target with minimal reshaping — we are not inventing a metadata scheme.

```yaml
---
title: <Working title>
slug: <kebab-slug>
status: idea | draft | ready
date: <YYYY-MM-DD>            # last touched; advances as the post matures
tags: [<from tags.yml>, …]    # every tag MUST exist in blogs/tags.yml
series: <arc name>            # omit if the post is standalone
series_order: <n>             # omit if standalone
author: <Full Name>           # real person; the byline (§10). never "Admin"
target: <delta | unitycatalog | openlakehouse | …>
---
```

Where a post is *emitted* (Google Doc, a published site) is recorded per target in
the post's `blogs/<slug>/.emitted.json` sidecar (§5), not in the front matter — a
draft can go to several targets, and the SEO canonical `<link>` is the publishing
site's concern at render time, not a draft field.

**Tags** correlate posts by topic. Every tag used here **must exist in
`blogs/tags.yml`**, the known-tag registry. Reuse an existing tag before coining
a new one; if none fits, add the new tag to `tags.yml` (with its one-line
description) **in the same change** — never introduce a tag that lives only in a
post. This keeps the vocabulary deduplicated and discoverable.

Optionally, a tag entry may also carry a model anchor and curated external links
(docs/decisions/ADR-0001 hybrid join). These are additive — description-only entries stay valid:

```yaml
unity-catalog:
  description: "Unity Catalog / data governance"
  element: ucSpec                # optional: LikeC4 element id for hover cards
  externalRefs:                  # optional: curated expert links
    - { role: upstream, url: "https://www.unitycatalog.io" }
```

In the preview, topic tags render as clickable pills (filtered blog index on
click) with a hover card showing the description and, when `element:` is set,
the linked model object's summary and kind.

**Authors.** The `author` byline is a real person's full name and stays plain
text in the source (it degrades to a byline on GitHub). Rich rendering — avatar,
role, and social links — is a *renderer* concern, driven by the author registry
in [`blogs/authors.yml`](authors.yml): the preview looks the byline up by name
and shows an interactive author card. Add a person to `authors.yml` (with an
avatar under `blogs/authors/`, or none for an initials fallback) in the same
change that first bylines them; an unregistered byline still renders as plain
text. Mirrors the `profiles/` collections on unitycatalog.io and delta.io.

## 4. Brief template (`brief.md`)

The front-matter block (§3) followed by ten short sections; keep each to
bullets. Copy this to start a post.

1. **Hook / thesis** — one sentence: the single claim or promise. If you can't
   write it in one line, the post isn't ready to draft.
2. **Audience** — who it's for and what they already know; name the assumed
   prior knowledge so the draft doesn't over- or under-explain.
3. **Tone / voice** — first person, *how* opinionated, register, and the stance
   the post takes. This is authored, not neutral — state the point of view.
4. **Key takeaways** — 3–5 bullets the reader should remember; the spine of the
   outline and the wrap-up.
5. **Outline** — working H2 section list, one-line intent each; mark sections
   that carry a code sample. Keep it small; baseline first, defer depth.
6. **Source material** —
   - *Code (cross-repo):* one line each —
     `repo · path/to/file_or_dir · PR#/commit/tag` — what it shows.
   - *Prior art:* existing posts/docs/talks on this topic, and how this post
     differs from or responds to them.
   - *External refs:* specs, papers, issues (URL + one line).
7. **Call to action** — one or two next steps for the reader (try the crate,
   read the RFC, file feedback), not a pile.
8. **Publishing target / format** — where it goes and the constraints that
   implies (length norm, front-matter, image/asset handling, canonical/
   cross-post plan, license/disclosure).
9. **Verification / accuracy notes** — claims to check against real code before
   publishing; snippets must compile/run against the cited ref; anything
   internal/pre-release that must **not** be published.
10. **Open questions / risks** — unknowns and disclosure/COI concerns.

## 5. Draft conventions (`index.md`)

- **Voice.** First person, authored, opinionated — a stance is a feature. State
  the point of view; don't hedge into neutrality.
- **Structure.** Lead with the hook/thesis; short sections with descriptive,
  sentence-case H2s; baseline-first, defer depth; end on the call to action.
- **Code samples.** Minimal, real, and pulled from a cited ref; prefer a
  compiling excerpt over a sketch; label the language; show only the
  load-bearing lines. Verify against the pinned ref before publish.
- **Linking.** Link to source code at a **pinned permalink** (commit or tag, not
  a moving branch); link the prior art you're responding to and the CTA target.
  Link on first mention; don't over-link.
- **Front matter** present (§3); keep the body portable across targets.
- **Diagrams as code — [LikeC4](https://likec4.dev) is preferred.** Author
  interactive diagrams as dedicated views in
  `architecture/model/views/blog-views.likec4` and commit the rendered fallback image
  in the post's `assets/`, so the draft renders without a build step. This keeps
  the local preview on one LikeC4 Vite-plugin runtime while still allowing a
  post to carry purpose-built, protocol-level views with slug-prefixed ids.
  - **Richness is a property of the renderer, never the source.** `index.md`
    stays plain, portable Markdown that renders acceptably everywhere — on GitHub,
    in any Markdown viewer, and through the Google Docs export (below). A diagram
    is embedded as its committed **static image** and *upgraded* to an interactive
    LikeC4 view only by a richer renderer (the local `site/` harness and the
    published MDX site). Never put JSX or builder-specific syntax in `index.md`.
  - **Name the view in the image title** so a renderer can find it, staying
    100% CommonMark: `![real alt text](./assets/<name>.png "likec4=<viewId>")`.
    On static targets the title is just a tooltip and the PNG renders as-is; the
    `site/` harness (and the site) key off `likec4=<viewId>` to swap in the
    interactive view. An image with no `likec4=` title (a D2 SVG, a screenshot)
    stays a plain static image. **View ids are globally unique and slug-prefixed**
    (e.g. `ucDeltaApi_managedTableFlow`) because blog views share the estate
    LikeC4 workspace.
  - **Preview it richly (optional).** To see a draft rendered with the site's
    look and *interactive* diagrams before staging, run the throwaway root-level
    harness: `cd preview && bun install && bun run dev`. It reads drafts in place
    and never edits them — see [`site/README.md`](../site/README.md).
  - **Sequence diagrams** are a LikeC4 `dynamic view` (ordered
    `source -> target "label"` steps). Render with **`--sequence`** for a real
    lifeline layout — without it the static export falls back to a box-and-arrow
    graph (see [likec4#2532](https://github.com/likec4/likec4/issues/2532)):
    ```
    bunx likec4 export png --sequence --flat -f "<viewId>" -o blogs/<slug>/assets architecture/model
    ```
    (`likec4 start <dir>` opens the interactive viewer; pick the "sequence"
    variant there.) Static export needs a headless Chromium
    (`bunx playwright install chromium` once).
  - Keep blog-only elements clearly slug/topic-prefixed in `blog-views.likec4`.
    They may be more protocol-specific than the logical model, but they still
    share one renderer and should not masquerade as core architecture facts.
  - A publishing target may need a different export (SVG, inline) than the
    committed PNG — regenerate from the same `.likec4` source at publish.
  - **D2** ([d2lang.com](https://d2lang.com)) is still fine for an existing `.d2`
    or a quick one-off — commit `.d2` + `.svg`, render with
    `blogs/render-diagrams.sh` (needs `brew install d2`). Prefer LikeC4 for new
    diagrams. If you introduce yet another tool, note it here.
- **Runnable examples (one supported way).** When a code sample is worth *running*,
  not just reading, keep the runnable file in the post's `snippets/` — it is the
  verified source of truth. Name files `<verb>_<subject>.<ext>`
  (`create_external_location.py`, `config.sh`). Every snippet opens with a header
  comment: what it does, how to run it (`Run:`), what it needs (`Needs:`), and the
  pinned ref it was **verified against** (`Verified:` — §6).
  - **Inline the real snippet with a `file=` fence — don't hand-copy or elide.**
    `index.md` references the snippet and the renderer inlines it at build time
    (the `site/` harness resolves this; a publishing target runs the same
    contract), so the post always shows exactly the verified source with no drift:
    ````markdown
    ```python file=./snippets/read_write_delta_spark.py start=start:full end=end:full
    ```
    ````
    `file=` alone inlines the whole file; add `start=`/`end=` to inline only the
    region between marker lines (e.g. `# --8<-- [start:full]` / `[end:full]`), the
    markers excluded. Reference a region by its **full marker token**
    (`start=start:full end=end:full`, not `start=full`). **A shown block must be
    self-contained and runnable** — if you slice a region, include the imports and
    setup (a `SparkSession` builder, a DuckDB connection), never just the
    "interesting" lines. A code sample the reader can't actually run is the bug
    this fence exists to prevent. The block header shows the source file's
    basename automatically; override it with an explicit `title="…"`.
  - **Step journeys — render one runnable script as a numbered timeline.** When a
    single self-contained script has a natural *Step 1 → Step 2 → Step 3* shape,
    keep it as **one runnable file** but mark the steps with named regions
    (`# --8<-- [start:session]` / `[end:session]`, `[start:create]`, …, nested
    inside the outer `[start:full]`). Then author a `::::journey` container
    (**four** colons) whose steps are delimited by `###` headings; each step holds
    rich content — a short explanation, the code fence, and any callouts:
    ````markdown
    ::::journey
    ### Point Spark at UC
    One line on what this step does.
    ```python file=./snippets/x.py start=start:session end=end:session
    ```
    :::note
    An aside worth surfacing for this step.
    :::

    ### Create the table
    ```python file=./snippets/x.py start=start:create end=end:create
    ```
    ::::
    ````
    The renderer shows this as a GitHub-style vertical timeline (numbered dots +
    connector line): the `###` heading is the step title, the body flows beneath
    it. Steps auto-number by order. The file stays a single, verified,
    `uv run`-able script; the timeline is a *rendering* of it (it degrades to
    plain headings + code blocks on a static renderer). Prose colons like `**1:1**`
    or port maps `8080:8080` are safe — the harness guards against the directive
    parser eating them.
  - **Callouts — tips and warnings in a box.** Use `:::tip` / `:::note` / `:::info`
    / `:::warning` / `:::caution` / `:::danger` (three colons) for a boxed aside;
    they work in normal prose and inside a journey step. Add a custom heading with
    `:::warning[Heading]`. Keep them short — a callout is an aside, not a section.
    ````markdown
    :::warning
    A managed `CREATE` must set `delta.feature.catalogManaged = 'supported'`.
    :::
    ````
  - **TL;DR / key-takeaways box.** Mark the key-takeaways box (see [QUALITY.md](./QUALITY.md)
    — "the single most-quoted block" for AI) with the `:::tldr` container directive:
    3–5 fact-rich bullets near the top. It renders as a styled box in-app and
    flattens to a `> **TL;DR**` blockquote in the `.md` twins an agent fetches, so
    the takeaways travel inline. Override the label with `:::tldr[Key takeaways]`.
    The TL;DR is **body content only** — the page's exposed description stays
    frontmatter `summary`, never the TL;DR. Do **not** author it as a bare
    `**TL;DR**` label or a `# TL;DR` heading; the directive is the one canonical marker.
    ````markdown
    :::tldr
    - The UC Delta API is a versioned, intent-based, atomic REST surface.
    - It runs locally today against OSS Unity Catalog 0.5.
    :::
    ````
  - *Python — inline deps, run with `uv`.* Declare dependencies inside the `.py` in
    a [PEP 723](https://peps.python.org/pep-0723/) `# /// script … # ///` block so a
    reader copies the file and runs `uv run <file>.py` with no venv or `pip` — `uv`
    builds an ephemeral env from the inline metadata. `dependencies` is required (use
    `[]` if none); set `requires-python` and **pin dependency versions** to the cited
    ref's coordinates — a committed snippet is a reproducible artifact, the same
    contract as a pinned permalink. Edit the block with
    `uv add --script <file>.py '<pkg>'`. (`uvx` is `uv tool run`, for *published*
    tools — **not** local script files; use `uv run`.) A minimal template:
    ```python
    # /// script
    # requires-python = ">=3.12"
    # dependencies = ["requests==2.32.3"]
    # ///
    # config_check.py — discover the UC Delta API surface (GET /delta/v1/config).
    # Run:      uv run config_check.py
    # Needs:    UC_URL exported (local server via `docker compose up -d`).
    # Verified: unitycatalog v0.5.0 — HTTP 200, 12-endpoint list.
    import os, requests
    r = requests.get(f"{os.environ['UC_URL']}/api/2.1/unity-catalog/delta/v1/config",
                     params={"catalog": "unity"}, timeout=10)  # catalog is required
    r.raise_for_status()
    print(r.json())
    ```
    Note the honesty of the `Needs:` line: an example that needs a JVM (PySpark) or a
    running service is not pure copy-and-run, and the header says so.
  - *Services — Docker Compose.* Run a backing service (e.g. a local Unity Catalog
    server) with `docker compose up -d`. Prefer the **upstream `compose.yaml` at a
    pinned image tag**; commit a trimmed one in `snippets/` only when you must pin or
    slim it. Document the exact ports.
  - *Shell / REST — capture, don't hand-write.* A REST-walkthrough snippet is a
    **real captured transcript**, not a typed-up guess. Use `curl -sS --fail-with-body`
    so a copy-paste fails loudly. Pass secrets and endpoints as named env vars
    (`$UC_URL`, `$UC_TOKEN`) with a one-line "export these first"; never inline a real
    token or account id.
  - *Verify before publish.* Run each snippet against its pinned ref and record it in
    the header's `Verified:` line and the brief's §9 — the same verify-against-the-ref
    rule as §6/§10. There is deliberately **no build/run script** (unlike diagrams):
    the examples are few and several need live cloud storage or a JVM, so a generic
    runner would be ceremony that can't run the interesting cases. Other tools are
    fine; if a post needs one, note why in that post.
- **Emit to a downstream target (Google Docs today).** `index.md` is canonical,
  portable CommonMark; a *target emitter* resolves it into what a downstream target
  consumes. The deterministic core [`emit/`](../emit/) reuses the same
  snippet-inlining and LikeC4 PNG-regeneration the `site/` harness runs, and
  *flattens* the rich constructs to portable Markdown: a `file=` fence becomes a
  real fenced code block, a `::::journey` becomes numbered `### Step N — …`
  headings, `:::tip`/`:::warning`/… callouts become bold-led blockquotes, and each
  `likec4=` image is re-exported from the unified `architecture/model` workspace
  to a PNG. Run it with:
  ```
  bun emit/emit.mjs --slug <slug> --target gdocs
  ```
  which writes `blogs/<slug>/dist/<slug>.md` + `assets.json` (the `dist/` render is
  throwaway and gitignored — the draft stays the source of truth). **Google Docs
  delivery** is the [`/blog-emit`](../.claude/skills/blog-emit/) skill: it creates
  the Doc from the flattened Markdown (`docs_document_create_from_markdown`), uploads
  each PNG to Drive and inserts it inline, and shares it — and on re-emit it
  **updates the same Doc in place** (the Doc id/url live in a committed
  `blogs/<slug>/.emitted.json` sidecar, so the mapping travels with the post while
  `index.md` stays pure), so the draft stays canonical and the shared link never
  duplicates. Do **not** feed raw `index.md` to the Doc importer — its `file=`
  fences are empty and its `::::journey`/`:::tip` markers leak as literal text. The
  same `/blog-emit` skill also cross-publishes to the **UnityCatalog.io** and
  **Delta.io** Astro sites (`--target unitycatalog` / `--target delta`) — RICH
  targets that keep the constructs interactive (native MDX `<Journey>`, `<LikeC4View>`,
  styled `:::` callouts) rather than flattening them. A new target is a new
  `emit/targets/<name>.mjs` reusing the same core, plus a `references/<name>-target.md`
  runbook in the skill.

**Citability (human + AI readability).** Structure the draft so both a skimming
human and an AI can find, quote, and trust it: an answer-first intro, a
key-takeaways box near the top, and a lead sentence under each heading that answers
it. This is a scored review facet — the full criteria, and the rule that citability
must never flatten the authored voice, live in [`QUALITY.md`](./QUALITY.md) facet
(f). Adopt it as you draft; don't bolt it on later.

## 6. Cross-repo source material

Blogs draw on code across many repos, so cite it precisely. Use a structured
pointer, never a bare "see delta-rs":

**Start at the estate map to find the right artifact.** For the open-lakehouse
(`olai`) repos, [`../architecture/`](../architecture/) is a ref-free, canonical map of what
exists and how the pieces fit — use it as a *lead* to locate the right crate/file
and to get the framing right (see `blogs/STORYLINE.md` and `architecture/glossary.md`).
The map is deliberately **unpinned and never cited directly**: once you've found the
artifact, write the pinned pointer below and re-verify it per post, exactly as with
any other lead.

```
repo · path/to/file_or_dir · PR #/commit/tag — what it shows
delta-kernel-rs · kernel/src/scan/mod.rs · v0.3.0 — scan-state builder
```

Pin the ref to a **tag or commit SHA**, not a branch, so a snippet is
reproducible and a reader can find the exact code. Pointers rot — re-verify each
one at publish time. When a real, compilable excerpt is worth preserving
separately from the prose, keep it in the post's `snippets/` as a runnable file
(§5 "Runnable examples"); otherwise a fenced block inline in `index.md` is enough.

**Prose homes here; code stays home.** This repo is the canonical home for blog
material. DevRel *prose* written to become a post — narratives, sketches, build
logs — should be **moved into the post's `<slug>/source/`** rather than left as a
remote pointer in a code repo, so there is one copy and this repo owns it (when you
move it, fix any dangling references in the origin repo). Live, verifiable **code**
is the opposite: it stays in its home repo and is cited by pinned ref (above),
never copied — the code repo remains authoritative and the post re-verifies against
it at publish time.

**When the source pack is internal, find the public anchor first.** A brief is
often seeded from an internal design doc, PRD, or draft (labelled internal, or
just not shipped yet). Those are *leads*, not sources (§10). Before drafting,
locate the **public equivalent every load-bearing claim can re-anchor on** — the
released spec, the merged OSS PR, the tagged release, the public protocol doc —
and rebuild §6 around it, keeping the internal doc only as an unlisted lead. If
no public anchor exists yet, the post isn't ready to draft (it would leak or go
stale). Record the anti-leak check in the brief's §9. This step has bitten
consecutive briefs; do it up front, not in review.

**A public repo is not the same as a shipped source — but pre-release is not a
blocker.** Material can live in a public GitHub org and still be *pre-release* —
experimental, unpublished (consumed via `file:` links), feature-gated, or dependent
on a personal fork pinned by rev. We **publish as we develop**: a post can go out
against pre-release work and be **updated as the work lands** — unpublished
dependencies do *not* block drafting or publishing. What stays mandatory is
**honesty about status**: describe what is real *today*, **disclose** the
pre-release/fork/unpublished status plainly, and never present unshipped code as a
stable, installable product. Prefer to anchor a load-bearing claim on a published
spec/release where one exists (it dates better); where it doesn't, state the
pre-release status and revisit the claim as it ships. The code being *visible* lets
you cite it; just don't imply it is *stable* or *available* when it isn't.

## 7. Series / story arcs

When a post is part of a multi-post narrative, record the arc in `SERIES.md`
(name + through-line + ordered post list) and set `series` / `series_order` in
the front matter. Each post must **stand on its own** — a reader landing
mid-arc shouldn't be lost — while advancing the arc: open with a one-line
"previously / where this fits" and link prev/next. Keep the arc's thesis in
`SERIES.md` so individual briefs don't drift from it.

## 8. Refine / humanizer pass

Run the humanizer (`/humanizer`, or the Signs-of-AI-writing pattern catalog)
over each draft before review. Recurring tells to watch (shared with the
`wikipedia/` work):

- **Copula avoidance** — "serves as / encapsulates" where "is / implements"
  reads cleaner.
- **Rule of three** — forced triads packed into one sentence; split or trim.
- **Vague attribution** — "coverage has increasingly framed…"; tie to a time and
  a cited source.
- Also watch: em-dash overuse, superficial `-ing` clauses, filler, mechanical
  boldface.

Blog-specific note: humanizing removes AI *patterns*, **not** the author's
stance. Preserve the voice and the opinions — flatten the tells, not the point
of view.

## 9. Quality-review pass

Before a post is marked `status: ready`, run a multi-agent review modeled on the
`/code-review` skill's **dispatch → score → consolidate** shape, adapted to
blogs. This is implemented as the [`blog-review`](../.claude/skills/blog-review/)
skill; the criteria each facet is graded against live in
[`QUALITY.md`](./QUALITY.md). The review is **advisory** — it produces scores and
findings; the author decides when to set `status: ready`, and the DB review state
(in-review → approved → released) gates the actual release.

1. **Dispatch parallel facet reviewers** over `index.md` + `brief.md`, one
   concern each, so no single pass has to hold everything. Each is scored against
   its facet in [`QUALITY.md`](./QUALITY.md):
   - **(a) Sources & facts** — every claim traces to a cited (public) ref; each
     code sample compiles/runs against its pinned ref; no internal/pre-release
     leakage; enough specific, sourced facts.
   - **(b) Voice & humanizer** — the AI tells in §8, while preserving the
     author's stance. This facet is the counterweight to (f).
   - **(c) Audience & tone fit** — matches the brief's audience/tone; assumed
     knowledge honored; no over- or under-explaining.
   - **(d) Structure & argument** — thesis lands early, each section earns its
     place, the CTA is present, headings are descriptive; answer-first intro and a
     key-takeaways box near the top.
   - **(e) Links, metadata & series continuity** — links resolve and are pinned;
     front matter is valid and every tag exists in `tags.yml`; prev/next and
     "where this fits" are correct against `SERIES.md`; named author/bio present.
   - **(f) Citability (human + AI)** — sections lead with the answer to their
     heading; tables/FAQ where they earn their place; an original asset; scannable
     — all **bounded by (b)**: never at the cost of the authored voice.
2. **Each reviewer returns flagged issues + the reason each was flagged** (which
   facet, which QUALITY.md or convention rule it violates) — a list, not prose.
3. **Confidence-scoring pass.** Score each issue 0–100 for whether it's real and
   load-bearing (as in `/code-review`); filter out false positives and nitpicks.
   Where facet (f) fights facet (b), **voice wins ties** — downgrade the (f) issue
   rather than flatten the stance.
4. **Consolidate** the survivors into one prioritized report against `index.md`,
   with a per-facet 0–100 score. The author resolves the findings before setting
   `status: ready`; the DB review state gates the actual release.

## 10. Accuracy & disclosure

- **Verify claims and snippets** against their cited refs before publishing;
  a pinned code sample must actually compile/run at that ref.
- **Never publish internal or pre-release detail.** Internal docs/emails are
  leads, not sources — re-anchor any load-bearing claim on a public source.
- **Disclosure of a Databricks affiliation is the releasing site's job, not the
  draft body's.** The publishing target's **author profile** (bio, the
  `Person`/`sameAs` markup below) already establishes who you are and where you
  work, so `index.md` does **not** carry an inline "I work at Databricks…"
  paragraph — it would be redundant on every site that has an author profile, which
  is all of ours (Delta.io, UC.io, the company blog). Add an inline disclosure only
  for a target that has *no* author identity (a bare Gist, a forum post) and even
  then set it at emit time for that target, never in the canonical source. This is
  lighter than the Wikipedia work's WP:COI / WP:PAID machinery; the obligation is
  met by the byline + profile, not a body paragraph.
- **Name a real author** in the `author` front matter (§3) — never "Admin". The
  visible bio/credentials and the machine-readable `Person`/`sameAs` markup (the
  rest of the E-E-A-T signal) are supplied by the publishing target at release, not
  duplicated per post — see the QUALITY.md publish-target section.
