from __future__ import annotations

import csv
import json
from datetime import timezone
from hashlib import sha256
from typing import IO, Iterable

from dateutil import parser as dtparser
from decimal import Decimal

from app.db import SessionLocal
from app.db.models import TransactionRaw
from .base import IngestResult
from app.services.normalize.schema import Transaction


def parse(files: Iterable[IO], import_batch_id: int) -> IngestResult:
    session = SessionLocal()
    rows_ok = 0
    rows_error = 0
    warnings = []
    seen_hashes = set()

    for file in files:
        reader = csv.DictReader(file)
        for idx, row in enumerate(reader, start=1):
            try:
                dt = dtparser.parse(row.get("DateTime") or row.get("timestamp") or row.get("timeStamp"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                dt_utc = dt.astimezone(timezone.utc)
                amount_str = row.get("Value") or row.get("value") or row.get("TokenValue") or row.get("token_value") or "0"
                amount = Decimal(amount_str)
                canonical = {
                    "tx_hash": row.get("Txhash") or row.get("hash") or row.get("tx_hash"),
                    "datetime_utc": dt_utc.isoformat(),
                    "from": row.get("From"),
                    "to": row.get("To"),
                    "value": str(amount),
                    "token_symbol": row.get("TokenSymbol"),
                }
                row_hash = sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
                if row_hash in seen_hashes:
                    continue
                seen_hashes.add(row_hash)
                exists = session.query(TransactionRaw).filter_by(row_hash=row_hash).first()
                if exists:
                    continue
                tx = Transaction(
                    tx_hash=canonical["tx_hash"],
                    datetime_utc=dt_utc,
                    type="TRANSFER",
                    base_asset=canonical.get("token_symbol"),
                    base_qty=amount,
                    provenance={"source": "wallet_csv"},
                )
                tr = TransactionRaw(
                    import_batch_id=import_batch_id,
                    source="WALLET_CSV",
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
            except Exception as exc:  # pragma: no cover
                rows_error += 1
                warnings.append(str(exc))

    session.commit()
    session.close()
    return IngestResult(rows_ok=rows_ok, rows_error=rows_error, warnings=warnings, batch_id=import_batch_id)
