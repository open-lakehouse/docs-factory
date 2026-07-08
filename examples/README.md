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

Each example wraps the shown code in comment markers, e.g.
`# docs-read-delta-table-start` / `# docs-read-delta-table-end`. Seeding, test
wrappers, and asserts live *outside* the markers so they run in CI but don't
appear in the published snippet — except the `seed_dataset(...)` line for
examples that read pre-existing data, which stays inside so the snippet is
runnable as shown.

## Running

```console
$ uv run python examples/python/time_travel_read.py
$ uv run pytest examples/tests
```
