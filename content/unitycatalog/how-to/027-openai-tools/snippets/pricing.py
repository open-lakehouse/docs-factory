"""The functions the model may call. Their docstrings become what the model reads."""


# --8<-- [start:order-total]
def order_total(quantity: int, unit_price: float, discount_pct: float = 0.0) -> float:
    """
    Calculate the total price of an order line after a percentage discount.

    Args:
        quantity: Number of units ordered.
        unit_price: Price of one unit.
        discount_pct: Discount in percent, from 0 to 100.

    Returns:
        The discounted total, rounded to two decimals.
    """
    return round(quantity * unit_price * (1 - discount_pct / 100), 2)


# --8<-- [end:order-total]


# --8<-- [start:shipping-cost]
def shipping_cost(weight_kg: float, express: bool) -> float:
    """
    Calculate the shipping cost of a parcel.

    Args:
        weight_kg: Weight of the parcel in kilograms, greater than zero.
        express: Whether to ship with next-day delivery.

    Returns:
        The shipping cost, rounded to two decimals.
    """
    if weight_kg <= 0:
        raise ValueError("weight_kg must be greater than zero")
    rate = 4.5 if express else 2.0
    return round(5.0 + rate * weight_kg, 2)


# --8<-- [end:shipping-cost]


# --8<-- [start:gift-wrap]
def gift_wrap_fee(items: int) -> float:
    """
    Calculate the gift-wrapping fee for an order.

    Args:
        items: Number of items to wrap.

    Returns:
        The fee, rounded to two decimals.
    """
    return round(1.5 * items, 2)


# --8<-- [end:gift-wrap]
