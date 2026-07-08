"""CLI entry point: ``docs-factory-seed <name> [--dest DIR]``.

Lets an engine that cannot easily write multi-version Delta tables (e.g. DuckDB)
materialize the dataset up front, then read it. Prints the table path on stdout.
"""

from __future__ import annotations

import argparse
import sys

from .datasets import DATASETS
from .seeder import seed_dataset


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="docs-factory-seed")
    parser.add_argument(
        "name",
        nargs="?",
        default="orders",
        choices=sorted(DATASETS),
        help="dataset to materialize (default: orders)",
    )
    parser.add_argument(
        "--dest",
        default=None,
        help="output directory (default: per-user cache dir)",
    )
    args = parser.parse_args(argv)
    path = seed_dataset(args.name, dest=args.dest)
    print(path)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
