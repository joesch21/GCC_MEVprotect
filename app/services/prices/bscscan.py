from decimal import Decimal


class BscScanPriceService:
    @staticmethod
    def get_bnb_price() -> Decimal:
        """Fetch current BNB price in USD.
        Placeholder to be monkeypatched in tests."""
        raise RuntimeError("BscScan service not configured")
