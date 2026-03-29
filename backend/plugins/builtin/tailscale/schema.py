from __future__ import annotations

from pydantic import BaseModel


class TailscaleDevice(BaseModel):
    id: str
    hostname: str
    name: str
    addresses: list[str]
    os: str
    clientVersion: str
    lastSeen: str
    online: bool
    user: str
    authorized: bool
    tags: list[str] | None = None


class TailscaleSummary(BaseModel):
    status: str
    devices_total: int
    devices_online: int
