"""Run the region-marked SQL snippets a docs page displays.

A page that shows SQL for an engine's shell (``spark-sql``, the DuckDB CLI)
keeps it in a region-marked ``*.sql`` file and pairs it with a PEP 723 driver.
The driver opens the engine in-process and calls :func:`run` once per region,
in page order, asserting on the results in between, so the statements that run
are exactly the ones a reader types. :func:`text` joins regions for a driver
that pipes them into the real shell instead.

Markers are SQL comments: ``-- --8<-- [start:name]`` … ``-- --8<-- [end:name]``.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

T = TypeVar("T")

_REGION_RE = re.compile(
    r"^[ \t]*--[ \t]*--8<-- \[start:([\w-]+)\][^\n]*\n(.*?)"
    r"^[ \t]*--[ \t]*--8<-- \[end:\1\]",
    re.S | re.M,
)


def regions(script: Path) -> dict[str, str]:
    """Map region name → body for every ``--8<--`` region in ``script``."""
    return dict(_REGION_RE.findall(script.read_text()))


def text(script: Path, *names: str) -> str:
    """The named regions' bodies, in the order given, as one SQL script."""
    blocks = regions(script)
    return "".join(blocks[name] for name in names)


def statements(sql: str) -> list[str]:
    """Split ``sql`` on ``;`` into statements, without comments.

    Quotes (``'…'``, ``"…"``) and backticks hide ``;`` and ``--``; a quote
    doubled or escaped with a backslash (Spark's ``\\'``) stays inside its
    string. Statements that are only comments are dropped.
    """
    out: list[str] = []
    buf: list[str] = []
    quote: str | None = None
    i = 0
    while i < len(sql):
        ch = sql[i]
        if quote:
            buf.append(ch)
            if ch == "\\" and quote != "`" and i + 1 < len(sql):
                buf.append(sql[i + 1])
                i += 2
                continue
            if ch == quote:
                if sql[i + 1 : i + 2] == quote:
                    buf.append(quote)
                    i += 2
                    continue
                quote = None
        elif ch in "'\"`":
            quote = ch
            buf.append(ch)
        elif sql.startswith("--", i):
            end = sql.find("\n", i)
            i = len(sql) if end == -1 else end
            continue
        elif sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            i = len(sql) if end == -1 else end + 2
            continue
        elif ch == ";":
            out.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
        i += 1
    out.append("".join(buf))
    return [s.strip() for s in out if s.strip()]


def run(script: Path, name: str, execute: Callable[[str], T]) -> list[T]:
    """Run each statement of region ``name`` through ``execute``; return the results.

    ``execute`` must force the statement: ``spark.sql`` and DuckDB's
    ``con.sql`` are lazy, so pass ``lambda s: spark.sql(s).collect()`` or
    ``lambda s: con.execute(s).fetchall()``.
    """
    return [execute(stmt) for stmt in statements(regions(script)[name])]
