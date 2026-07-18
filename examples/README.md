# docs-factory-examples

Real, tested, copy/paste-runnable Delta Lake examples. The docs include the code
between region markers via [`remark-code-snippets`](https://github.com/jknoxville/remark-code-snippets),
so what the site shows is always the code CI runs — no drift.

## Layout

Examples are organized by engine:

| Dir | Engine | Status |
|-----|--------|--------|
| `python/` | `deltalake` (PyPI) | **built + tested** |
| `polars/` | Polars | stub |
| `duckdb/` | DuckDB | stub |
| `spark/`  | PySpark + delta-spark | stub (CI-optional, JVM) |
| `rust/`   | delta-rs | stub (separate cargo crate) |

## Region markers

Each example wraps the shown code in mkdocs-style region markers, e.g.
`# --8<-- [start:read-delta-table]` / `# --8<-- [end:read-delta-table]`
(`//` instead of `#` in Rust/TypeScript). This is the same convention blogs use,
so docs, blogs, and examples share one snippet-resolution path. Seeding, test
wrappers, and asserts live *outside* the markers so they run in CI but don't
appear in the published snippet — except the `seed_dataset(...)` line for
examples that read pre-existing data, which stays inside so the snippet is
runnable as shown.

Pages reference a region with an empty fence, using the bracketed marker token:

    ```python file=../../examples/python/read_delta_table.py start=start:read-delta-table end=end:read-delta-table
    ```

The `start:`/`end:` prefixes are required (not the bare region name): the
resolver matches markers by substring and enforces uniqueness, and the bare
region name would match both marker lines.

## Running

```console
$ uv run python examples/python/time_travel_read.py
$ uv run pytest examples/tests
```
