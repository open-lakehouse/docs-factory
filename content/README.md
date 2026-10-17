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

What makes a page *good* beyond this contract (evidence, reader altitude,
concrete procedures, citability) is the rubric in
[`docs/design/docs-quality.md`](../docs/design/docs-quality.md). Product names,
prohibited terms, and acronyms that `docsnip prose` checks live in
[`terms.yml`](terms.yml).

## Status and release

Frontmatter `status` is the release switch
([ADR-0002](../docs/decisions/ADR-0002-git-ready-is-release.md)):

| `status` | Meaning | Emitted to the docs sites |
|---|---|---|
| `draft` (default) | being written and reviewed | only in `--drafts` previews |
| `ready` | approved in the review app; merging it to main releases it | yes |
| `private` | reviewable reference content (feature lists, compatibility detail) | never |

Review happens while a page is `draft`: reviewers comment and approve in the
factory app, and agents answer threads through the review-feedback MCP. Set
`ready` in a PR once the page is approved (`review-feedback status` lists
approved pages still waiting). CI warns, without failing, when a PR sets `ready`
on a page that has no approval. To take a page down, move it off `ready`.

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
  `title:` (optional `request:`). A planned entry is a backlog slot with no page
  yet. Only reviewers see it, and it is never a placeholder `.md` file.
- **`private` pages are listed too.** They show in the review workspace like any
  page, and the emitter drops them along with drafts.
