"""Canonical dataset specifications, single-sourced for every engine.

Each :class:`DatasetSpec` is the authoritative description of a logical dataset:
its schema, its size, the RNG seed that makes it reproducible, and the sequence
of Delta commit *versions* that give it history for time-travel-style examples.

The same specs are mirrored as ``seed/datasets/<name>/dataset.yaml`` (emitted by
``python -m docs_factory_seed.export_specs``) so the Rust seeder can read an
identical description. Keep this module and those YAML files in sync — CI checks
it.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class DatasetSpec:
    """Authoritative description of a seedable dataset.

    Attributes:
        name: Stable identifier used as the ``seed_dataset(name)`` argument.
        description: Human-readable summary for docs and the manifest.
        seed: RNG seed; fixes the generated rows so output is reproducible.
        rows: Number of rows in the initial (version 0) load.
        columns: Ordered ``(name, arrow_type)`` pairs describing the schema.
        versions: Number of Delta commits produced (>= 2 gives time-travel
            history). Version 0 is the initial load; later versions apply the
            deterministic mutations described in :mod:`docs_factory_seed.seeder`.
    """

    name: str
    description: str
    seed: int
    rows: int
    columns: list[tuple[str, str]]
    versions: int = 2
    tags: list[str] = field(default_factory=list)


# v0 = initial load; v1 = mark a deterministic subset returned (delete) + adjust
# amounts (update), so time-travel / CDF / deletion-vector examples have history.
ORDERS = DatasetSpec(
    name="orders",
    description=(
        "Synthetic orders table: a small, license-clean dataset with two Delta "
        "commits (initial load, then a delete + update) so time-travel and "
        "change-data-feed examples have version history."
    ),
    seed=42,
    rows=1000,
    columns=[
        ("order_id", "int64"),
        ("customer_id", "int64"),
        ("product", "string"),
        ("quantity", "int64"),
        ("amount", "double"),
        ("status", "string"),
    ],
    versions=2,
    tags=["time-travel", "change-data-feed"],
)

DATASETS: dict[str, DatasetSpec] = {ORDERS.name: ORDERS}
