from __future__ import annotations

from fastapi import APIRouter

from backend.plugins.base import PluginBase


class PatchPanelPlugin(PluginBase):
    plugin_id = "patch_panel"
    display_name = "Patch Panel"
    description = "Track patch panel ports, linked devices, and switch mappings"
    version = "1.0.0"
    icon = "network"
    category = "network"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {
            "storage_key": {
                "type": "string",
                "title": "Storage Key",
                "default": "default",
                "description": "Use different keys per instance if needed.",
            }
        },
        "required": [],
    }

    async def health_check(self) -> dict:
        return {"status": "ok", "message": "Patch panel mapping ready"}

    async def get_summary(self) -> dict:
        return {"status": "ok", "message": "Open plugin view for mapping counts"}

    def storage_key(self) -> str:
        raw = str(self.get_config("storage_key", "default")).strip() or "default"
        return f"patch_panel:{raw}:links"

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.patch_panel.api import make_router

        return make_router(self)
