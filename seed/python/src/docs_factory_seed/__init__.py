"""Deterministic Delta table seeder for docs-factory examples.

This package solves the "reader-runnable seeded data" problem: examples on the
published docs site that read from a *pre-existing* Delta table (time travel,
change data feed, deletion vectors, ...) need that table to exist before the
snippet runs. Rather than hiding a fixture in CI, the seed step is the visible
first line of the example and calls :func:`seed_dataset`. A reader who
``pip install docs-factory-seed`` and copy-pastes the snippet runs the *exact*
same code path CI runs.

The data is fully deterministic (fixed RNG seed) and idempotent: calling
:func:`seed_dataset` twice returns the same table without rebuilding it.
"""

from __future__ import annotations

from .datasets import DATASETS, DatasetSpec
from .seeder import default_cache_dir, seed_dataset

__all__ = [
    "DATASETS",
    "DatasetSpec",
    "default_cache_dir",
    "seed_dataset",
]

__version__ = "0.1.0"
