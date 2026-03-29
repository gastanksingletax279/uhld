from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class AdGuardPlugin(PluginBase):
    plugin_id = "adguard"
    display_name = "AdGuard Home"
    description = "Monitor AdGuard Home DNS filtering statistics and query log"
    version = "1.0.0"
    icon = "shield"
    category = "network"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "Host",
                "description": "Hostname or IP of your AdGuard Home instance",
                "placeholder": "192.168.1.100",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 3000,
            },
            "username": {
                "type": "string",
                "title": "Username",
                "default": "admin",
            },
            "password": {
                "type": "string",
                "title": "Password",
                "format": "password",
                "sensitive": True,
            },
            "use_https": {
                "type": "boolean",
                "title": "Use HTTPS",
                "default": False,
            },
            "verify_ssl": {
                "type": "boolean",
                "title": "Verify SSL",
                "default": False,
                "description": "Disable for self-signed certs",
            },
        },
        "required": ["host", "username", "password"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._summary_cache: dict | None = None

    # ── Client management ─────────────────────────────────────────────────────

    def _base_url(self) -> str:
        scheme = "https" if self._config.get("use_https", False) else "http"
        host = self._config.get("host", "localhost")
        port = int(self._config.get("port", 3000))
        return f"{scheme}://{host}:{port}"

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            verify = bool(self._config.get("verify_ssl", False))
            username = self._config.get("username", "admin")
            password = self._config.get("password", "")
            self._client = httpx.AsyncClient(
                base_url=self._base_url(),
                auth=(username, password),
                verify=verify,
                timeout=10.0,
            )
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

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
            client = self._get_client()
            resp = await client.get("/control/status")
            resp.raise_for_status()
            data = resp.json()
            running = data.get("running", False)
            return {
                "status": "ok" if running else "error",
                "message": f"AdGuard Home {'running' if running else 'not running'} v{data.get('version', '?')}",
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
        logger.debug("AdGuard summary cache refreshed")

    async def _fetch_summary(self) -> dict:
        try:
            client = self._get_client()

            status_resp = await client.get("/control/status")
            status_resp.raise_for_status()
            status = status_resp.json()

            stats_resp = await client.get("/control/stats")
            stats_resp.raise_for_status()
            stats = stats_resp.json()

            dns_queries_arr: list[int] = stats.get("dns_queries", []) or []
            blocked_arr: list[int] = stats.get("blocked_filtering", []) or []
            dns_queries = sum(dns_queries_arr)
            blocked_filtering = sum(blocked_arr)
            blocked_pct = round(blocked_filtering / dns_queries * 100, 1) if dns_queries > 0 else 0.0
            avg_ms = round(float(stats.get("avg_processing_time", 0)) * 1000, 2)

            result = {
                "status": "ok",
                "protection_enabled": bool(status.get("protection_enabled", False)),
                "dns_queries": dns_queries,
                "blocked_filtering": blocked_filtering,
                "blocked_pct": blocked_pct,
                "avg_processing_ms": avg_ms,
            }
            self._summary_cache = result
            return result
        except Exception as exc:
            logger.error("AdGuard fetch_summary error: %s", exc)
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.adguard.api import make_router
        return make_router(self)
