from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, validator


class Transaction(BaseModel):
    tx_id: Optional[str] = None
    tx_hash: str
    datetime_utc: datetime
    platform: Optional[str] = None
    account: Optional[str] = None
    chain: Optional[str] = None
    type: str
    base_asset: Optional[str] = None
    base_qty: Optional[Decimal] = None
    quote_asset: Optional[str] = None
    quote_qty: Optional[Decimal] = None
    fee_asset: Optional[str] = None
    fee_qty: Optional[Decimal] = None
    price_quote: Optional[Decimal] = None
    note: Optional[str] = None
    provenance: dict

    @validator("datetime_utc", pre=True)
    def _parse_datetime(cls, v):
        if isinstance(v, datetime):
            dt = v
        else:
            dt = datetime.fromisoformat(str(v))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @validator("base_qty", "quote_qty", "fee_qty", "price_quote", pre=True)
    def _parse_decimal(cls, v):
        if v in (None, ""):
            return None
        return Decimal(str(v))

    class Config:
        json_encoders = {Decimal: lambda x: str(x)}
