from __future__ import annotations

from typing import List, Protocol, TypedDict, IO


class IngestResult(TypedDict):
    rows_ok: int
    rows_error: int
    warnings: List[str]
    batch_id: int


class CsvParser(Protocol):
    def parse(self, file: IO, import_batch_id: int) -> IngestResult:
        ...
