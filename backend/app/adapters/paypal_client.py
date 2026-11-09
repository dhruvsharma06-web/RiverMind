"""PayPal access. The real sandbox client (OAuth, Orders, Payouts, webhook verify) lands in S2.2;
until then PAYPAL_MODE=sandbox fails closed with PAYPAL_ERROR instead of pretending."""
from app.adapters.paypal_mock import MockPayPal
from app.config import get_settings
from app.errors import ApiError


def get_paypal():
    if get_settings().PAYPAL_MODE == "mock":
        return MockPayPal()
    raise ApiError("PAYPAL_ERROR", "PayPal sandbox client is not available yet")
