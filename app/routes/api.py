from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List

from flask import Blueprint, abort, jsonify, request

from app.db import SessionLocal
from app.db.models import ImportBatch
from app.services.ingest import dexscreener_csv, token_tx_csv, wallet_tx_csv

bp = Blueprint("api", __name__)


@bp.route("/api/import/csv", methods=["POST"])
def import_csv():
    source = request.args.get("source")
    if not source:
        abort(400)

    files = request.files.getlist("file") or request.files.getlist("files")
    if not files:
        abort(400)

    session = SessionLocal()
    batch = ImportBatch(source=f"{source.upper()}_CSV", file_name=",".join(f.filename or getattr(f, "name", "") for f in files), started_at=datetime.utcnow())
    session.add(batch)
    session.commit()

    if source == "token":
        result = token_tx_csv.parse(files[0], batch.id)
    elif source == "wallet":
        result = wallet_tx_csv.parse(files, batch.id)
    elif source == "dexscreener":
        result = dexscreener_csv.parse(files[0], batch.id)
    else:
        abort(400)

    batch.completed_at = datetime.utcnow()
    batch.rows_ok = result["rows_ok"]
    batch.rows_error = result["rows_error"]
    batch.warnings = result["warnings"]
    session.commit()
    session.close()

    logging.info(json.dumps({
        "batch_id": batch.id,
        "source": source,
        "rows_ok": batch.rows_ok,
        "rows_error": batch.rows_error,
        "warnings": batch.warnings,
    }))

    return jsonify({"batch_id": batch.id, **result})