- **Content requests become planned slots.** Reviewers request missing content
  from a nav section in the review workspace. A maintainer accepts or declines
  it. For an accepted request, an agent (`review-feedback requests`) adds
  `planned: <new backlog id>`, `title:`, and `request: <request id>` under the
  section the request names (its placement is the section trail, `A › B`),
  opens a PR, and marks the request done with `complete-request`. Blog requests
  land in `blogs/IDEAS.md` instead.
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
- A project whose `compatibility.yml` labels its interfaces
  `<Engine> · <Language>` (Delta Lake: `Spark · SQL`, `Spark · Python`,
  `delta-rs · Python`, `DuckDB · SQL`, `DuckDB · Python`) uses those labels as its
  tabs. The site then shows an engine row and that engine's languages, and it
  remembers both choices: pick `Spark · Python` once and every Spark group opens
  on Python, while DuckDB keeps its own choice. A reader who hasn't chosen a
  language for an engine gets the one they last chose anywhere, when the engine
  offers it. `docsnip check` fails on an axis label that isn't an interface
  label, on a group out of the interfaces' order, and on a group that mixes axis
  labels with plain ones (which would render as one flat row).
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
   what the reader achieves, naming Unity Catalog, so the paragraph stands
   alone when an AI search engine quotes it. Don't name the release: see
   [Versions](#versions). Don't open with
   "This page shows how to". The site renders the `summary` right above the
   intro, so don't restate it ("This guide creates, inspects, and deletes…").
   Link the explanation that covers the concepts.
2. **Prerequisites.** A `:::prerequisites` box, one short bullet each:
   - **Tools the reader installs**, linked to their install page and scoped to
     the tab that needs them: `[uv](https://docs.astral.sh/uv/getting-started/installation/)`,
     `[Java 17](https://adoptium.net/temurin/releases/?version=17), for Spark`,
     `[JBang](https://www.jbang.dev/download/), for the Java examples`,
     `[Rust](https://www.rust-lang.org/tools/install), for the Rust examples`.
   - **What the page assumes exists**, in one line: what it is, the name the
     page uses, and the page that creates it ("A schema, such as
     `retail.sales`: [Manage catalogs and schemas](…)").

   Packages and their pins go in the step that opens the session
   (`uv run --with unitycatalog-client==0.7.0 python -m asyncio`), not in the
   box. Show that command without explaining sessions ("Start Python with the
   SDK:"): a how-to reader knows their shell. uv brings its own Python, so don't list a Python version. Pages
   don't ship their own compose file and don't describe starting one: the
   emitter (and the review app) adds a Docker bullet and a bullet naming the
   page's stack, linked to the section that starts it (see
   [Starting the environment](#starting-the-environment)). So don't list
   Docker, the server itself, free ports, `curl`, or downloads a tool makes on
   first run (Spark's Maven jars). Then a `## Set up the client` section with a
   tab group per interface.
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
SQL a reader types into an engine's shell (`spark-sql`, the DuckDB CLI) works
the same way: a region-marked `snippets/*.sql` (markers are `-- --8<-- …`
comments) and a `*_cli.py` driver that opens the engine and runs one region at
a time with `docsnip.sqlregions.run`, or pipes `sqlregions.text(...)` into the
shell itself, with `verifies = "<name>.sql"`.
Every Unity Catalog page runs against a shared, Trestle-generated environment:
[`envs/unitycatalog/compose.yaml`](../envs/unitycatalog/README.md) for the
server on its own, or `envs/uc-aws/compose.yaml` for the server with simulated
S3 and a PostgreSQL metastore. Scripts point
their `[tool.docs-factory] compose` at one of them. Readers get the same files
as `/env/uc-docs-env.tar.gz` from the emitted site, and the variables a host
client needs for a stack come from its `client-env` in
`envs/environments.yml`. The server bind-mounts
`UC_DOCS_ROOT` (default `/tmp/uc-docs`) at the same path in the container, for
pages whose server must see your files. A page that needs a different server
configuration is the exception: give it its own generated environment (or,
failing that, a registered compose file) and say why.

A generated environment (`envs/<name>/env.toml`) commits its
recipe, Trestle pin, build context, runnable render, and `plan.json`
together; regenerate it as a unit with `just env-render <name>`, never by
editing the render. Pages and scripts keep one registered environment key;
client addresses come from the generated host contract (`plan.json`'s
`client.host`, merged into the registry as `client-env`). Reader bundles
contain only files from the explicit manifest of what CI runs (`files` in
`envs/environments.generated.json`).

### Starting the environment

The emitter derives the stack a page needs from its scripts' compose and
[`envs/environments.yml`](../envs/environments.yml), whose title carries the
server version. Every page gets the Docker bullet in its `:::prerequisites`
box. The commands that download and start the stack go where the page's
Diátaxis type wants them:

- **Tutorials** get them as step 1, a `### Start the environment` step at
  the top of the `::::journey`, with a line for readers whose stack already
  runs from an earlier tutorial. Don't write a step or sentence that starts
  it.
- **How-tos** (and reference pages) get one prerequisite bullet,
  "Unity Catalog 0.7.0 with simulated S3 and PostgreSQL, running:", linking the section that
  starts that stack: the entry's `guide` in `environments.yml`, else the
  site's [Run a local Unity Catalog server](unitycatalog/how-to/011-run-local-server/index.md).
- **A page whose task is starting the stack** places the commands itself
  with an empty `:::environment` container (`:::environment` then `:::`).
  The marker takes precedence over both rules above. A page that starts
  several stacks puts a keyed marker in each one's section,
  `:::environment{key="uc-aws/compose.yaml"}`, which renders just
  that stack's download, start, and `export` commands. A page with no scripts
  that still walks through a stack declares it:
  `:::prerequisites{environment="uc-aws/compose.yaml"}`.

The `.md` twin also gives the commands under **Companion files**, so an agent
reading a how-to's twin doesn't have to follow the link.

## Versions

The docs describe the current release only
([design](../docs/design/docs-versioning.md)). The release and its companion
pins live in [`unitycatalog/release.yml`](unitycatalog/release.yml), and readers
see the release in the environment title (a tutorial's first step, or a
how-to's prerequisite). So:

- Don't scope prose to the release ("In 0.6.0 the server…", "as of 0.6.0").
  Write it in the present tense. A number in prose marks a boundary: "requires
  0.4.0 or later", "deprecated since 0.6.0", "fixed in 0.7.0".
- Commands pin exactly: `uv run --with unitycatalog-client==0.6.0`.
- Version-specific facts go in R01's known issues (with **Affects**), R02's
  matrix, version tables, and upstream links pinned to `blob/vX`.
- Absences are release-sensitive ("the server has no groups"). List them in
  R01's *Not in Unity Catalog OSS* or known issues and link there, and skip
  "yet" and "currently". If a page has to state one itself, add it to the
  [release-sensitive pages](../docs/design/docs-versioning.md#release-sensitive-pages).

`docsnip check` fails on a pin that disagrees with the manifest and warns on
release-scoped prose. `just bump-uc <version>` rewrites every pin, and the
[release review](../docs/design/docs-versioning.md#release-review) re-reads
the claims the release can change.

## Tutorials: colocated, self-testing folder mode

A how-to references shared `examples/` code across engines. A *tutorial* is one
narrative with one script, so it colocates its code with its prose: instead of a
standalone `tutorials/foo.md`, use a folder with an `index.md` plus the script(s)
it teaches. There is **no separate test file** — running the script *is* the
test (see below).

A tutorial's step text is what the reader does. Side information (what
`python -m asyncio` is, why a function needs type hints, where a call
actually runs) goes in a `:::note`, or a `:::tip` for advice. Don't add
version or compatibility notes: the pinned install command guarantees that
everything on the page works. As for how-tos, the intro doesn't restate the
`summary`.

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

A script that hangs is killed after 600 s and fails. When a dependency is known
to stall now and then, set `timeout` (seconds) to fail it sooner and `retries`
to re-run it on a fresh stack; say why in a comment beside them. Only a timeout
is retried, and CI annotates every retry so the flake stays visible.

Scala and Java scripts follow the same contract with their own tools' headers.
A Scala script (`*.sc`) is run by `scala-cli run`, a Java one (`*.java`) by
`jbang`; their dependencies are the directives those tools read, and the
`[tool.docs-factory]` keys sit in a `// /// docs-factory` comment block that the
served copy drops (in Java, the dependency line reads
`//DEPS io.delta:delta-spark_2.13:4.4.0`):

```scala
//> using scala 2.13
//> using dep io.delta::delta-spark:4.4.0

// /// docs-factory
// claims.spark-scala = [
//   { journey = "read.scan", region = "read" },
// ]
// ///
```

They always run in the `jvm` lane (`just test-jvm`, which needs Java 17,
scala-cli, and jbang), mark regions with `// --8<-- [start:name]`, and assert
at the end of the file (Scala's `assert`; Java needs an explicit check, since
`assert` is off without `-ea`). A Scala tutorial step is what the reader types
into `spark-shell`, where `spark` already exists, so build the session outside
the regions. Java has no shell: its steps are regions of one JBang script.

Rust scripts (`*.rs`) carry the same `// /// docs-factory` block and `//`
region markers, but declare no dependencies of their own: each is an
`[[example]]` of the snippets crate, `content/_rust/Cargo.toml`, so the crate's
dependencies (`deltalake`, `tokio`) compile once for every script, and
`docsnip check` fails on a script no example builds. They run in the `rust`
lane (`just test-rust`). Rust has no shell either, so a page tells the reader
to `cargo add` those dependencies and put the steps in `src/main.rs`; write the
script's `//!` doc comment for that reader, and keep it clean under
`cargo fmt` and `cargo clippy -- -D warnings`.

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

Three lanes:

- **Default** (`just test`): engine examples + tutorial scripts that need no
  services. Stays green with no Docker and no Java.
- **Service** (`just test-services`, opt-in): scripts that declare a `compose`
  are auto-marked `needs_uc_server`, so they're deselected by default and run
  here. The plugin **fails hard** (never skips) if Docker is unavailable, so an
  opted-in CI run can't quietly pass.
- **Spark** (`just test-spark`, opt-in): scripts with `lane = "spark"` in
  `[tool.docs-factory]` (PySpark, or a driver for the `spark-sql` shell) are
  marked `needs_spark`. They need Java 17 and Maven; behind a proxy, set
  `DOCS_FACTORY_MAVEN_MIRROR` to a Maven mirror URL and the harness points
  Spark at it. `docsnip check` fails a script that depends on `pyspark` or
  `delta-spark` without the lane, unless it runs in the service lane.

In both lanes only scripts on `status: ready` pages gate. A script whose page
(the nearest `index.md` above it) is a draft runs as a non-strict `xfail`, and
CI annotates it when it fails. So "tested here" means a test that blocks
merges, and a page's scripts start gating the moment it's promoted: get them
green before setting `ready`.

`docsnip check` validates every script's PEP 723 block parses and that any
declared `compose` file exists.

### Compatibility claims

A script can also say what it proves about an engine or client, so a
compatibility table can cite it. `content/<project>/compatibility.yml` declares
the project's interfaces (the columns), its journeys, the
tables pages embed (rows of journeys), and evidence for cells no script here
proves. A journey is what a reader sets out to do, such as "append to a managed
table", however many calls the client makes along the way: if a script can do
the journey, the client does what it needs to. Each journey has a `family.task`
key, a `title` (the row label), and a one-sentence `summary` from the reader's
side, which the review app shows under the title:

```yaml
journeys:
  managed.append:
    title: Append to a managed table
    summary: Append rows to a catalog-managed table, with the catalog accepting the commit.
```

The journeys are exhaustive: every task a page shows an engine or client doing
is a journey, and the script that runs it claims the cell. A script claims cells in its
`[tool.docs-factory]` table, one array per interface:

```python
# claims.duckdb = [
#   { journey = "table.list", region = "list" },        # works, as region "list" shows
#   { journey = "managed.create", fails = true, anchor = "create-change-and-drop-tables" },
# ]
# claims.daft = [
#   { journey = "external.append", fails = "io_config was not provided", note = "on local storage" },
# ]
```

- A claim that a journey works names the `region` its page shows; the cell
  links to the heading above that fence. `anchor` overrides the heading, and
  `api` names the call the reader writes (`INSERT INTO`, `mode="append"`).
- `fails` is `true`, or the error text the script asserts (it must appear in
  the script's code). Assert the failure, so CI flags the cell when the engine
  adds support.
- Name the interface the reader picks, never one inferred from the language or
  the dependencies. `<project>:<interface>` claims a cell in another project's
  matrix; its package pin is checked against the claiming project's scripts.
- A claim counts once its page is `ready`. Cells nothing proves come from
  `evidence`: `outcome: fails` or `missing` renders an unlinked ✗, and
  `outcome: works` (the engine's own docs or source say so, with `why` and a
  `source`) renders as `docs` on tables that set `documented: true`.
- A table embedded on a `private` page also shows draft pages' claims, marked
  "(draft)", with each cell's `api` and links to its evidence. Private pages are
  never emitted, so nothing unreviewed reaches readers.

A journey also names the estate-model `asset` it acts on and what its
participants must support, under `requires`, keyed by participant role. A
`client` lists the specs it `consumes`; a provider such as `catalog` or
`storage` lists the specs it `implements` (or the capability or concern it
`realizes`). Lists are conjunctions. A journey's `family` supplies both, and
the matrix's `defaults` cover journeys with no family. A journey can override
either:

```yaml
families:
  iceberg:
    asset: lakehouse.table
    requires:
      client: { consumes: [icebergRestSpec] }
      catalog: { implements: [icebergRestSpec] }
journeys:
  iceberg.read:
    family: iceberg
    title: Read an Iceberg table
    summary: Read an Iceberg table by its catalog name, with credentials the catalog vends.
```

Claims bind an interface and a script; the script's environment supplies the
configured participants. Express replaceable participants through the
contracts they require, and keep implementation and version detail on the
interface `pin`. A reference that doesn't resolve, or names the wrong kind of
element, fails `docsnip check`. An interface that proves a journey but has no
model edge to a spec its client consumes is reported separately from the
outcome; the test evidence stands, and no graph path alone establishes
support.

A page embeds a table between `<!-- compat:<table> -->` and
`<!-- /compat:<table> -->`; `<!-- compat:asset:<model id> -->` embeds every
journey on that asset instead, on the page that `explains:` it, dropping
columns that say nothing there. `uv run docsnip compat --fix` renders it; don't
edit it by hand. `docsnip check` fails when it's stale (for example after a page is
promoted) or when a claim doesn't hold up. The emitter strips the markers.

## Environment diagrams

Show what an environment runs with its Trestle diagram, as a standalone image:

```md
![Clients reach Envoy on port 8080, which routes the Unity Catalog REST API to the server](../../../../envs/unitycatalog/diagram.png "trestle=unitycatalog")
```

`trestle=<name>` names a generated environment; `docsnip envs --fix` writes its
snapshot (`envs/<name>/diagram.trestle-graph.json`) from `plan.json`, and
`just env-render` re-renders the PNG beside it. For a stack no environment
runs, export a snapshot from Trestle's editor into the page's `assets/` and
reference it as `trestle=./assets/<stem>.trestle-graph.json`, with the image
`./assets/<stem>.png`; `just trestle-diagrams` renders it. The PNG is what GitHub
and the `.md` twin show; the preview and the site draw the interactive canvas.
`docsnip check` fails when the image isn't the snapshot's sibling PNG or the
PNG is stale. The alt text is the diagram's only text equivalent: say what
talks to what.

## Linking prose to the architecture model

Pages connect to the [estate model](../architecture/) (LikeC4) three ways. All
are plain, portable Markdown that degrades gracefully off-site and is upgraded
by the preview; every id is validated against the built model by `docsnip
check`. An unknown id is a **hard error**. Missing explanation pages and
ready-page citations of non-`#public` elements are **warnings**.

- **Canonical explanation** — one page may declare `explains: <id>`. That
  page is the element's canonical URL. Duplicate `explains:` values fail
  `docsnip check`. There is no `/explain/<id>` route. Page-worthy kinds
  (capability, concern, openSpecification, implementation) without an
  `explains:` page show up on `/plan/coverage` and in the explanation-coverage
  ratchet.

- **Inline** — reference a model element mid-sentence with a `model:` link:

  ```md
  Delta Lake is an open [table format](model:deltaSpec).
  ```

  On GitHub this is an ordinary link; in the preview it renders the label plus a
  small graph icon that pops open the element's focused view (`ModelRef`). On an
  emitted site it links to the page that `explains:` the element, else to the
  element's external link, else it is plain text. Use it for positional
  mentions, exactly where the concept appears in the prose.

  Only elements tagged `#public` in the model leave the factory: a link to any
  other element is plain text on the site, and it stays out of the page's
  JSON-LD and the site's `concepts.json`. Citing an element from a ready page
  doesn't publish it; tag it in the model (`architecture/README.md`) if readers
  should see it. `docsnip check` reports each such citation.

- **Page-level** — declare the concepts a page is *about* in `references:`:

  ```yaml
  references:
    - deltaSpec
    - parquetSpec
    - lakehouse.tableFormat
  ```

  Those ids feed JSON-LD `about`/`mentions` and the public `concepts.json`
  projection. They do not render a concept header, and they do not drive a
  `/explain` backlink index.

Ids are model element FQNs (e.g. `deltaSpec`, `lakehouse.tableFormat`); list them
with `python3 -c "import json;print(*json.load(open('architecture/dist/model.json'))['elements'])"`.
