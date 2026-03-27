# examples — conventions

This directory contains runnable Python code that backs blog posts, how-to guides,
and reference documentation published from docs-factory.

---

## Directory layout

```
examples/
  <journey-slug>/          # one directory per content journey
    __init__.py
    <engine>.py            # one module per execution engine
    conftest.py            # pytest fixtures shared across engines (optional)
  __init__.py
  README.md                # this file
```

### Journey slug

A *journey slug* is the URL-friendly identifier for a specific content piece, matching
the slug used in the publishing pipeline (e.g. `delta-lake-quickstart`,
`iceberg-merge-into`). Use lowercase kebab-case.

### Engine module

Each engine module (`spark.py`, `daft.py`, `duckdb.py`, `polars.py`, …) contains:

1. **A single `run()` function** — the canonical, self-contained example.
   `run()` must be callable with no required arguments (use sensible defaults or
   fixtures injected by `conftest.py`).
2. **Optional `pytest` tests** — prefix test functions with `test_` as usual.
   Place shared fixtures in a `conftest.py` alongside the engine modules.

Example structure for a journey:

```
examples/delta-lake-quickstart/
  __init__.py
  spark.py       # def run(): ...  (PySpark implementation)
  daft.py        # def run(): ...  (Daft implementation)
  conftest.py    # shared fixtures (tmp_path overrides, sample data, etc.)
```

---

## Running examples locally

```bash
# Install dependencies (creates .venv automatically)
uv sync

# Type-check
make lint          # runs: ty check examples/

# Run all tests
make test          # runs: uv run pytest examples/

# Run a single engine example interactively
make run EXAMPLE=delta-lake-quickstart ENGINE=spark
# equivalent to: uv run python -c "from examples.delta_lake_quickstart import spark; spark.run()"
```

---

## Adding a new journey

1. Create `examples/<journey-slug>/` (use underscores in the Python package name,
   kebab-case for the directory — uv handles the mapping).
2. Add `__init__.py` in the new directory.
3. Add one `<engine>.py` module per engine you are documenting.
4. Implement `run()` in each module.
5. Run `make lint` and `make test` to verify before committing.

---

## CI

Every push or PR that touches `examples/` triggers
`.github/workflows/examples-ci.yml`, which runs `ty check` and `pytest` in a
clean environment.
