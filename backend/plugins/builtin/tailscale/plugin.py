from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)

_TAILSCALE_API_BASE = "https://api.tailscale.com"


class TailscalePlugin(PluginBase):
    plugin_id = "tailscale"
    display_name = "Tailscale"
    description = "Monitor Tailscale VPN devices and network status"
    version = "1.0.0"
    icon = "network"
    category = "network"
    poll_interval = 120

    config_schema = {
        "type": "object",
        "properties": {
            "api_key": {
                "type": "string",
                "title": "API Key",
                "description": "Tailscale API key from https://login.tailscale.com/admin/settings/keys",
                "format": "password",
                "sensitive": True,
            },
            "tailnet": {
                "type": "string",
                "title": "Tailnet",
                "description": "Your tailnet name or organization. Use '-' for your personal tailnet.",
                "default": "-",
                "placeholder": "-",
            },
        },
        "required": ["api_key"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._summary_cache: dict | None = None

    # ── Client management ─────────────────────────────────────────────────────

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            api_key = self._config.get("api_key", "")
            self._client = httpx.AsyncClient(
                base_url=_TAILSCALE_API_BASE,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15.0,
            )
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _tailnet(self) -> str:
        return self._config.get("tailnet", "-") or "-"

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        await self._close_client()
        self._summary_cache = None

    async def on_disable(self) -> None:
        await self._close_client()
        self._summary_cache = None

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            devices = await self._fetch_devices()
            online = sum(1 for d in devices if d.get("connectedToControl", False))
            return {
                "status": "ok",
                "message": f"{online}/{len(devices)} device(s) online",
            }
        except Exception as exc:
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()
        logger.debug("Tailscale summary cache refreshed")

    async def _fetch_summary(self) -> dict:
        try:
            devices = await self._fetch_devices()
            total = len(devices)
            # Tailscale API uses `connectedToControl` (not `online`) — requires ?fields=all
            online = sum(1 for d in devices if d.get("connectedToControl", False))
            result = {
                "status": "ok",
                "devices_total": total,
                "devices_online": online,
            }
            self._summary_cache = result
            return result
        except Exception as exc:
            logger.error("Tailscale fetch_summary error: %s", exc)
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    async def _fetch_devices(self) -> list[dict]:
        client = self._get_client()
        tailnet = self._tailnet()
        # fields=all is required to get `online` and `updateAvailable` per device
        resp = await client.get(f"/api/v2/tailnet/{tailnet}/devices?fields=all")
        resp.raise_for_status()
        return resp.json().get("devices", [])

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.tailscale.api import make_router
        return make_router(self)
