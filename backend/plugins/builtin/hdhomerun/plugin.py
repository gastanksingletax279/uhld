from __future__ import annotations

import logging

from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class HDHomeRunPlugin(PluginBase):
    plugin_id = "hdhomerun"
    display_name = "HDHomeRun"
    description = "Monitor HDHomeRun network tuners — channel lineup, tuner signal strength, and channel scanning"
    version = "1.0.0"
    icon = "tv"
    category = "media"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "HDHomeRun IP/Hostname",
                "description": "IP address or hostname of your HDHomeRun device",
                "placeholder": "192.168.1.100",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 80,
                "description": "HTTP port of the HDHomeRun device (default: 80)",
            },
            "tuner_count": {
                "type": "integer",
                "title": "Tuner Count",
                "default": 2,
                "description": "Number of tuners (auto-detected if left at 0)",
                "minimum": 0,
                "maximum": 8,
            },
            "enable_streaming": {
                "type": "boolean",
                "title": "Enable Live Streaming",
                "default": False,
                "description": (
                    "Allow channels to be played directly in the dashboard. "
                    "Streams are transcoded server-side (MPEG-2 → H.264 + AAC) so browsers can play them. "
                    "⚠ CPU-intensive: each active stream uses one ffmpeg process encoding in real time. "
                    "Disable if your server has limited CPU headroom."
                ),
            },
            "mute_by_default": {
                "type": "boolean",
                "title": "Mute Streams by Default",
                "default": False,
                "description": "Start all streams muted. Unmute manually using the video player controls.",
            },
        },
        "required": ["host"],
    }

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.hdhomerun.api import make_router

        return make_router(self)

    async def health_check(self) -> dict:
        from backend.plugins.builtin.hdhomerun.api import fetch_discover

        try:
            host = self.get_config("host")
            port = int(self.get_config("port", 80))
            info = await fetch_discover(host, port)
            name = info.get("FriendlyName", "HDHomeRun")
            tuners = info.get("TunerCount", "?")
            return {"status": "ok", "message": f"{name} — {tuners} tuners"}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        from backend.plugins.builtin.hdhomerun.api import fetch_discover, fetch_lineup_status

        try:
            host = self.get_config("host")
            port = int(self.get_config("port", 80))
            info = await fetch_discover(host, port)
            status = await fetch_lineup_status(host, port)
            return {
                "status": "ok",
                "device_name": info.get("FriendlyName", "HDHomeRun"),
                "model": info.get("ModelNumber", ""),
                "tuner_count": info.get("TunerCount", 0),
                "firmware": info.get("FirmwareVersion", ""),
                "firmware_upgrade_available": bool(info.get("UpgradeAvailable", 0)),
                "scan_in_progress": status.get("ScanInProgress", 0) == 1,
                "source": status.get("Source", ""),
            }
        except Exception as exc:
            return {"status": "error", "message": str(exc)}
