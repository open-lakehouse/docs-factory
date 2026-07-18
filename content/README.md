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
