# content/

Authoritative documentation content, organized by the [Diátaxis](https://diataxis.fr/)
framework. This is portable Markdown with YAML frontmatter — no HTML, no
static-site-generator coupling — so it can be migrated into the delta.io and
unitycatalog.io sites.

```
content/<project>/
  tutorials/     learning-oriented, one happy path, single default engine
  how-to/        task-oriented, multi-engine (engine-tabbed snippets)
  reference/     information-oriented, language-agnostic
  explanation/   understanding-oriented, language-agnostic (incl. kernel architecture)
```

## Navigation order (filename prefix + `slug:`)

There is no `_meta.yaml`. Nav order comes entirely from the tree:

- **Section order** — the four folders above map 1:1 to the Diátaxis buckets and
  render in a fixed order (Explanation → Tutorials → How-to → Reference). Their
  headings are constants in `site/src/doc-nav.ts`, not content.
- **Order within a section** — the filename's numeric prefix. Name docs
  `001-first-server.md`, `002-python-client/`, `003-postgres-server.md`; the
  sidebar sorts by that prefix. Zero-pad to three digits so the lexicographic
  sort holds well past nine docs.
- **Clean URLs (prefix auto-stripped)** — the `NNN-` prefix is stripped from the
  slug automatically (like Docusaurus/Nextra), so `003-postgres-server.md` serves
  at `/docs/unitycatalog/tutorials/postgres-server` with **no `slug:` needed**.
  Renumbering a doc reorders it without changing its URL. Folder-mode tutorials
  prefix the *folder* (`002-python-client/index.md` → `.../python-client`).
  Set a `slug:` in frontmatter only to make the URL differ from the (stripped)
  filename — e.g. to keep an old URL after a rename.

To reorder, renumber the prefixes in that folder; to insert, pick an unused
number (or renumber neighbors). Nothing else needs editing.

## Curated navigation (`<project>/nav.yml`)

A project may add a `nav.yml`, its equivalent of an MkDocs `nav:`. When that
project's scope is active (`~/unitycatalog`), the sidebar, the `/docs` landing,
breadcrumbs, and prev/next follow the manifest. The unscoped view keeps the
Diátaxis grouping above as the full content index.

- **Canonical content versus navigation.** Each page has exactly one Diátaxis
  home (its folder and URL). `nav.yml` links to it by `page: <bucket>/<slug>`,
  using the URL tail with the prefix stripped, and may link it from several
  sections. Changing the nav never moves prose or changes URLs. A page's first
  occurrence is its primary placement, which breadcrumbs and prev/next follow.
- **Entries** are `section:` + `items:` (at most 3 levels deep),
  `page:` (optional `id:` backlog id and `label:` override), or `planned:` +
  `title:`. A planned entry is a backlog slot with no page yet. Only reviewers
  see it, and it is never a placeholder `.md` file.
- **Every page must be listed.** `site/scripts/check-nav.mjs` (run at prebuild,
  in `just check`, and in CI) fails on unknown pages, orphans, duplicate ids,
  empty sections, and over-deep nesting.

Adding a page to a project with a `nav.yml` therefore means also adding it to
the manifest.

Code in how-to guides is **not** inlined — it is referenced from tested example
files in `examples/` via [`remark-code-snippets`](https://github.com/jknoxville/remark-code-snippets)
fences, so what the site shows is always what CI runs. See the repo `AGENTS.md`.

## Interface tabs (`:::tab`)

When one task can be done through several interfaces (Python SDK, CLI, REST),
show each in a tab instead of repeating the section. Adjacent `:::tab[Label]`
containers form one tab group; any other node between two tabs starts a new
group. There is no wrapper directive.

````markdown
:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:create-catalog end=end:create-catalog
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:create-catalog end=end:create-catalog
```
:::
````

- Groups sync by label. Choosing "CLI" switches every group on the page that has
  a "CLI" tab, and the site remembers the choice. Use the same labels, in the
  same order, throughout a page.
- A callout inside a tab needs one more colon on the tab: `::::tab[CLI]` around
  `:::note`.
- Inside a `::::journey`, don't put `###` headings in a tab; the journey splits
  steps on them.
- The `.md` twins keep every panel, each led by its bold label. Tabs are
  docs-only for now; the blog emit targets don't render them.

## How-to page anatomy

The Unity Catalog how-to guides follow the shape of the managed Databricks
documentation, rewritten for what the open source server actually does.
[`unitycatalog/how-to/004-manage-catalogs-and-schemas/`](unitycatalog/how-to/004-manage-catalogs-and-schemas/index.md)
is the reference example.

1. **Intro.** One or two sentences that state the answer: what the object is or
   what the reader achieves, naming Unity Catalog and the version, so the
   paragraph stands alone when an AI search engine quotes it. Don't open with
   "This page shows how to". Link the explanation that covers the concepts.
2. **Prerequisites.** A `:::prerequisites` box with the server version and
   client versions. Pages don't ship their own compose file and don't describe
   starting one: the emitter appends a Docker bullet and the commands that
   download and start the page's stack (from its scripts' compose and
   [`envs/environments.yml`](../envs/environments.yml)). A page without scripts
   that still walks through a stack declares it:
   `:::prerequisites{environment="unitycatalog/compose.aws.yaml"}`. Then a
   `## Set up the client` section with a tab group per interface.
3. **One `##` section per task**, named with an imperative ("Create a catalog",
   "Delete a volume"). Each has a sentence of context, a tab group with one
   snippet per interface, and any constraints the server enforces.
4. **Required privileges** at the end of each task, taken from the release's
   authorization source.
5. **Callouts for consequences:** `:::warning` for surprising replacement or data
   loss, `:::danger` for irreversible cascades. Lead with what works: a verified
   quirk or upstream bug goes in the "Known issues" table of
   `unitycatalog/reference/001-features-and-limitations`, with its error string,
   and the page links there. Keep the assert that pins it, so CI flags the
   entry when it's fixed.
6. **Next steps:** two or three links to the next task or concept.

Keep Databricks-only concepts (workspaces, Catalog Explorer, SQL warehouses,
`/Volumes` paths) out of the task text. Mention them only to mark a boundary.

**Every displayed command is tested.** Python snippets are PEP 723 scripts as
described below. A CLI tab's commands live in a region-marked `snippets/*.sh`
whose `setup` region defines the shell alias. A PEP 723 driver beside it
(`snippets/*_cli.py`, same `[tool.docs-factory]` compose) runs one region at a
time with `docsnip.shellregions.run` and asserts on server state in between.
The driver names its script with `verifies = "<name>.sh"` in that table, so the
site publishes the `.sh` readers see as the runnable example, not the driver.
`docsnip check` fails a `docsnip.shellregions` driver that leaves it out.
Every Unity Catalog page runs against the shared environment in
[`envs/unitycatalog/`](../envs/unitycatalog/README.md): `compose.yaml` for the
server, `compose.aws.yaml` for the server plus aws-sim, `compose.postgres.yaml`
for a PostgreSQL metastore. Scripts point their `[tool.docs-factory] compose`
at one of them. Readers get the same files as `/env/uc-docs-env.tar.gz` from
the emitted site, and the variables a host client needs for a stack
(`AWS_ENDPOINT_URL` for aws-sim) come from its `client-env` in
`envs/environments.yml`. The server bind-mounts
`UC_DOCS_ROOT` (default `/tmp/uc-docs`) at the same path in the container, for
pages whose server must see your files. A page that needs a different server
configuration is the exception: give it its own compose file and say why.

## Tutorials: colocated, self-testing folder mode

A how-to references shared `examples/` code across engines. A *tutorial* is one
narrative with one script, so it colocates its code with its prose: instead of a
standalone `tutorials/foo.md`, use a folder with an `index.md` plus the script(s)
it teaches. There is **no separate test file** — running the script *is* the
test (see below).

```
content/unitycatalog/tutorials/002-python-client/
  index.md                    inlines regions via  file=./snippets/catalog_flow.py
  snippets/catalog_flow.py    runnable, self-describing, self-testing script (PEP 723)
```

The `file=` fences use the same `# --8<-- [start:region]/[end:region]` markers as
`examples/` code and resolve relative to `index.md`, so nothing special is needed
to render them.

### Self-describing scripts (PEP 723 + `[tool.docs-factory]`)

Each tutorial script is **standalone-runnable** and declares everything about how
to run and test it inline, in a [PEP 723](https://peps.python.org/pep-0723/)
`# /// script` header:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client>=0.5"]   # resolved by `uv run`
#
# [tool.docs-factory]                            # our runtime contract:
# compose = "../../../../envs/unitycatalog/compose.yaml"  # compose to start (rel. to script)
# services = ["unitycatalog"]                    #   service(s) to wait on
# base-url-env = "UC_BASE_URL"                   #   env the harness sets to the server URL
# ///
```

A reader can also run it whole with `uv run <its URL on the site>`: deps come
from the header, no project sync. The site serves the script as written,
comments included, so its docstring speaks to that reader. The PEP 723 `dependencies` and the `[tool.docs-factory]` table
(parsed by `docsnip.scriptmeta`) are the **single source of truth** for the
script's Python deps and its *runtime* prerequisites — do **not** duplicate them
in the page's frontmatter (`prerequisites.packages` / `.services` are not read by
anything; only `prerequisites.datasets` is, for seed-dataset examples). The test
harness reads `[tool.docs-factory]` to know which compose to start; omit the
whole table if the script needs no services.

Structure a script as a flat, top-to-bottom program with the flow in one
`main()` function (`async def` for async SDKs) plus an
`if __name__ == "__main__":` footer. Each region holds exactly what a reader
enters in the interactive session the page opens (`python -m asyncio` accepts
top-level `await`): open the client with `api = ApiClient(config)` inside a
region rather than `async with`, and close it in a `finally` outside the
regions. Steps describe the task; the page never asks the reader to create or
run the script, which stays the hidden test.

### The script is the test

There are no `test_*.py` files. A pytest plugin in `content/conftest.py`
discovers every `# /// script` script under `content/` and turns each into a
test: it starts the compose the script's `[tool.docs-factory]` names (if any),
runs the script with `uv run` (which resolves the script's own PEP 723 deps),
and passes if it exits 0. Put assertions in the script — the `if __name__ ==
"__main__":` footer is outside the rendered regions, so `assert`s there run on
every `uv run` (turning a silent regression into a non-zero exit) without
appearing in the docs.

Two lanes:

- **Default** (`just test`): engine examples + tutorial scripts that need no
  services. Stays green with no Docker.
- **Service** (`just test-services`, opt-in): scripts that declare a `compose`
  are auto-marked `needs_uc_server`, so they're deselected by default and run
  here. The plugin **fails hard** (never skips) if Docker is unavailable, so an
  opted-in CI run can't quietly pass.

`docsnip check` validates every script's PEP 723 block parses and that any
declared `compose` file exists.

## Linking prose to the architecture model

Pages connect to the [estate model](../architecture/) (LikeC4) two ways. Both are
plain, portable Markdown that degrades gracefully off-site and is upgraded by the
preview; every id is validated against the built model by `docsnip validate`.

- **Inline** — reference a model element mid-sentence with a `model:` link:

  ```md
  Delta Lake is an open [table format](model:deltaSpec).
  ```

  On GitHub this is an ordinary link; in the preview it renders the label plus a
  small graph icon that pops open the element's focused view. Use it for
  positional mentions, exactly where the concept appears in the prose.

- **Page-level** — declare the concepts a page is *about* in frontmatter:

  ```yaml
  references:
    - deltaSpec
    - parquetSpec
    - lakehouse.tableFormat
  ```

  This renders a concept header at the top of the page and drives the reverse
  "Referenced by" index on each `/explain/<id>` page — the link is bidirectional.

Ids are model element FQNs (e.g. `deltaSpec`, `lakehouse.tableFormat`); list them
with `python3 -c "import json;print(*json.load(open('architecture/dist/model.json'))['elements'])"`.
