"""Emit the canonical dataset specs as ``seed/datasets/<name>/dataset.yaml``.

Run with ``python -m docs_factory_seed.export_specs``. The YAML is the shared,
language-neutral description the Rust seeder reads, so both seeders build the
same *logical* dataset. CI regenerates and diffs to catch drift.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

import yaml

from .datasets import DATASETS


def _datasets_root() -> Path:
    # seed/python/src/docs_factory_seed/export_specs.py -> repo/seed/datasets
    return Path(__file__).resolve().parents[3] / "datasets"


def export() -> list[Path]:
    root = _datasets_root()
    written: list[Path] = []
    for spec in DATASETS.values():
        out_dir = root / spec.name
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "dataset.yaml"
        out.write_text(
            yaml.safe_dump(
                dataclasses.asdict(spec), sort_keys=True, default_flow_style=False
            )
        )
        written.append(out)
    return written


if __name__ == "__main__":  # pragma: no cover
    for path in export():
        print(path)
