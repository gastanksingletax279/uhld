from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException

if TYPE_CHECKING:
    from backend.plugins.builtin.tailscale.plugin import TailscalePlugin

logger = logging.getLogger(__name__)


def make_router(plugin: TailscalePlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/devices")
    async def get_devices():
        try:
            devices = await plugin._fetch_devices()
            # Tailscale uses `connectedToControl` instead of `online` — normalize for frontend
            for d in devices:
                d["online"] = d.get("connectedToControl", False)
            return {"devices": devices}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
