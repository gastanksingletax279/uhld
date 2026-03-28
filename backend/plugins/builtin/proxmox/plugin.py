from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class ProxmoxPlugin(PluginBase):
    plugin_id = "proxmox"
    display_name = "Proxmox VE"
    description = "Monitor and manage Proxmox Virtual Environment nodes, VMs, and containers"
    version = "1.0.0"
    icon = "server"
    category = "virtualization"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "Proxmox Host",
                "description": "Hostname or IP of your Proxmox node or cluster",
                "placeholder": "192.168.1.100",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 8006,
            },
            "username": {
                "type": "string",
                "title": "Username",
                "description": "User in user@realm format, e.g. root@pam",
                "placeholder": "root@pam",
            },
            "token_name": {
                "type": "string",
                "title": "API Token Name",
                "description": "Token ID (the part after the ! in root@pam!tokenid). Leave blank to use password auth.",
                "placeholder": "uhld",
            },
            "token_value": {
                "type": "string",
                "title": "API Token Secret",
                "description": "The UUID secret shown once when the token was created",
                "format": "password",
                "sensitive": True,
            },
            "password": {
                "type": "string",
                "title": "Password",
                "description": "Required only if not using an API token",
                "format": "password",
                "sensitive": True,
            },
            "verify_ssl": {
                "type": "boolean",
                "title": "Verify SSL",
                "default": False,
                "description": "Disable for self-signed certs (most homelabs)",
            },
        },
        "required": ["host", "username"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client = None
        self._summary_cache: dict | None = None

    # ── Client management ─────────────────────────────────────────────────────

    def _make_client(self):
        try:
            from proxmoxer import ProxmoxAPI
        except ImportError:
            raise RuntimeError("proxmoxer is not installed — add it to requirements.txt")

        host = self._config["host"]
        port = int(self._config.get("port", 8006))
        user = self._config["username"]
        verify_ssl = bool(self._config.get("verify_ssl", False))

        token_name = self._config.get("token_name", "").strip()
        token_value = self._config.get("token_value", "").strip()

        if token_name and token_value:
            # DEBUG-TEMP: log auth params (no secrets)
            logger.info(
                "DEBUG-TEMP proxmox auth: TOKEN | host=%s port=%s user=%s token_name=%s "
                "token_value_len=%d verify_ssl=%s",
                host, port, user, token_name, len(token_value), verify_ssl,
            )
            return ProxmoxAPI(
                host,
                user=user,
                token_name=token_name,
                token_value=token_value,
                port=port,
                verify_ssl=verify_ssl,
            )

        password = self._config.get("password", "")
        if not password:
            raise RuntimeError(
                "Either (token_name + token_value) or password must be provided"
            )
        # DEBUG-TEMP: log auth params (no secrets)
        logger.info(
            "DEBUG-TEMP proxmox auth: PASSWORD | host=%s port=%s user=%s "
            "password_len=%d verify_ssl=%s",
            host, port, user, len(password), verify_ssl,
        )
        return ProxmoxAPI(
            host,
            user=user,
            password=password,
            port=port,
            verify_ssl=verify_ssl,
        )

    def _client_or_raise(self):
        if self._client is None:
            self._client = self._make_client()
        return self._client

    def _reset_client(self) -> None:
        self._client = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        self._reset_client()
        self._summary_cache = None

    async def on_disable(self) -> None:
        self._reset_client()
        self._summary_cache = None

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            client = self._client_or_raise()
            nodes = await asyncio.to_thread(client.nodes.get)
            online = sum(1 for n in nodes if n.get("status") == "online")
            return {
                "status": "ok",
                "message": f"{online}/{len(nodes)} node(s) online",
            }
        except Exception as exc:
            self._reset_client()
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()
        logger.debug("Proxmox summary cache refreshed")

    async def _fetch_summary(self) -> dict:
        # DEBUG-TEMP
        logger.info("DEBUG-TEMP proxmox _fetch_summary starting")
        try:
            client = self._client_or_raise()
            nodes = await asyncio.to_thread(client.nodes.get)
            logger.info("DEBUG-TEMP proxmox nodes response: %r", nodes)

            nodes_online = 0
            vms_total = 0
            vms_running = 0
            cpu_sum = 0.0
            mem_used = 0
            mem_total = 0

            for node in nodes:
                if node.get("status") != "online":
                    continue
                nodes_online += 1
                cpu_sum += float(node.get("cpu", 0.0))
                mem_used += int(node.get("mem", 0))
                mem_total += int(node.get("maxmem", 0))

                node_name = node["node"]
                for vm_type in ("qemu", "lxc"):
                    try:
                        vms = await asyncio.to_thread(
                            getattr(client.nodes(node_name), vm_type).get
                        )
                        vms_total += len(vms)
                        vms_running += sum(1 for v in vms if v.get("status") == "running")
                    except Exception as exc:
                        logger.warning("Proxmox: failed to list %s on %s: %s", vm_type, node_name, exc)

            return {
                "status": "ok",
                "nodes_online": nodes_online,
                "nodes_total": len(nodes),
                "vms_running": vms_running,
                "vms_total": vms_total,
                "cpu_pct": round(cpu_sum / max(nodes_online, 1) * 100, 1),
                "mem_used_gb": round(mem_used / 1024**3, 1),
                "mem_total_gb": round(mem_total / 1024**3, 1),
            }
        except Exception as exc:
            # DEBUG-TEMP
            logger.error(
                "DEBUG-TEMP proxmox _fetch_summary error | type=%s repr=%r",
                type(exc).__name__, exc,
            )
            self._reset_client()
            return {"status": "error", "message": str(exc)}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.proxmox.api import make_router
        return make_router(self)
