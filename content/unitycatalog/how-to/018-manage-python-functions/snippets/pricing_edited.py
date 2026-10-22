"""pricing.py after the edit the page's replace step makes.

functions.py copies this over pricing.py before it reloads the module; the
page shows the changed function under the title pricing.py.
"""


# --8<-- [start:shipping-cost]
def shipping_cost(weight_kg: float, express: bool = False) -> float:
    """Calculate the shipping cost of a parcel, including a handling fee.

    Args:
        weight_kg: Parcel weight in kilograms, billed per started kilogram.
        express: Ship with next-day delivery.
    """
    import math

    rate = 9.0 if express else 4.5
    return 2.0 + rate * math.ceil(weight_kg)
# --8<-- [end:shipping-cost]


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
