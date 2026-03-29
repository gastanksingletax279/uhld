from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.adguard.plugin import AdGuardPlugin

logger = logging.getLogger(__name__)


class ProtectionRequest(BaseModel):
    enabled: bool


def make_router(plugin: AdGuardPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/stats")
    async def get_stats():
        try:
            client = plugin._get_client()
            resp = await client.get("/control/stats")
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/status")
    async def get_status():
        try:
            client = plugin._get_client()
            resp = await client.get("/control/status")
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/querylog")
    async def get_querylog(limit: int = Query(default=100, ge=1, le=1000)):
        try:
            client = plugin._get_client()
            resp = await client.get(f"/control/querylog?limit={limit}")
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/protection")
    async def set_protection(body: ProtectionRequest):
        try:
            client = plugin._get_client()
            resp = await client.post(
                "/control/protection",
                json={"enabled": body.enabled},
            )
            resp.raise_for_status()
            # Invalidate summary cache so next widget refresh picks up new state
            plugin._summary_cache = None
            return {"message": f"Protection {'enabled' if body.enabled else 'disabled'}"}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
