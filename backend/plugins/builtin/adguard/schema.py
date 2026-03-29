from __future__ import annotations

from pydantic import BaseModel


class AdGuardStatus(BaseModel):
    protection_enabled: bool
    running: bool
    version: str


class AdGuardQueryEntry(BaseModel):
    time: str
    client: str
    status: str
    reason: str
    answer: str | None = None


class AdGuardSummary(BaseModel):
    status: str
    protection_enabled: bool
    dns_queries: int
    blocked_filtering: int
    blocked_pct: float
    avg_processing_ms: float
