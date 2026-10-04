# Agent & contributor notes — `docs-factory`

Orientation for anyone (human or agent) working *in this repo*. This file is a
repo convention; it is **not** published to any docs site.

## What this repo is

The **authoritative content source** for the restructured `delta.io` and
`unitycatalog.io` documentation, plus narrative blog drafts for the open-lakehouse
estate. We author engine-neutral explanations and multi-engine, copy/paste-runnable,
CI-tested examples here, then migrate docs into the sites later. Content is
**builder-agnostic Markdown** (`.md`): richness comes from remark plugins in the
local preview harness, not from JSX or site-specific syntax in the source files.

Narrative (blogs) stays separate from architectural fact (`architecture/`) and from
reference docs (`content/`). A fourth scope is kept apart too: decisions and design
about **the factory itself** (the site, emitters, review server, authoring pipeline)
live in `docs/`, not in `architecture/` — the latter is *only* fact about the
lakehouse we document. The dividing line is `architecture/adr/ADR-0002`.

## Layout

```
content/          Diátaxis-organized Markdown + colocated, tested snippets/ per page (tutorials / how-to / reference / explanation)
blogs/            narrative blog drafts (index.md + assets/ + snippets/ per post) + STORYLINE
emit/             deterministic renders: blog draft → unitycatalog.io / delta.io MDX; project docs → sites/ (emit/docs)
sites/            static docs-site shells the emitter renders into (sites/unitycatalog-docs); emitted content gitignored
seed/             docs-factory-seed: deterministic Delta-table seeder (Python + Rust)
envs/             reusable compose fragments for test stacks (aws-sim: fake AWS S3/STS for UC)
tools/docsnip/    content validation tooling (frontmatter validate, snippet check)
site/             review + admin app (Vite + React + MDX): renders docs + blogs in the review workspace; site/src/content-core is the shared parsing authority
architecture/     LAKEHOUSE FACT: LikeC4 model + design docs + ADRs + estate facts (estate.yml, glossary)
docs/             FACTORY META: design + decisions about the factory itself (site/emit/server/authoring)
server/           review/release backend (Connect RPC + Postgres) for the in-app review layer
proto/            review/release service proto (docs_factory/review/v1)
research/         existing research reports (leave alone)
```

## Load-bearing conventions

1. **Colocated snippets are the source of truth for docs code.** Docs never
   inline code; they reference a page's colocated `snippets/*.py` via
   `remark-code-snippets` fences (`file=./snippets/... start=... end=...`). The
   preview resolves them live; nothing is copied into the page. `docsnip
   snippetcheck` enforces that every fence resolves. A page with runnable
   snippets is folder-mode (`<slug>/index.md` beside `snippets/`); give each
   script a PEP 723 block so `content/conftest.py` runs it as a test. The shared
   resolver + parsing contract lives in `site/src/content-core/` (see
   `docs/design/build-pipeline.md`).

2. **Blog snippets live in `blogs/<slug>/snippets/`.** Same `file=`/`start=`/`end=`
   fence contract; whole-file inlining (`file=` only) is also supported. Blog
   frontmatter is validated separately (see `blogs/CONVENTIONS.md`).

3. **Region markers wrap only what the reader should see.** Put seeding, `main`
   wrappers, and asserts *outside* the `docs-...-start` / `docs-...-end` markers —
   except the `seed_dataset(...)` line for examples that read pre-existing data.

4. **Reader-facing artifacts belong to the emitted docs sites.** `just emit-docs`
   renders a project into `sites/<site>/` together with its `llms.txt`,
   sitemap, and `.md` twins; none of it is committed. The factory app in `site/`
   is a login-gated review/admin tool and publishes nothing to readers.

