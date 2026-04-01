from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase


class NginxProxyManagerPlugin(PluginBase):
    plugin_id = "nginx_proxy_manager"
    display_name = "Nginx Proxy Manager"
    description = "Manage proxy hosts and certificates from Nginx Proxy Manager"
    version = "1.0.0"
    icon = "shield-check"
    category = "network"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {
            "base_url": {"type": "string", "title": "NPM Base URL"},
            "api_token": {
                "type": "string",
                "title": "API Token",
                "format": "password",
                "sensitive": True,
            },
            "username": {"type": "string", "title": "Username (optional)"},
            "password": {
                "type": "string",
                "title": "Password (optional)",
                "format": "password",
                "sensitive": True,
            },
        },
        "required": ["base_url"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._cached_token: str | None = None

    async def health_check(self) -> dict:
        if not str(self.get_config("base_url", "")).strip():
            return {"status": "error", "message": "Missing base_url"}
        return {"status": "ok", "message": "NPM plugin configured"}

    async def get_summary(self) -> dict:
        try:
            hosts = await self.fetch_proxy_hosts()
            certs = await self.fetch_certificates()
            return {
                "status": "ok",
                "proxy_hosts": len(hosts),
                "certificates": len(certs),
            }
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def _get_token(self) -> str | None:
        token = str(self.get_config("api_token", "")).strip()
        if token:
            return token
        if self._cached_token:
            return self._cached_token

        base_url = str(self.get_config("base_url", "")).rstrip("/")
        username = str(self.get_config("username", "")).strip()
        password = str(self.get_config("password", "")).strip()
        if not username or not password:
            return None

        async with httpx.AsyncClient(timeout=20, verify=False) as client:
            resp = await client.post(
                f"{base_url}/api/tokens",
                json={"identity": username, "secret": password},
            )
            if resp.status_code >= 400:
                resp = await client.post(
                    f"{base_url}/api/tokens",
                    json={"username": username, "password": password},
                )
        if resp.status_code >= 400:
            raise RuntimeError(f"Failed to authenticate to Nginx Proxy Manager: {resp.text[:500]}")

        data = resp.json()
        self._cached_token = data.get("token")
        return self._cached_token

    async def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        base_url = str(self.get_config("base_url", "")).rstrip("/")
        if not base_url:
            raise RuntimeError("Missing base_url")

        token = await self._get_token()
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.request(method, f"{base_url}/api{path}", headers=headers, json=payload)
            if resp.status_code == 401 and self._cached_token:
                # Refresh token once.
                self._cached_token = None
                token = await self._get_token()
                headers = {"Authorization": f"Bearer {token}"} if token else {}
                resp = await client.request(method, f"{base_url}/api{path}", headers=headers, json=payload)

        if resp.status_code >= 400:
            raise RuntimeError(resp.text[:1200])

        if resp.status_code == 204:
            return None
        return resp.json()

    async def fetch_proxy_hosts(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/nginx/proxy-hosts")
        return data if isinstance(data, list) else []

    async def fetch_certificates(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/nginx/certificates")
        return data if isinstance(data, list) else []

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.nginx_proxy_manager.api import make_router

        return make_router(self)
