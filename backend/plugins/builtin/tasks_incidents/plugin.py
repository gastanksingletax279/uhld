from __future__ import annotations

from fastapi import APIRouter

from backend.plugins.base import PluginBase


class TasksIncidentsPlugin(PluginBase):
    plugin_id = "tasks_incidents"
    display_name = "Tasks and Incidents"
    description = "Track infrastructure tasks, incidents, and requests in a simple built-in queue"
    version = "1.0.0"
    icon = "list-todo"
    category = "automation"
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
        return {"status": "ok", "message": "Tasks and incidents ready"}

    async def get_summary(self) -> dict:
        return {"status": "ok", "message": "Open plugin view for queue metrics"}

    def storage_key(self) -> str:
        raw = str(self.get_config("storage_key", "default")).strip() or "default"
        return f"tasks_incidents:{raw}:items"

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.tasks_incidents.api import make_router

        return make_router(self)
