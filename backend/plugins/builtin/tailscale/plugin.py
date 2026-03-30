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

    # ── Data fetchers ─────────────────────────────────────────────────────────

    async def _fetch_devices(self) -> list[dict]:
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.get(f"/api/v2/tailnet/{tailnet}/devices?fields=all")
        resp.raise_for_status()
        return resp.json().get("devices", [])

    async def _fetch_users(self) -> list[dict]:
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.get(f"/api/v2/tailnet/{tailnet}/users")
        resp.raise_for_status()
        return resp.json().get("users", [])

    async def _fetch_dns(self) -> dict:
        """Fetch DNS config via the unified /dns/configuration endpoint."""
        client = self._get_client()
        tailnet = self._tailnet()
        cfg_resp, dev_resp = await _gather(
            client.get(f"/api/v2/tailnet/{tailnet}/dns/configuration"),
            client.get(f"/api/v2/tailnet/{tailnet}/devices"),
        )
        cfg_resp.raise_for_status()
        cfg = cfg_resp.json()

        # Nameservers are resolver objects {address, useWithExitNode}
        ns_objects = cfg.get("nameservers") or []
        nameservers = [
            r["address"] for r in ns_objects if isinstance(r, dict) and r.get("address")
        ]

        prefs = cfg.get("preferences") or {}

        # Split DNS: domain → list of resolver addresses
        raw_split = cfg.get("splitDNS") or {}
        split_dns = {
            domain: [r["address"] for r in (resolvers or []) if isinstance(r, dict) and r.get("address")]
            for domain, resolvers in raw_split.items()
        }

        # Extract tailnet domain from first device FQDN
        tailnet_domain: str | None = None
        try:
            devices = dev_resp.json().get("devices", [])
            if devices:
                name = devices[0].get("name", "")
                parts = name.split(".", 1)
                if len(parts) == 2:
                    tailnet_domain = parts[1].rstrip(".")
        except Exception:
            pass

        return {
            "nameservers": nameservers,
            "searchPaths": cfg.get("searchPaths") or [],
            "magicDNS": prefs.get("magicDNS", False),
            "overrideLocalDNS": prefs.get("overrideLocalDNS", False),
            "splitDns": split_dns,
            "tailnetDomain": tailnet_domain,
        }

    async def _fetch_acl(self) -> str:
        """Return raw ACL as HuJSON text."""
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.get(
            f"/api/v2/tailnet/{tailnet}/acl",
            headers={"Accept": "application/hujson"},
        )
        resp.raise_for_status()
        return resp.text

    async def _save_acl(self, acl_text: str) -> dict:
        """POST updated ACL. acl_text may be HuJSON or strict JSON."""
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.post(
            f"/api/v2/tailnet/{tailnet}/acl",
            content=acl_text.encode(),
            headers={"Content-Type": "application/hujson"},
        )
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = resp.text or f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "ACL saved"}

    async def _validate_acl(self, acl_text: str) -> dict:
        """Validate ACL against Tailscale without saving. Returns {valid, message}."""
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.post(
            f"/api/v2/tailnet/{tailnet}/acl/validate",
            content=acl_text.encode(),
            headers={"Content-Type": "application/hujson"},
        )
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        try:
            data = resp.json()
        except Exception:
            data = {}
        if data.get("message"):
            return {"valid": False, "message": data["message"], "data": data.get("data", [])}
        return {"valid": True, "message": "ACL is valid"}

    async def _fetch_keys(self) -> list[dict]:
        """List all auth keys and API tokens for the tailnet."""
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.get(f"/api/v2/tailnet/{tailnet}/keys")
        resp.raise_for_status()
        return resp.json().get("keys", [])

    async def _fetch_tailnet_settings(self) -> dict:
        """Get tailnet-level settings."""
        client = self._get_client()
        tailnet = self._tailnet()
        resp = await client.get(f"/api/v2/tailnet/{tailnet}/settings")
        resp.raise_for_status()
        return resp.json()

    async def _rename_device(self, device_id: str, name: str) -> dict:
        client = self._get_client()
        resp = await client.post(f"/api/v2/device/{device_id}/name", json={"name": name})
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "Device renamed"}

    async def _set_device_ip(self, device_id: str, ipv4: str) -> dict:
        client = self._get_client()
        resp = await client.post(f"/api/v2/device/{device_id}/ip", json={"ipv4": ipv4})
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "IP updated"}

    async def _set_key_expiry_disabled(self, device_id: str, disabled: bool) -> dict:
        client = self._get_client()
        resp = await client.post(
            f"/api/v2/device/{device_id}/key",
            json={"keyExpiryDisabled": disabled},
        )
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "Key expiry updated"}

    async def _get_device_routes(self, device_id: str) -> dict:
        client = self._get_client()
        resp = await client.get(f"/api/v2/device/{device_id}/routes")
        resp.raise_for_status()
        return resp.json()

    async def _set_device_routes(self, device_id: str, routes: list[str]) -> dict:
        client = self._get_client()
        resp = await client.post(
            f"/api/v2/device/{device_id}/routes",
            json={"routes": routes},
        )
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return resp.json()

    async def _set_device_tags(self, device_id: str, tags: list[str]) -> dict:
        client = self._get_client()
        resp = await client.post(
            f"/api/v2/device/{device_id}/tags",
            json={"tags": tags},
        )
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "Tags updated"}

    async def _delete_device(self, device_id: str) -> dict:
        client = self._get_client()
        resp = await client.delete(f"/api/v2/device/{device_id}")
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "Device deleted"}

    async def _expire_device_key(self, device_id: str) -> dict:
        client = self._get_client()
        resp = await client.post(f"/api/v2/device/{device_id}/expire")
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "Device key expired"}

    async def _authorize_device(self, device_id: str) -> dict:
        client = self._get_client()
        resp = await client.post(
            f"/api/v2/device/{device_id}/authorized",
            json={"authorized": True},
        )
        if not resp.is_success:
            try:
                msg = resp.json().get("message") or resp.text
            except Exception:
                msg = f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": "Device authorized"}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.tailscale.api import make_router
        return make_router(self)


async def _gather(*coros):
    """Run coroutines concurrently (asyncio.gather without importing at module level)."""
    import asyncio
    return await asyncio.gather(*coros)
