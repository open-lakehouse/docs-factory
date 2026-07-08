# docs-factory-seed

Deterministic Delta-table seeder for docs-factory examples.

Examples on the docs site that read from a **pre-existing** Delta table (time
travel, change data feed, deletion vectors) need that table to exist before the
snippet runs. Instead of hiding a fixture in CI, the seed step is the visible
first line of the example:

```python
from docs_factory_seed import seed_dataset

path = seed_dataset("orders")   # deterministic, idempotent — returns the table path
```

A reader who `pip install docs-factory-seed` and copy-pastes the snippet runs the
exact same code path CI runs. No download, no network — the data is generated
locally from a fixed RNG seed.

## CLI

For engines that can't easily write multi-version Delta tables (e.g. DuckDB),
materialize the dataset first, then read it:

```console
$ docs-factory-seed orders
/home/you/.cache/docs-factory-seed/orders-<fingerprint>
```

## Datasets

Specs are single-sourced in `docs_factory_seed/datasets.py` and mirrored to
`seed/datasets/<name>/dataset.yaml` (via `python -m docs_factory_seed.export_specs`)
so the Rust seeder builds the same logical dataset.