5. **Every content page carries frontmatter.** Required: `title`, `diataxis`,
   `project`. Blog drafts require `title`, `slug`, `status`, `tags`, `author`,
   `target` (tags must exist in `blogs/tags.yml`).

   **Status is two orthogonal axes — don't conflate them.** A content page's git
   `status` is *authoring intent* only: `draft` (still being written) or `ready`
   (the author asserts it's publishable). The *review/release lifecycle* is
   DB-canonical (`review_state`: none → in-review → changes-requested → approved
   → released), owned by the review server, never written back to git. A page is
   **published** only when it is **`ready` AND its DB `review_state` is
   `released`**: publication is the intersection of author intent (git) and
   review outcome (DB), and neither alone exposes content. In the factory app,
   allowlisted reviewers see everything, so review can start while a page is
   still `draft`; an invited contributor sees only what was shared with them.
   The emitted sites build DB-free and gate on git `ready`, which keeps authoring
   decoupled from the deploy DB. An
   explanation page also declares `explains: <c4-element-id>` (its canonical
   model concept); see `content/README.md`.

6. **Richness is a property of the renderer.** Blog constructs (`:::tip`, `::::journey`,
   LikeC4 diagrams) degrade to plain Markdown on GitHub; the preview upgrades them.
   See `blogs/CONVENTIONS.md` §5 and `site/README.md`.

7. **A comment earns its place by stating the non-obvious.** Write the *why* — an
   invariant, a subtle ordering/async/security constraint, a "why this and not the
   obvious alternative", or a format hint (`// uuid`). Do **not** restate what the
   code says, echo the function/component name in a docstring, or narrate what the
   code doesn't do unless the not-doing is genuinely surprising. Use-case and
   motivation prose belongs in the PR description, not inline. Example — after
   always-rendering a copy button on collapsed code blocks, keep only the
   code-relevant fact:

   ```tsx
   // ✗  a collapsed block often holds a file the reader is meant to copy into
   //    their own project, so hiding the button behind expand-first is friction…
   // ✓  `code` holds the full contents regardless of expand state.
   <CodeCopyButton code={code} />
   ```

## On each import, reflect on the conventions

When new ideas, drafts, or source material land here, reflect on whether the
experience surfaced a gap in the relevant conventions doc — and **propose a concrete
update** rather than silently working around it. When adding a blog tag, prefer an
existing entry from `blogs/tags.yml`; only add a new tag in the same change.

## Common commands

```bash
uv sync --all-packages                 # install every workspace package
just preview                           # review app at :4321; offline mode without the API
just dev                               # full local stack: Postgres + review API (mock auth) + preview
just emit <slug> <target>              # emit a blog draft (target: unitycatalog | delta)
just emit-docs <site> [--drafts]       # emit a project's docs into sites/<site>/ (writes only changes)
just uc-docs                           # emit UC docs (with drafts), build + preview the static site at :4322
uv run pytest                          # docsnip tests + colocated tutorial scripts
cd site && bun test src/content-core   # content-core parsing-contract drift tests
uv run docsnip check                   # frontmatter + snippets
uv run ruff check . && uv run ty check # lint + types
cargo build                            # compile the Rust seed helper
just arch-dev                          # LikeC4 architecture model at :5173
```

## Adding a tested snippet to a page

1. Make the page folder-mode: `content/<project>/<bucket>/<slug>/index.md` beside
   a `snippets/` dir.
2. Put the runnable code in `snippets/<name>.py` with a PEP 723 `# /// script`
   block (its deps, and `[tool.uv.sources]` for the local `docs-factory-seed`),
   region markers wrapping only what the reader should see, and inline `assert`s
   in `__main__` so running it to completion is its test.
3. Reference it from `index.md` with a fence
   (`file=./snippets/<name>.py start=... end=...`), then `uv run docsnip check`.
   `content/conftest.py` runs the script in the default test lane.
4. For S3 storage, `include:` [`envs/aws-sim`](envs/aws-sim/README.md) in the
   page's compose and keep endpoints out of the snippet: set them in
   `[tool.docs-factory] env = { AWS_ENDPOINT_URL = "http://localhost:9000", AWS_ALLOW_HTTP = "true" }`.

## Blog workflow

Read [`blogs/CONVENTIONS.md`](blogs/CONVENTIONS.md) before working on posts.
Skills in `.claude/skills/{blog-post,blog-review,blog-emit}` automate the lifecycle.
Estate facts for cross-repo posts live in [`architecture/estate.yml`](architecture/estate.yml);
narrative framing in [`blogs/STORYLINE.md`](blogs/STORYLINE.md).
