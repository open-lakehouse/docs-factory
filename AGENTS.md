# Agent & contributor notes — `docs-factory`

Orientation for anyone (human or agent) working *in this repo*. This file is a
repo convention; it is **not** published to any docs site.

## What this repo is

The **authoritative content source** for the restructured `delta.io` and
`unitycatalog.io` documentation. We author engine-neutral explanations and
multi-engine, copy/paste-runnable, CI-tested examples here, then migrate them into
the sites later. Content targets **Astro + Starlight**: pages are Markdown
(`.md`) or MDX (`.mdx`), and MDX pages may use Starlight components (e.g. `<Tabs>`
for engine-tabbed snippets). The destination sites are expected to provide the
same Starlight component set. It does **not** depend on the separate
`delta-docs-factory` build orchestrator.

## Layout

```
content/        Diátaxis-organized Markdown/MDX (tutorials / how-to / reference / explanation)
examples/       real, tested example source — the single source of truth for snippets
seed/           docs-factory-seed: deterministic Delta-table seeder (Python + Rust)
tools/docsnip/  content tooling (frontmatter validate, snippet check, manifest, llms.txt)
site-artifacts/ GENERATED — llms.txt + examples-manifest.json (do not hand-edit)
research/       existing research reports (leave alone)
proto/          existing trestle tracker API (leave alone)
```

## Load-bearing conventions

1. **Examples are the source of truth for docs code.** Docs never inline code;
   they reference example files via `remark-code-snippets` fences
   (`file=... start=... end=...`). The Astro build resolves them live; nothing is
   copied into the page, so there is nothing to drift. `docsnip snippetcheck`
   enforces that every fence resolves to a unique region. Fences work the same in
   `.md` and `.mdx` — including inside `<Tabs>`/`<TabItem>` (leave a blank line
   around a fence inside a component so MDX parses it as a code block).

2. **Region markers wrap only what the reader should see.** Put seeding, `main`
   wrappers, and asserts *outside* the `docs-...-start` / `docs-...-end` markers —
   except the `seed_dataset(...)` line for examples that read pre-existing data,
   which stays *inside* so the shown snippet is runnable.

3. **Seeded data uses `docs_factory_seed`, the same path readers and CI use.**
   Never hide test fixtures. A snippet that needs a table calls `seed_dataset(...)`;
   that is what a reader who `pip install docs-factory-seed` runs too.

4. **`site-artifacts/` is generated.** Run `uv run docsnip generate` after changing
   content or examples and commit the result. CI (`docsnip check`) fails if it's stale.

5. **Every content page carries frontmatter.** Required: `title`, `diataxis`,
   `project`. Controlled vocabularies (diataxis / project / engines / status) are
   validated by `docsnip validate`.

## Common commands

```bash
uv sync --all-packages                 # install every workspace package
uv run pytest examples/tests           # run + verify the Python examples
uv run docsnip check                   # frontmatter + snippets + artifact freshness
uv run docsnip generate                # regenerate site-artifacts/
uv run ruff check . && uv run ty check # lint + types
cargo build --examples                 # compile the Rust example/seed stubs
```

## Adding an engine to an example

The harness already accepts all five engines (python, polars, duckdb, rust, spark).
To promote a stub to built:
1. Fill in `examples/<engine>/<name>.py` (or `.rs`) between the region markers.
2. Add a test in `examples/tests/`.
3. Add the engine to `BUILT_ENGINES` in `tools/docsnip/src/docsnip/manifest.py`.
4. Reference it from the relevant `content/**/*.md` via a snippet fence + a
   `snippets:` frontmatter entry, then `uv run docsnip generate`.
