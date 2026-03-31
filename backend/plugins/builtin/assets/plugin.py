from __future__ import annotations

import logging

from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class AssetsPlugin(PluginBase):
    plugin_id = "assets"
    display_name = "Asset Inventory"
    description = "Lightweight inventory of homelab hardware — servers, switches, desktops, and more"
    version = "1.0.0"
    icon = "server"
    category = "infrastructure"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    async def health_check(self) -> dict:
        return {"status": "ok", "message": "Asset inventory ready"}

    async def get_summary(self) -> dict:
        try:
            from sqlalchemy import func, select

            from backend.database import AsyncSessionLocal
            from backend.models import Asset

            async with AsyncSessionLocal() as db:
                total = await db.scalar(select(func.count()).select_from(Asset)) or 0
                result = await db.execute(
                    select(Asset.asset_type, func.count(Asset.id)).group_by(Asset.asset_type)
                )
                by_type = {row[0]: row[1] for row in result.fetchall()}

            return {"status": "ok", "total": total, "by_type": by_type}
        except Exception as exc:
            logger.error("Assets get_summary error: %s", exc)
            return {"status": "error", "message": str(exc)}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.assets.api import make_router

        return make_router(self)
