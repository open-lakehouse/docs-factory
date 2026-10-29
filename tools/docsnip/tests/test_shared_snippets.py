"""Regions one page shows from another page's script stay identical to their copies.

A marimo notebook has to define every class it uses in a cell, so the marimo
page's notebook carries a copy of the obstore page's credential provider while
the marimo page renders the obstore page's region. The copy must not drift
from what the reader sees.

Some pages share a whole file instead. The borrowing page's snippets folder
holds a symlink to the other page's file, so its script imports it as a
sibling and the sites serve it beside the script, while git keeps one copy
and there is nothing to drift. The test pins that the borrower's file is that
symlink, not a fork, and that the regions the borrowing page fences exist.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
from docsnip import published, shellregions

_HOWTO = Path(__file__).resolve().parents[3] / "content/unitycatalog/how-to"

COPIES = [
    (
        "023-obstore-credentials/snippets/obstore_credentials.py",
        "provider",
        "024-marimo-remote-storage/snippets/notebook.py",
        "nb-provider",
    ),
]


# (shared file, its regions the borrowing page shows, the borrowing page's script)
SHARED = [
    (
        "017-langchain-tools/snippets/pricing.py",
        ["order-total", "shipping-cost"],
        "027-anthropic-tools/snippets/tools.py",
    ),
    (
        "017-langchain-tools/snippets/pricing.py",
        ["order-total", "shipping-cost"],
        "../tutorials/010-agent-tool/snippets/agent_tool.py",
    ),
]


@pytest.mark.parametrize(("source", "regions", "borrower"), SHARED)
def test_shared_file_has_one_copy(source, regions, borrower):
    shared = _HOWTO / source
    borrower_path = _HOWTO / borrower
    beside = borrower_path.parent / shared.name
    assert beside.is_symlink(), f"{beside} must be a symlink to {source}, not a fork"
    assert beside.resolve() == shared.resolve(), beside.resolve()
    assert set(regions) <= set(shellregions.regions(shared)), regions
    assert f"from {shared.stem} import" in borrower_path.read_text(), borrower
    # The sites publish the sibling it imports beside the script.
    assert beside in published.helpers(borrower_path), published.helpers(borrower_path)


@pytest.mark.parametrize(("source", "region", "copy", "copy_region"), COPIES)
def test_copy_matches_source(source, region, copy, copy_region):
    shown = shellregions.regions(_HOWTO / source)[region]
    copied = shellregions.regions(_HOWTO / copy)[copy_region]
    assert textwrap.dedent(copied).strip() == textwrap.dedent(shown).strip()
