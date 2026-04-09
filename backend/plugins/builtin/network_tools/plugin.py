from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

from backend.plugins.base import PluginBase


class NetworkToolsPlugin(PluginBase):
    plugin_id = "network_tools"
    display_name = "Network Tools"
    description = "Run troubleshooting commands like ping, traceroute, DNS lookup, whois, and speed tests"
    version = "1.0.0"
    icon = "radar"
    category = "network"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {
            "default_ping_count": {"type": "integer", "title": "Default Ping Count", "default": 4},
            "default_timeout_seconds": {
                "type": "integer",
                "title": "Default Command Timeout (seconds)",
                "default": 15,
            },
        },
        "required": [],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._speedtest_history: list[dict] = []

    async def health_check(self) -> dict:
        return {"status": "ok", "message": "Network tools ready"}

    async def get_summary(self) -> dict:
        latest = self._speedtest_history[-1] if self._speedtest_history else None
        return {
            "status": "ok",
            "tools": ["ping", "traceroute", "dns", "whois", "speedtest"],
            "speedtests": len(self._speedtest_history),
            "last_run": latest.get("timestamp") if latest else None,
        }

    def add_speedtest_result(self, result: dict) -> None:
        # speedtest-cli --json returns download/upload in bits per second, ping in ms
        download_bps = result.get("download", 0)
        upload_bps = result.get("upload", 0)

        item = {
            "timestamp": datetime.now(UTC).isoformat(),
            "download": round(download_bps / 1_000_000, 2),   # bits/sec → Mbps
            "upload":   round(upload_bps   / 1_000_000, 2),   # bits/sec → Mbps
            "ping": result.get("ping", 0),
            "server": result.get("server", {}),
            "client": result.get("client", {}),
        }
        self._speedtest_history.append(item)
        # Keep bounded in memory.
        self._speedtest_history = self._speedtest_history[-200:]

    def get_speedtest_history(self) -> list[dict]:
        return list(self._speedtest_history)

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.network_tools.api import make_router

        return make_router(self)
