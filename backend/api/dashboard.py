from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from backend.auth import get_current_user
from backend.models import User
from backend.plugins import registry

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(_: User = Depends(get_current_user)):
    """Aggregate get_summary() from all enabled plugin instances concurrently."""
    instances = registry.get_all_instances()
    if not instances:
        return {"plugins": []}

    async def _fetch(key: str, instance) -> dict:
        # key is "{plugin_id}:{instance_id}"
        plugin_id, instance_id = key.split(":", 1)
        try:
            summary = await instance.get_summary()
            summary["plugin_id"] = plugin_id
            summary["instance_id"] = instance_id
            return summary
        except Exception as exc:
            return {
                "plugin_id": plugin_id,
                "instance_id": instance_id,
                "status": "error",
                "message": str(exc),
            }

    results = await asyncio.gather(*[_fetch(k, inst) for k, inst in instances.items()])
    return {"plugins": list(results)}
