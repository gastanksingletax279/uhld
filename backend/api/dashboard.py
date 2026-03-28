from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from backend.auth import get_current_user
from backend.models import User
from backend.plugins import registry

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(_: User = Depends(get_current_user)):
    """Aggregate get_summary() from all enabled plugins concurrently."""
    instances = registry.get_all_instances()
    if not instances:
        return {"plugins": []}

    async def _fetch(plugin_id: str, instance) -> dict:
        try:
            summary = await instance.get_summary()
            summary["plugin_id"] = plugin_id
            return summary
        except Exception as exc:
            return {"plugin_id": plugin_id, "status": "error", "message": str(exc)}

    results = await asyncio.gather(*[_fetch(pid, inst) for pid, inst in instances.items()])
    return {"plugins": list(results)}
