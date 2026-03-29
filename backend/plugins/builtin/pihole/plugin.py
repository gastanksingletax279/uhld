from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class PiHolePlugin(PluginBase):
    plugin_id = "pihole"
    display_name = "Pi-hole"
    description = "Monitor Pi-hole DNS ad blocking statistics and query log (v5 and v6)"
    version = "1.0.0"
    icon = "shield-off"
    category = "network"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "Host",
                "description": "Hostname or IP of your Pi-hole instance",
                "placeholder": "192.168.1.100",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 80,
            },
            "api_key": {
                "type": "string",
                "title": "API Key (v5)",
                "description": "Long hash API key from Pi-hole v5 Settings > API",
                "format": "password",
                "sensitive": True,
            },
            "password": {
                "type": "string",
                "title": "Password (v6)",
                "description": "Web UI password for Pi-hole v6",
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
        "required": ["host"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._session_id: str | None = None
        self._summary_cache: dict | None = None

    # ── Version detection ─────────────────────────────────────────────────────

    def _is_v6(self) -> bool:
        return bool(self._config.get("password", "").strip())

    # ── Client management ─────────────────────────────────────────────────────

    def _base_url(self) -> str:
        scheme = "https" if self._config.get("use_https", False) else "http"
        host = self._config.get("host", "localhost")
        port = int(self._config.get("port", 80))
        return f"{scheme}://{host}:{port}"

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            verify = bool(self._config.get("verify_ssl", False))
            self._client = httpx.AsyncClient(
                base_url=self._base_url(),
                verify=verify,
                timeout=10.0,
            )
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ── v6 auth ───────────────────────────────────────────────────────────────

    async def _v6_login(self) -> str:
        client = self._get_client()
        password = self._config.get("password", "")
        resp = await client.post("/api/auth", json={"password": password})
        resp.raise_for_status()
        data = resp.json()
        sid = data["session"]["sid"]
        self._session_id = sid
        return sid

    def _v6_headers(self) -> dict[str, str]:
        return {"X-FTL-SID": self._session_id or ""}

    async def _v6_get(self, path: str) -> dict:
        """GET with v6 auth, retrying once on 401."""
        client = self._get_client()
        if self._session_id is None:
            await self._v6_login()
        resp = await client.get(path, headers=self._v6_headers())
        if resp.status_code == 401:
            await self._v6_login()
            resp = await client.get(path, headers=self._v6_headers())
        resp.raise_for_status()
        return resp.json()

    async def _v6_post(self, path: str, json: dict) -> httpx.Response:
        """POST with v6 auth, retrying once on 401."""
        client = self._get_client()
        if self._session_id is None:
            await self._v6_login()
        resp = await client.post(path, json=json, headers=self._v6_headers())
        if resp.status_code == 401:
            await self._v6_login()
            resp = await client.post(path, json=json, headers=self._v6_headers())
        resp.raise_for_status()
        return resp

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        await self._close_client()
        self._session_id = None
        self._summary_cache = None

    async def on_disable(self) -> None:
        await self._close_client()
        self._session_id = None
        self._summary_cache = None

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            summary = await self._fetch_summary()
            if summary.get("status") == "error":
                return {"status": "error", "message": summary.get("message", "Unknown error")}
            blocking = summary.get("blocking", False)
            queries = summary.get("dns_queries_today", 0)
            return {
                "status": "ok",
                "message": f"{'Blocking' if blocking else 'Disabled'} — {queries} queries today",
            }
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()
        logger.debug("Pi-hole summary cache refreshed")

    async def _fetch_summary(self) -> dict:
        try:
            if self._is_v6():
                return await self._fetch_summary_v6()
            else:
                return await self._fetch_summary_v5()
        except Exception as exc:
            logger.error("Pi-hole fetch_summary error: %s", exc)
            await self._close_client()
            self._session_id = None
            return {"status": "error", "message": str(exc)}

    async def _fetch_summary_v5(self) -> dict:
        client = self._get_client()
        api_key = self._config.get("api_key", "")
        resp = await client.get(f"/admin/api.php?summary&auth={api_key}")
        resp.raise_for_status()
        data = resp.json()
        blocking = str(data.get("status", "")).lower() == "enabled"
        result = {
            "status": "ok",
            "blocking": blocking,
            "dns_queries_today": int(str(data.get("dns_queries_today", "0")).replace(",", "")),
            "ads_blocked_today": int(str(data.get("ads_blocked_today", "0")).replace(",", "")),
            "ads_percentage_today": float(data.get("ads_percentage_today", 0.0)),
            "domains_on_blocklist": int(str(data.get("domains_being_blocked", "0")).replace(",", "")),
        }
        self._summary_cache = result
        return result

    async def _fetch_summary_v6(self) -> dict:
        data = await self._v6_get("/api/stats/summary")
        queries_data = data.get("queries", {})
        gravity_data = data.get("gravity", {})
        total = int(queries_data.get("total", 0))
        blocked = int(queries_data.get("blocked", 0))
        pct = float(queries_data.get("percent_blocked", 0.0))
        blocking_resp = await self._v6_get("/api/dns/blocking")
        blocking = bool(blocking_resp.get("blocking", False))
        result = {
            "status": "ok",
            "blocking": blocking,
            "dns_queries_today": total,
            "ads_blocked_today": blocked,
            "ads_percentage_today": round(pct, 2),
            "domains_on_blocklist": int(gravity_data.get("domains_being_blocked", 0)),
        }
        self._summary_cache = result
        return result

    # ── Public helpers used by api.py ─────────────────────────────────────────

    async def fetch_querylog_v5(self, limit: int = 100) -> list[dict]:
        client = self._get_client()
        api_key = self._config.get("api_key", "")
        resp = await client.get(f"/admin/api.php?getAllQueries={limit}&auth={api_key}")
        resp.raise_for_status()
        raw = resp.json()
        rows = raw.get("data", [])
        result = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 5:
                continue
            result.append({
                "time": str(row[0]),
                "query_type": str(row[1]),
                "domain": str(row[2]),
                "client": str(row[3]),
                "status": str(row[4]),
            })
        return result

    async def fetch_querylog_v6(self, limit: int = 100) -> list[dict]:
        data = await self._v6_get(f"/api/queries?max={limit}")
        queries = data.get("queries", []) or []
        result = []
        for q in queries:
            result.append({
                "time": str(q.get("time", "")),
                "query_type": str(q.get("type", "")),
                "domain": str(q.get("domain", "")),
                "client": str(q.get("client", {}).get("ip", "") if isinstance(q.get("client"), dict) else q.get("client", "")),
                "status": str(q.get("status", "")),
            })
        return result

    async def set_blocking_v5(self, enabled: bool) -> None:
        client = self._get_client()
        api_key = self._config.get("api_key", "")
        action = "enable" if enabled else "disable"
        resp = await client.get(f"/admin/api.php?{action}&auth={api_key}")
        resp.raise_for_status()

    async def set_blocking_v6(self, enabled: bool) -> None:
        await self._v6_post("/api/dns/blocking", {"blocking": enabled})

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.pihole.api import make_router
        return make_router(self)
