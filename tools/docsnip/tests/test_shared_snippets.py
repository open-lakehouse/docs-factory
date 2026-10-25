"""Regions one page shows from another page's script stay identical to their copies.

A marimo notebook has to define every class it uses in a cell, so the marimo
page's notebook carries a copy of the obstore page's credential provider while
the marimo page renders the obstore page's region. The copy must not drift
from what the reader sees.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
from docsnip import shellregions

_HOWTO = Path(__file__).resolve().parents[3] / "content/unitycatalog/how-to"

COPIES = [
    (
        "023-obstore-credentials/snippets/obstore_credentials.py",
        "provider",
        "024-marimo-remote-storage/snippets/notebook.py",
        "nb-provider",
    ),
]


@pytest.mark.parametrize(("source", "region", "copy", "copy_region"), COPIES)
def test_copy_matches_source(source, region, copy, copy_region):
    shown = shellregions.regions(_HOWTO / source)[region]
    copied = shellregions.regions(_HOWTO / copy)[copy_region]
    assert textwrap.dedent(copied).strip() == textwrap.dedent(shown).strip()
