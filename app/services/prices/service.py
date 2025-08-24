from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal

from app.db import SessionLocal
from app.db.models import PricePoint
from .bscscan import BscScanPriceService


class PriceNotFound(Exception):
    pass


class PriceService:
    @staticmethod
    def get_usd(asset: str, ts: datetime) -> Decimal:
        session = SessionLocal()
        start = ts - timedelta(days=1)
        end = ts + timedelta(days=1)
        points = (
            session.query(PricePoint)
            .filter(PricePoint.asset == asset)
            .filter(PricePoint.quote == "USD")
            .filter(PricePoint.dt_utc >= start)
            .filter(PricePoint.dt_utc <= end)
            .all()
        )
        if points:
            chosen = min(points, key=lambda p: abs(p.dt_utc - ts))
            logging.info("price-source=csv asset=%s ts=%s", asset, chosen.dt_utc)
            session.close()
            return Decimal(chosen.price)

        if asset.upper() == "BNB":
            price = BscScanPriceService.get_bnb_price()
            logging.info("price-source=live-bscscan asset=BNB")
            session.close()
            return price

        points = (
            session.query(PricePoint)
            .filter(PricePoint.asset == asset)
            .filter(PricePoint.quote == "BNB")
            .filter(PricePoint.dt_utc >= start)
            .filter(PricePoint.dt_utc <= end)
            .all()
        )
        session.close()
        if points:
            chosen = min(points, key=lambda p: abs(p.dt_utc - ts))
            bnb_usd = BscScanPriceService.get_bnb_price()
            price_usd = Decimal(chosen.price) * Decimal(bnb_usd)
            logging.info("price-source=csv-bnb asset=%s ts=%s", asset, chosen.dt_utc)
            return price_usd

        raise PriceNotFound(f"{asset} @ {ts}")
