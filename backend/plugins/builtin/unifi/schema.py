from __future__ import annotations

from pydantic import BaseModel


class UniFiClient(BaseModel):
    mac: str
    hostname: str
    ip: str
    is_wired: bool
    essid: str | None = None
    rssi: int | None = None
    rx_bytes: int
    tx_bytes: int
    uptime: int | None = None


class UniFiDevice(BaseModel):
    mac: str
    name: str
    type: str
    model: str
    version: str
    ip: str
    state: int
    uptime: int | None = None


class UniFiSummary(BaseModel):
    status: str
    clients_total: int
    clients_wifi: int
    clients_wired: int
    devices_total: int
    devices_online: int
