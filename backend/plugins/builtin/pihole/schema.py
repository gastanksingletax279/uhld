from __future__ import annotations

from pydantic import BaseModel


class PiHoleSummary(BaseModel):
    status: str
    blocking: bool
    dns_queries_today: int
    ads_blocked_today: int
    ads_percentage_today: float
    domains_on_blocklist: int


class PiHoleQueryEntry(BaseModel):
    time: str
    query_type: str
    domain: str
    client: str
    status: str
