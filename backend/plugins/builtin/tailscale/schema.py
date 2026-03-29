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
    updateAvailable: bool = False
    keyExpiryDisabled: bool = False
    expires: str | None = None
    advertisedRoutes: list[str] | None = None
    enabledRoutes: list[str] | None = None


class TailscaleUser(BaseModel):
    id: str
    loginName: str
    displayName: str
    profilePicUrl: str | None = None
    created: str | None = None
    role: str = "member"
    status: str = "active"
    type: str | None = None


class TailscaleDNS(BaseModel):
    nameservers: list[str] = []
    searchPaths: list[str] = []
    magicDNS: bool = False
    domains: list[str] = []


class TailscaleLocalStatus(BaseModel):
    available: bool
    backend_state: str | None = None
    ipv4: str | None = None
    ipv6: str | None = None
    hostname: str | None = None
    dns_name: str | None = None
    online: bool = False
    tailscale_ips: list[str] = []


class TailscaleSummary(BaseModel):
    status: str
    devices_total: int = 0
    devices_online: int = 0
