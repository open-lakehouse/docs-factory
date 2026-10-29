"""The function the post registers once and runs from an app, Spark, and an agent."""


def order_total(quantity: int, unit_price: float, discount_pct: float = 0.0) -> float:
    """
    Calculate the total price of an order line after a percentage discount.

    Args:
        quantity: Number of units ordered.
        unit_price: Price of one unit.
        discount_pct: Discount in percent, from 0 to 100.
    """
    return round(quantity * unit_price * (1 - discount_pct / 100), 2)
