from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.pihole.plugin import PiHolePlugin

logger = logging.getLogger(__name__)


class BlockingRequest(BaseModel):
    enabled: bool


def make_router(plugin: PiHolePlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/stats")
    async def get_stats():
        try:
            return await plugin._fetch_summary()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/querylog")
    async def get_querylog(limit: int = Query(default=100, ge=1, le=1000)):
        try:
            if plugin._is_v6():
                entries = await plugin.fetch_querylog_v6(limit)
            else:
                entries = await plugin.fetch_querylog_v5(limit)
            return {"data": entries}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/blocking")
    async def set_blocking(body: BlockingRequest):
        try:
            if plugin._is_v6():
                await plugin.set_blocking_v6(body.enabled)
            else:
                await plugin.set_blocking_v5(body.enabled)
            plugin._summary_cache = None
            return {"message": f"Blocking {'enabled' if body.enabled else 'disabled'}"}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
