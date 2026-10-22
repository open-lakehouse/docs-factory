"""Functions to register in Unity Catalog, saved as pricing.py.

functions.py imports this module; it isn't run on its own.
"""


# --8<-- [start:shipping-cost]
def shipping_cost(weight_kg: float, express: bool = False) -> float:
    """Calculate the shipping cost of a parcel.

    Args:
        weight_kg: Parcel weight in kilograms, billed per started kilogram.
        express: Ship with next-day delivery.
    """
    import math

    rate = 9.0 if express else 4.5
    return rate * math.ceil(weight_kg)


# --8<-- [end:shipping-cost]


# --8<-- [start:order-total]
def apply_discount(amount, discount_pct):
    return amount * (1 - discount_pct / 100)


def order_total(quantity: int, unit_price: float, discount_pct: float = 0.0) -> float:
    """Calculate an order's total after a percentage discount.

    Args:
        quantity: Number of units ordered.
        unit_price: Price of one unit.
        discount_pct: Discount in percent, from 0 to 100.
    """
    return round(apply_discount(quantity * unit_price, discount_pct), 2)


# --8<-- [end:order-total]
