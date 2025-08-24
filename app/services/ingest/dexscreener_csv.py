from __future__ import annotations

import csv
from datetime import timezone
from decimal import Decimal
from typing import IO

from dateutil import parser as dtparser

from app.db import SessionLocal
from app.db.models import PricePoint
from .base import IngestResult


def parse(file: IO, import_batch_id: int) -> IngestResult:
    reader = csv.DictReader(file)
    session = SessionLocal()
    rows_ok = 0
    rows_error = 0
    warnings = []

    for idx, row in enumerate(reader, start=1):
        try:
            dt = dtparser.parse(row.get("timestamp") or row.get("dt"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt_utc = dt.astimezone(timezone.utc)
            token = row.get("token") or row.get("token_symbol")
            price_usd = row.get("price_usd") or row.get("price")
            if price_usd:
                price = Decimal(price_usd)
                exists = (
                    session.query(PricePoint)
                    .filter_by(asset=token, quote="USD", dt_utc=dt_utc, source="DEXSCREENER")
                    .first()
                )
                if not exists:
                    session.add(
                        PricePoint(
                            dt_utc=dt_utc,
                            asset=token,
                            quote="USD",
                            price=price,
                            source="DEXSCREENER",
                        )
                    )
            price_bnb = row.get("price_in_bnb")
            if price_bnb:
                price = Decimal(price_bnb)
                exists = (
                    session.query(PricePoint)
                    .filter_by(asset=token, quote="BNB", dt_utc=dt_utc, source="DEXSCREENER")
                    .first()
                )
                if not exists:
                    session.add(
                        PricePoint(
                            dt_utc=dt_utc,
                            asset=token,
                            quote="BNB",
                            price=price,
                            source="DEXSCREENER",
                        )
                    )
            rows_ok += 1
        except Exception as exc:  # pragma: no cover
            rows_error += 1
            warnings.append(str(exc))

    session.commit()
    session.close()
    return IngestResult(rows_ok=rows_ok, rows_error=rows_error, warnings=warnings, batch_id=import_batch_id)
