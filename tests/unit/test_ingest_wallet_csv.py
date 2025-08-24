from pathlib import Path

from app.db.models import ImportBatch, TransactionRaw
from app.services.ingest import wallet_tx_csv

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_parse_wallet_csv(session):
    files = [
        open(FIXTURES / "wallet_tx_sample_normal.csv"),
        open(FIXTURES / "wallet_tx_sample_internal.csv"),
        open(FIXTURES / "wallet_tx_sample_tokentx.csv"),
    ]
    batch = ImportBatch(source="WALLET_CSV", file_name="multi")
    session.add(batch)
    session.commit()

    result = wallet_tx_csv.parse(files, batch.id)
    for f in files:
        f.close()
    assert result["rows_ok"] == 3
    assert session.query(TransactionRaw).count() == 3
    first = session.query(TransactionRaw).first()
    prov = first.provenance
    assert "source_file" in prov and "row_number" in prov
