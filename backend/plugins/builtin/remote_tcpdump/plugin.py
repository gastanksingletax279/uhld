from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter

from backend.plugins.base import PluginBase


class RemoteTcpdumpPlugin(PluginBase):
    plugin_id = "remote_tcpdump"
    display_name = "Remote Packet Capture"
    description = "Run tcpdump locally or over SSH and review capture output from the dashboard"
    version = "1.0.0"
    icon = "activity"
    category = "network"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {
            "ssh_host": {"type": "string", "title": "SSH Host"},
            "ssh_port": {"type": "integer", "title": "SSH Port", "default": 22},
            "ssh_user": {"type": "string", "title": "SSH User"},
            "ssh_key_content": {
                "type": "string",
                "title": "SSH Private Key (paste content)",
                "description": "Paste the private key directly. Takes priority over SSH Private Key Path.",
                "sensitive": True,
                "format": "textarea",
            },
            "ssh_key_path": {"type": "string", "title": "SSH Private Key Path"},
            "ssh_password": {
                "type": "string",
                "title": "SSH Password",
                "description": "Used when no key is provided. Requires sshpass to be installed.",
                "sensitive": True,
            },
        },
        "required": [],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._captures: list[dict] = []

    async def health_check(self) -> dict:
        return {"status": "ok", "message": "Packet capture plugin ready"}

    async def get_summary(self) -> dict:
        latest = self._captures[-1] if self._captures else None
        return {
            "status": "ok",
            "captures": len(self._captures),
            "last_capture": latest.get("created_at") if latest else None,
            "last_mode": latest.get("mode") if latest else None,
        }

    def push_capture(self, capture: dict) -> None:
        item = {
            "id": str(uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            **capture,
        }
        self._captures.append(item)
        self._captures = self._captures[-200:]

    def list_captures(self) -> list[dict]:
        return list(self._captures)

    def get_capture(self, capture_id: str) -> dict | None:
        for item in self._captures:
            if item.get("id") == capture_id:
                return item
        return None

    def delete_capture(self, capture_id: str) -> bool:
        before = len(self._captures)
        self._captures = [c for c in self._captures if c.get("id") != capture_id]
        return len(self._captures) < before

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.remote_tcpdump.api import make_router

        return make_router(self)
