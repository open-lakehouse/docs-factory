"""Functions to register in Unity Catalog, saved as pricing.py.

The page's scripts register these through seed.py; this module isn't run on
its own.
"""


# --8<-- [start:order-total]
def order_total(quantity: int, unit_price: float, discount_pct: float = 0.0) -> float:
    """Calculate an order's total after a percentage discount.

    Args:
        quantity: Number of units ordered.
        unit_price: Price of one unit.
        discount_pct: Discount in percent, from 0 to 100.
    """
    return round(quantity * unit_price * (1 - discount_pct / 100), 2)


# --8<-- [end:order-total]


# --8<-- [start:checked-total]
def checked_total(quantity: int, unit_price: float) -> float:
    """Calculate an order's total, rejecting empty orders.

    Args:
        quantity: Number of units ordered, at least 1.
        unit_price: Price of one unit.
    """
    if quantity < 1:
        raise ValueError("quantity must be at least 1")
    return round(quantity * unit_price, 2)


# --8<-- [end:checked-total]


# --8<-- [start:slow-quote]
def slow_quote(seconds: float) -> float:
    """Wait, as a call to a slow pricing service would, then return a quote.

    Args:
        seconds: How long to wait.
    """
    import time

    time.sleep(seconds)
    return round(seconds * 10, 2)


# --8<-- [end:slow-quote]


# --8<-- [start:busy-total]
def busy_total(iterations: int) -> int:
    """Run a CPU-bound loop, as a heavy pricing model would.

    Args:
        iterations: How many loop iterations to run.
    """
    total = 1
    for i in range(iterations):
        total = (total * 31 + i) % 1_000_003
    return total


# --8<-- [end:busy-total]


# --8<-- [start:mean-price]
def mean_price(first: float, second: float, third: float) -> float:
    """Average three prices.

    Args:
        first: A price.
        second: A price.
        third: A price.
    """
    import statistics

    return statistics.fmean([first, second, third])


# --8<-- [end:mean-price]


# --8<-- [start:payload-size]
def payload_size(quantity: int) -> int:
    """Serialize a value with cloudpickle and return its size in bytes.

    Args:
        quantity: The value to serialize.
    """
    import cloudpickle

    return len(cloudpickle.dumps(quantity))


# --8<-- [end:payload-size]


def python_version() -> str:
    """Return the Python version the function runs on."""
    import sys

    return sys.version.split()[0]


def read_rates(path: str) -> str:
    """Read a rates file.

    Args:
        path: The file to read.
    """
    with open(path) as f:
        return f.read()


def process_id(tag: str) -> int:
    """Return the process ID the function runs in.

    Args:
        tag: Ignored; it keeps calls apart in the client's cache.
    """
    import os

    return os.getpid()


def thread_id(tag: str) -> int:
    """Return the thread ID the function runs in.

    Args:
        tag: Ignored; it keeps calls apart in the client's cache.
    """
    import threading

    return threading.get_ident()


def allocate(megabytes: int) -> int:
    """Allocate a buffer and return its size.

    Args:
        megabytes: The buffer's size in MB.
    """
    return len(bytearray(megabytes * 1024 * 1024))


async def quote_async(seconds: float) -> float:
    """Wait asynchronously, then return a quote.

    modes.py registers this one itself: create_python_function stores an
    async function without its body.

    Args:
        seconds: How long to wait.
    """
    import asyncio

    await asyncio.sleep(seconds)
    return round(seconds * 10, 2)


def count_items(items: list[str]) -> int:
    """Count a list's items.

    Args:
        items: The items.
    """
    return len(items)
