from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from app.db.models import ImportBatch
from app.services.ingest import dexscreener_csv
from app.services.prices.service import PriceNotFound, PriceService
from app.services.prices import bscscan

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def load_prices(session):
    batch = ImportBatch(source="DEXSCREENER_CSV", file_name="dex.csv")
    session.add(batch)
    session.commit()
    with open(FIXTURES / "dexscreener_sample.csv") as f:
        dexscreener_csv.parse(f, batch.id)


def test_price_lookup_from_csv(session):
    load_prices(session)
    ts = datetime(2023, 9, 1, 12, tzinfo=timezone.utc)
    price = PriceService.get_usd("TKN", ts)
    assert price == Decimal("1.0")


def test_price_lookup_bnb_fallback(monkeypatch, session):
    load_prices(session)
    monkeypatch.setattr(bscscan.BscScanPriceService, "get_bnb_price", staticmethod(lambda: Decimal("200")))
    ts = datetime(2023, 9, 1, 12, tzinfo=timezone.utc)
    price = PriceService.get_usd("ALT", ts)
    assert price == Decimal("0.4")


def test_price_not_found(session):
    load_prices(session)
    ts = datetime(2023, 9, 1, 12, tzinfo=timezone.utc)
    with pytest.raises(PriceNotFound):
        PriceService.get_usd("MISSING", ts)
