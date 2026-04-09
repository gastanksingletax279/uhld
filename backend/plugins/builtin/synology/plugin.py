from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class SynologyPlugin(PluginBase):
    plugin_id = "synology"
    display_name = "Synology DSM"
    description = "Monitor and manage your Synology NAS — storage, shares, downloads, and packages"
    version = "1.0.0"
    icon = "hard-drive"
    category = "storage"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "Host",
                "description": "IP address or hostname of your Synology NAS (no trailing slash)",
                "placeholder": "192.168.1.100",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 5001,
                "description": "DSM port (5001 for HTTPS, 5000 for HTTP)",
            },
            "username": {
                "type": "string",
                "title": "Username",
                "description": "DSM admin username",
                "placeholder": "admin",
            },
            "password": {
                "type": "string",
                "title": "Password",
                "format": "password",
                "sensitive": True,
                "description": "DSM password",
            },
            "use_https": {
                "type": "boolean",
                "title": "Use HTTPS",
                "default": True,
                "description": "Use HTTPS when connecting to DSM",
            },
            "verify_ssl": {
                "type": "boolean",
                "title": "Verify SSL",
                "default": False,
                "description": "Verify SSL certificate (disable for self-signed certificates)",
            },
        },
        "required": ["host", "username", "password"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._sid: str | None = None
        self._summary_cache: dict | None = None

    # ── URL / config helpers ──────────────────────────────────────────────────

    def _base_url(self) -> str:
        host = self._config.get("host", "").strip().rstrip("/")
        port = int(self._config.get("port", 5001))
        use_https = bool(self._config.get("use_https", True))
        scheme = "https" if use_https else "http"
        return f"{scheme}://{host}:{port}"

    # ── HTTP client ───────────────────────────────────────────────────────────

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            verify = bool(self._config.get("verify_ssl", False))
            self._client = httpx.AsyncClient(
                base_url=self._base_url(),
                verify=verify,
                timeout=30.0,
                follow_redirects=True,
            )
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._sid = None

    # ── Session management ────────────────────────────────────────────────────

    async def _login(self) -> str:
        """Authenticate with SYNO.API.Auth and return the session ID."""
        client = self._get_client()
        params = {
            "api": "SYNO.API.Auth",
            "version": "3",
            "method": "login",
            "account": self._config.get("username", ""),
            "passwd": self._config.get("password", ""),
            "session": "uhld",
            "format": "cookie",
        }
        resp = await client.post("/webapi/entry.cgi", data=params)
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success"):
            error_code = body.get("error", {}).get("code", "unknown")
            raise RuntimeError(f"Synology login failed (error code {error_code})")
        sid: str = body["data"]["sid"]
        self._sid = sid
        return sid

    async def _logout(self) -> None:
        """Logout from DSM and invalidate the session ID."""
        if not self._sid:
            return
        try:
            client = self._get_client()
            await client.get(
                "/webapi/entry.cgi",
                params={
                    "api": "SYNO.API.Auth",
                    "version": "1",
                    "method": "logout",
                    "session": "uhld",
                    "_sid": self._sid,
                },
            )
        except Exception as exc:
            logger.debug("Synology logout error (ignored): %s", exc)
        finally:
            self._sid = None

    async def _ensure_sid(self) -> str:
        """Return a valid session ID, logging in first if needed."""
        if not self._sid:
            await self._login()
        return self._sid  # type: ignore[return-value]

    async def _api(self, params: dict[str, Any]) -> dict[str, Any]:
        """Make an authenticated call to /webapi/entry.cgi."""
        sid = await self._ensure_sid()
        client = self._get_client()
        all_params = {**params, "_sid": sid}
        try:
            resp = await client.get("/webapi/entry.cgi", params=all_params)
            resp.raise_for_status()
            body = resp.json()
            if not body.get("success"):
                error_code = body.get("error", {}).get("code", "unknown")
                # Session expired — try re-login once
                if error_code in (105, 106, 107, 119):
                    self._sid = None
                    sid = await self._ensure_sid()
                    all_params["_sid"] = sid
                    resp = await client.get("/webapi/entry.cgi", params=all_params)
                    resp.raise_for_status()
                    body = resp.json()
                    if not body.get("success"):
                        new_code = body.get("error", {}).get("code", "unknown")
                        raise RuntimeError(f"Synology API error (code {new_code})")
                else:
                    raise RuntimeError(f"Synology API error (code {error_code})")
            return body.get("data") or {}
        except httpx.HTTPStatusError as exc:
            logger.error("Synology HTTP error %s: %s", exc.response.status_code, exc.response.text)
            raise
        except Exception:
            raise

    async def _api_raw(self, params: dict[str, Any]) -> httpx.Response:
        """Make an authenticated call and return the raw httpx.Response (for binary downloads)."""
        sid = await self._ensure_sid()
        client = self._get_client()
        all_params = {**params, "_sid": sid}
        resp = await client.get("/webapi/entry.cgi", params=all_params)
        resp.raise_for_status()
        return resp

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        await self._logout()
        await self._close_client()
        self._summary_cache = None
        # Validate config by performing a test login
        await self._login()

    async def on_disable(self) -> None:
        await self._logout()
        await self._close_client()
        self._summary_cache = None

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            data = await self._api(
                {"api": "SYNO.DSM.Info", "version": "2", "method": "getinfo"}
            )
            model = data.get("model", "Unknown")
            version = data.get("version", "?")
            return {
                "status": "ok",
                "message": f"{model} — DSM {version}",
            }
        except Exception as exc:
            await self._close_client()
            return {"status": "error", "message": "Health check failed"}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()

    async def _fetch_summary(self) -> dict:
        try:
            import asyncio

            info_task = self._api(
                {"api": "SYNO.DSM.Info", "version": "2", "method": "getinfo"}
            )
            util_task = self._api(
                {"api": "SYNO.Core.System.Utilisation", "version": "1", "method": "get"}
            )
            storage_task = self._api(
                {
                    "api": "SYNO.Storage.CGI.Storage",
                    "version": "1",
                    "method": "load_info",
                    "offset": "0",
                    "limit": "50",
                }
            )

            results = await asyncio.gather(
                info_task, util_task, storage_task, return_exceptions=True
            )

            info_data: dict[str, Any] = results[0] if not isinstance(results[0], Exception) else {}  # type: ignore[assignment]
            util_data: dict[str, Any] = results[1] if not isinstance(results[1], Exception) else {}  # type: ignore[assignment]
            storage_data: dict[str, Any] = results[2] if not isinstance(results[2], Exception) else {}  # type: ignore[assignment]

            # CPU utilisation
            cpu = util_data.get("cpu", {})
            cpu_pct = int(cpu.get("user_load", 0)) + int(cpu.get("system_load", 0))

            # Memory utilisation
            mem = util_data.get("memory", {})
            mem_total = int(mem.get("real_total", 0))
            mem_avail = int(mem.get("avail_real", 0))
            mem_used = mem_total - mem_avail
            mem_pct = round(mem_used / mem_total * 100, 1) if mem_total else 0

            # Volume health
            volumes: list[dict[str, Any]] = storage_data.get("volumes", [])
            vol_count = len(volumes)
            degraded_count = sum(
                1 for v in volumes if v.get("status", "").lower() not in ("normal", "")
            )

            summary: dict[str, Any] = {
                "status": "ok",
                "model": info_data.get("model", "Unknown"),
                "dsm_version": info_data.get("version", ""),
                "serial": info_data.get("serial", ""),
                "cpu_pct": cpu_pct,
                "ram_used": mem_used,
                "ram_total": mem_total,
                "ram_pct": mem_pct,
                "volume_count": vol_count,
                "degraded_volumes": degraded_count,
            }
            self._summary_cache = summary
            return summary
        except Exception as exc:
            logger.error("Synology get_summary error: %s", exc)
            await self._close_client()
            return {"status": "error", "message": "Failed to fetch Synology summary"}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.synology.api import make_router

        return make_router(self)
