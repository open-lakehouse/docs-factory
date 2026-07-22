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
  _meta.yaml     nav ordering hints for the downstream site
```

Code in how-to guides is **not** inlined — it is referenced from tested example
files in `examples/` via [`remark-code-snippets`](https://github.com/jknoxville/remark-code-snippets)
fences, so what the site shows is always what CI runs. See the repo `AGENTS.md`.

## Tutorials: colocated, self-testing folder mode

A how-to references shared `examples/` code across engines. A *tutorial* is one
narrative with one script, so it colocates its code with its prose: instead of a
standalone `tutorials/foo.md`, use a folder with an `index.md` plus the script(s)
it teaches and a colocated test.

```
content/unitycatalog/tutorials/python-client/
  index.md              inlines its script via  file=./catalog_flow.py
  catalog_flow.py       runnable, self-describing script (PEP 723 header)
  test_catalog_flow.py  colocated pytest, driven by the script's metadata
  docker-compose.uc.yml the service the script declares it needs
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
# compose = "docker-compose.uc.yml"              #   compose file to start (rel. to script)
# services = ["unitycatalog"]                    #   service(s) to wait on
# base-url-env = "UC_BASE_URL"                   #   env the harness sets to the server URL
# ///
```

A reader runs it with `uv run catalog_flow.py` — deps come from the header, no
project sync. The PEP 723 `dependencies` and the `[tool.docs-factory]` table
(parsed by `docsnip.scriptmeta`) are the **single source of truth** for the
script's Python deps and its *runtime* prerequisites — do **not** duplicate them
in the page's frontmatter (`prerequisites.packages` / `.services` are not read by
anything; only `prerequisites.datasets` is, for seed-dataset examples). The test
harness reads `[tool.docs-factory]` to know which compose to start; omit the
whole table if the script needs no services.

Structure a script as a flat, top-to-bottom program with the flow in one
`main(base_url)` function (`async def` for async SDKs) plus an
`if __name__ == "__main__":` footer — so the same code reads linearly on the
page, runs via `uv run`, and is importable by the test.

### Testing tiers

- **Default lane** (`just test`): engine examples + tutorial tests that need no
  services. Stays green with no Docker.
- **Service lane** (`just test-services`, opt-in): tests marked `needs_uc_server`
  / `needs_docker`. The `uc_server` fixture reads the colocated script's
  `[tool.docs-factory]`, starts that compose with testcontainers, waits for
  health, and yields the base URL. **Fails hard** (never skips) if Docker is
  unavailable, so an opted-in CI run can't quietly pass. Shared fixtures live in
  `content/conftest.py`.

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
