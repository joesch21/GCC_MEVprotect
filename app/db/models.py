from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id = Column(Integer, primary_key=True)
    source = Column(String, nullable=False)
    file_name = Column(String, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    rows_ok = Column(Integer, default=0)
    rows_error = Column(Integer, default=0)
    warnings = Column(JSON, default=list)
    notes = Column(Text)

    transactions = relationship("TransactionRaw", back_populates="batch")


class TransactionRaw(Base):
    __tablename__ = "transaction_raw"

    id = Column(Integer, primary_key=True)
    import_batch_id = Column(Integer, ForeignKey("import_batch.id"), nullable=False)
    source = Column(String, nullable=False)
    row_hash = Column(String, unique=True, nullable=False)
    raw_payload = Column(JSON, nullable=False)
    error = Column(Text)
    provenance = Column(JSON, nullable=False)

    batch = relationship("ImportBatch", back_populates="transactions")


class PricePoint(Base):
    __tablename__ = "price_point"
    __table_args__ = (
        UniqueConstraint("asset", "quote", "dt_utc", "source", name="uix_pricepoint"),
    )

    id = Column(Integer, primary_key=True)
    dt_utc = Column(DateTime(timezone=True), nullable=False)
    asset = Column(String, nullable=False)
    quote = Column(String, nullable=False, default="USD")
    price = Column(Numeric(38, 18), nullable=False)
    source = Column(String, nullable=False)
