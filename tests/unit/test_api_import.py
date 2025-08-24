from pathlib import Path

from app.db.models import ImportBatch

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_api_import_token(client, session):
    data = {
        "file": (open(FIXTURES / "token_tx_sample.csv", "rb"), "token.csv"),
    }
    resp = client.post("/api/import/csv?source=token", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    js = resp.get_json()
    assert js["rows_ok"] == 3
    assert session.query(ImportBatch).count() == 1


def test_api_import_wallet(client, session):
    data = [
        ("files", (open(FIXTURES / "wallet_tx_sample_normal.csv", "rb"), "n.csv")),
        ("files", (open(FIXTURES / "wallet_tx_sample_internal.csv", "rb"), "i.csv")),
        ("files", (open(FIXTURES / "wallet_tx_sample_tokentx.csv", "rb"), "t.csv")),
    ]
    resp = client.post("/api/import/csv?source=wallet", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    js = resp.get_json()
    assert js["rows_ok"] == 3
    assert session.query(ImportBatch).count() == 1


def test_api_import_dex(client, session):
    data = {
        "file": (open(FIXTURES / "dexscreener_sample.csv", "rb"), "dex.csv"),
    }
    resp = client.post("/api/import/csv?source=dexscreener", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    js = resp.get_json()
    assert js["rows_ok"] == 2
    assert session.query(ImportBatch).count() == 1
