from __future__ import annotations

import csv
import json
from datetime import timezone
from hashlib import sha256
from typing import IO

from dateutil import parser as dtparser
from decimal import Decimal

from app.db import SessionLocal
from app.db.models import TransactionRaw
from .base import IngestResult
from app.services.normalize.schema import Transaction


def parse(file: IO, import_batch_id: int) -> IngestResult:
    reader = csv.DictReader(file)
    session = SessionLocal()
    rows_ok = 0
    rows_error = 0
    warnings = []

    for idx, row in enumerate(reader, start=1):
        try:
            dt = dtparser.parse(row["timestamp"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt_utc = dt.astimezone(timezone.utc)
            amount = Decimal(row["value"])
            canonical = {
                "tx_hash": row["tx_hash"],
                "datetime_utc": dt_utc.isoformat(),
                "from": row["from"],
                "to": row["to"],
                "value": str(amount),
                "token_symbol": row.get("token_symbol"),
                "token_contract": row.get("token_contract"),
            }
            row_hash = sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
            exists = session.query(TransactionRaw).filter_by(row_hash=row_hash).first()
            if exists:
                continue
            tx = Transaction(
                tx_hash=row["tx_hash"],
                datetime_utc=dt_utc,
                type="TRANSFER",
                base_asset=row.get("token_symbol"),
                base_qty=amount,
                provenance={"source": "token_csv"},
            )
            tr = TransactionRaw(
                import_batch_id=import_batch_id,
                source="TOKEN_CSV",
                row_hash=row_hash,
                raw_payload=row,
                provenance={
                    "source_file": getattr(file, "name", ""),
                    "row_number": idx,
                    "normalized": json.loads(tx.json()),
                },
            )
            session.add(tr)
            rows_ok += 1
        except Exception as exc:  # pragma: no cover - generic error catch
            rows_error += 1
            warnings.append(str(exc))

    session.commit()
    session.close()
    return IngestResult(rows_ok=rows_ok, rows_error=rows_error, warnings=warnings, batch_id=import_batch_id)
