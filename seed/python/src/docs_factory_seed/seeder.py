"""Deterministic Delta-table generation from a :class:`DatasetSpec`."""

from __future__ import annotations

import hashlib
import json
import os
import random
from pathlib import Path

import pyarrow as pa
from deltalake import DeltaTable, write_deltalake

from .datasets import DATASETS, DatasetSpec

_PRODUCTS = ["widget", "gadget", "gizmo", "doohickey", "sprocket"]
_MARKER_FILE = ".docs-factory-seed"


def default_cache_dir() -> Path:
    """Return the base directory seeded tables are written to.

    Honors ``DOCS_FACTORY_SEED_DIR`` if set (used by CI to point at a temp dir);
    otherwise falls back to a per-user cache directory so repeated runs on the
    same machine reuse the same tables.
    """
    override = os.environ.get("DOCS_FACTORY_SEED_DIR")
    if override:
        return Path(override)
    xdg = os.environ.get("XDG_CACHE_HOME")
    base = Path(xdg) if xdg else Path.home() / ".cache"
    return base / "docs-factory-seed"


def _spec_fingerprint(spec: DatasetSpec) -> str:
    """A stable hash of the spec so a changed spec invalidates a cached table."""
    payload = json.dumps(
        {
            "name": spec.name,
            "seed": spec.seed,
            "rows": spec.rows,
            "columns": spec.columns,
            "versions": spec.versions,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _generate_rows(spec: DatasetSpec) -> dict[str, list]:
    """Produce the version-0 columns deterministically from the spec's seed."""
    rng = random.Random(spec.seed)
    order_id = list(range(1, spec.rows + 1))
    customer_id = [rng.randint(1, spec.rows // 10 or 1) for _ in order_id]
    product = [rng.choice(_PRODUCTS) for _ in order_id]
    quantity = [rng.randint(1, 10) for _ in order_id]
    amount = [round(rng.uniform(5.0, 500.0), 2) for _ in order_id]
    status = ["placed"] * spec.rows
    return {
        "order_id": order_id,
        "customer_id": customer_id,
        "product": product,
        "quantity": quantity,
        "amount": amount,
        "status": status,
    }


def _arrow_table(spec: DatasetSpec, cols: dict[str, list]) -> pa.Table:
    fields = [(name, cols[name]) for name, _ in spec.columns]
    return pa.table(dict(fields))


def _build(spec: DatasetSpec, dest: Path) -> None:
    """Write all commits of the dataset to ``dest`` as a Delta table."""
    cols = _generate_rows(spec)

    # Version 0: initial load.
    write_deltalake(str(dest), _arrow_table(spec, cols), mode="overwrite")

    # Version 1: a deterministic delete + update, so time travel sees a diff.
    if spec.versions >= 2:
        dt = DeltaTable(str(dest))
        # Mark every 10th order as returned (an "update"); drop the last 50 rows
        # (a "delete"). Both are deterministic given the fixed seed above.
        updated = dict(cols)
        updated["status"] = [
            "returned" if (oid % 10 == 0) else s
            for oid, s in zip(cols["order_id"], cols["status"], strict=True)
        ]
        keep = spec.rows - 50
        for key in updated:
            updated[key] = updated[key][:keep]
        write_deltalake(str(dest), _arrow_table(spec, updated), mode="overwrite")
        del dt


def seed_dataset(
    name: str = "orders", dest: str | os.PathLike[str] | None = None
) -> str:
    """Materialize the named Delta table and return its path.

    Deterministic and idempotent: if the table already exists at the target path
    and was built from the same spec, it is returned as-is without rebuilding.

    Args:
        name: Dataset identifier (see :data:`docs_factory_seed.DATASETS`).
        dest: Where to write the table. Defaults to a per-dataset directory under
            :func:`default_cache_dir`, keyed by the spec fingerprint so a spec
            change produces a fresh table.

    Returns:
        The filesystem path to the Delta table root, as a string.
    """
    try:
        spec = DATASETS[name]
    except KeyError:
        raise ValueError(
            f"unknown dataset {name!r}; known datasets: {sorted(DATASETS)}"
        ) from None

    fingerprint = _spec_fingerprint(spec)
    if dest is None:
        target = default_cache_dir() / f"{spec.name}-{fingerprint}"
    else:
        target = Path(dest)

    marker = target / _MARKER_FILE
    if marker.is_file() and marker.read_text().strip() == fingerprint:
        return str(target)

    target.mkdir(parents=True, exist_ok=True)
    _build(spec, target)
    marker.write_text(fingerprint)
    return str(target)
