from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException

if TYPE_CHECKING:
    from backend.plugins.builtin.unifi.plugin import UniFiPlugin

logger = logging.getLogger(__name__)


def make_router(plugin: UniFiPlugin) -> APIRouter:
    router = APIRouter()

    # ── Clients ───────────────────────────────────────────────────────────────

    @router.get("/clients")
    async def get_clients():
        try:
            clients = await plugin._fetch_clients()
            return {"clients": clients}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/clients/{client_id}/kick")
    async def kick_client(client_id: str):
        try:
            await plugin.kick_client(client_id)
            return {"message": f"Client {client_id} reconnecting"}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Devices ───────────────────────────────────────────────────────────────

    @router.get("/devices")
    async def get_devices():
        try:
            devices = await plugin._fetch_devices()
            return {"devices": devices}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Switch ports ──────────────────────────────────────────────────────────

    @router.get("/ports")
    async def get_ports():
        try:
            ports = await plugin._fetch_ports()
            return {"ports": ports}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Networks ──────────────────────────────────────────────────────────────

    @router.get("/networks")
    async def get_networks():
        try:
            networks = await plugin._fetch_networks()
            return {"networks": networks}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── WLANs / WiFi broadcasts ───────────────────────────────────────────────

    @router.get("/wlans")
    async def get_wlans():
        try:
            wlans = await plugin._fetch_wlans()
            return {"wlans": wlans}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Firewall ──────────────────────────────────────────────────────────────

    @router.get("/firewall")
    async def get_firewall():
        try:
            import asyncio

            async def _empty() -> list:
                return []

            rules_raw, groups_raw, zones_raw = await asyncio.gather(
                plugin._fetch_firewall_rules(),
                plugin._fetch_firewall_groups(),
                plugin._fetch_firewall_zones(),
            )
            return {"rules": rules_raw, "groups": groups_raw, "zones": zones_raw}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
