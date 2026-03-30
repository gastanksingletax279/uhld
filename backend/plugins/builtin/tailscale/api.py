from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.tailscale.plugin import TailscalePlugin

from backend.plugins.builtin.tailscale.schema import TailscaleLocalStatus

logger = logging.getLogger(__name__)

_TAILSCALE_SOCKET = "/var/run/tailscale/tailscaled.sock"


class SaveAclRequest(BaseModel):
    acl: str


def make_router(plugin: TailscalePlugin) -> APIRouter:
    router = APIRouter()

    # ── Devices ───────────────────────────────────────────────────────────────

    @router.get("/devices")
    async def get_devices():
        try:
            devices = await plugin._fetch_devices()
            for d in devices:
                d["online"] = d.get("connectedToControl", False)
            return {"devices": devices}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Users ─────────────────────────────────────────────────────────────────

    @router.get("/users")
    async def get_users():
        try:
            users = await plugin._fetch_users()
            return {"users": users}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── DNS ───────────────────────────────────────────────────────────────────

    @router.get("/dns")
    async def get_dns():
        try:
            return await plugin._fetch_dns()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── ACL ───────────────────────────────────────────────────────────────────

    @router.get("/acl", response_class=PlainTextResponse)
    async def get_acl():
        try:
            return await plugin._fetch_acl()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/acl")
    async def save_acl(body: SaveAclRequest):
        try:
            return await plugin._save_acl(body.acl)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/acl/validate")
    async def validate_acl(body: SaveAclRequest):
        try:
            return await plugin._validate_acl(body.acl)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Keys ──────────────────────────────────────────────────────────────────

    @router.get("/keys")
    async def get_keys():
        try:
            keys = await plugin._fetch_keys()
            return {"keys": keys}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Tailnet settings ──────────────────────────────────────────────────────

    @router.get("/settings")
    async def get_tailnet_settings():
        try:
            return await plugin._fetch_tailnet_settings()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Device actions ────────────────────────────────────────────────────────

    class RenameRequest(BaseModel):
        name: str

    class SetIpRequest(BaseModel):
        ipv4: str

    class KeyExpiryRequest(BaseModel):
        disabled: bool

    class RoutesRequest(BaseModel):
        routes: list[str]

    class TagsRequest(BaseModel):
        tags: list[str]

    @router.delete("/devices/{device_id}")
    async def delete_device(device_id: str):
        try:
            return await plugin._delete_device(device_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/expire-key")
    async def expire_device_key(device_id: str):
        try:
            return await plugin._expire_device_key(device_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/authorize")
    async def authorize_device(device_id: str):
        try:
            return await plugin._authorize_device(device_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/rename")
    async def rename_device(device_id: str, body: RenameRequest):
        try:
            return await plugin._rename_device(device_id, body.name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/set-ip")
    async def set_device_ip(device_id: str, body: SetIpRequest):
        try:
            return await plugin._set_device_ip(device_id, body.ipv4)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/key-expiry")
    async def set_key_expiry(device_id: str, body: KeyExpiryRequest):
        try:
            return await plugin._set_key_expiry_disabled(device_id, body.disabled)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/devices/{device_id}/routes")
    async def get_device_routes(device_id: str):
        try:
            return await plugin._get_device_routes(device_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/routes")
    async def set_device_routes(device_id: str, body: RoutesRequest):
        try:
            return await plugin._set_device_routes(device_id, body.routes)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/devices/{device_id}/tags")
    async def set_device_tags(device_id: str, body: TagsRequest):
        try:
            return await plugin._set_device_tags(device_id, body.tags)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Local sidecar status (Unix socket) ────────────────────────────────────

    @router.get("/status", response_model=TailscaleLocalStatus)
    async def local_status():
        """Query the local Tailscale daemon via Unix socket (sidecar pattern)."""
        if not os.path.exists(_TAILSCALE_SOCKET):
            return TailscaleLocalStatus(available=False)
        try:
            import httpx
            transport = httpx.AsyncHTTPTransport(uds=_TAILSCALE_SOCKET)
            async with httpx.AsyncClient(transport=transport, timeout=5.0) as client:
                resp = await client.get("http://local-tailscaled.sock/localapi/v0/status")
                resp.raise_for_status()
                data = resp.json()
            self_node = data.get("Self", {})
            ips = self_node.get("TailscaleIPs", [])
            ipv4 = next((ip for ip in ips if ":" not in ip), None)
            ipv6 = next((ip for ip in ips if ":" in ip), None)
            dns_name = (self_node.get("DNSName") or "").rstrip(".")
            return TailscaleLocalStatus(
                available=True,
                backend_state=data.get("BackendState"),
                ipv4=ipv4,
                ipv6=ipv6,
                hostname=self_node.get("HostName"),
                dns_name=dns_name,
                online=data.get("BackendState") == "Running",
                tailscale_ips=ips,
            )
        except Exception as exc:
            logger.debug("Tailscale local status error: %s", exc)
            return TailscaleLocalStatus(available=False)

    return router
