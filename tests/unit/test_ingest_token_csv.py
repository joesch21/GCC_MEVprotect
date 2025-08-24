from decimal import Decimal
from pathlib import Path

from app.db.models import ImportBatch, TransactionRaw
from app.services.ingest import token_tx_csv

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_parse_token_csv(session):
    file_path = FIXTURES / "token_tx_sample.csv"
    batch = ImportBatch(source="TOKEN_CSV", file_name=file_path.name)
    session.add(batch)
    session.commit()

    with open(file_path) as f:
        result = token_tx_csv.parse(f, batch.id)
    assert result["rows_ok"] == 3
    assert result["rows_error"] == 0

    rows = session.query(TransactionRaw).all()
    assert len(rows) == 3
    first = rows[0].provenance["normalized"]
    assert first["datetime_utc"].endswith("+00:00")
    assert Decimal(first["base_qty"]) == Decimal("1.23")

    batch2 = ImportBatch(source="TOKEN_CSV", file_name=file_path.name)
    session.add(batch2)
    session.commit()
    with open(file_path) as f:
        result2 = token_tx_csv.parse(f, batch2.id)
    assert result2["rows_ok"] == 0
    assert session.query(TransactionRaw).count() == 3
