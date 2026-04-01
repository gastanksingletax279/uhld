from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, require_admin
from backend.database import get_db
from backend.models import Setting, User


class LinkCreate(BaseModel):
    panel: str = Field(min_length=1, max_length=120)
    panel_port: str = Field(min_length=1, max_length=64)
    device: str = Field(min_length=1, max_length=120)
    device_port: str = Field(min_length=1, max_length=64)
    notes: str | None = None


class LinkUpdate(BaseModel):
    panel: str | None = None
    panel_port: str | None = None
    device: str | None = None
    device_port: str | None = None
    notes: str | None = None


async def _load_links(db: AsyncSession, key: str) -> list[dict]:
    row = await db.scalar(select(Setting).where(Setting.key == key))
    if not row or not row.value:
        return []
    try:
        value = json.loads(row.value)
        return value if isinstance(value, list) else []
    except json.JSONDecodeError:
        return []


async def _save_links(db: AsyncSession, key: str, links: list[dict]) -> None:
    row = await db.scalar(select(Setting).where(Setting.key == key))
    payload = json.dumps(links)
    if row is None:
        row = Setting(key=key, value=payload)
        db.add(row)
    else:
        row.value = payload
    await db.commit()


def _new_id(links: list[dict]) -> int:
    if not links:
        return 1
    return max(int(i.get("id", 0)) for i in links) + 1


def make_router(plugin) -> APIRouter:
    router = APIRouter()

    @router.get("/links")
    async def list_links(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
        links = await _load_links(db, plugin.storage_key())
        return {"items": links}

    @router.post("/links")
    async def create_link(
        body: LinkCreate,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_admin),
    ):
        links = await _load_links(db, plugin.storage_key())
        now = datetime.now(UTC).isoformat()
        item = {
            "id": _new_id(links),
            **body.model_dump(),
            "created_at": now,
            "updated_at": now,
        }
        links.append(item)
        await _save_links(db, plugin.storage_key(), links)
        return {"item": item}

    @router.put("/links/{link_id}")
    async def update_link(
        link_id: int,
        body: LinkUpdate,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_admin),
    ):
        links = await _load_links(db, plugin.storage_key())
        idx = next((i for i, it in enumerate(links) if int(it.get("id", 0)) == link_id), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="Link not found")
        patch = {k: v for k, v in body.model_dump().items() if v is not None}
        links[idx] = {
            **links[idx],
            **patch,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        await _save_links(db, plugin.storage_key(), links)
        return {"item": links[idx]}

    @router.delete("/links/{link_id}")
    async def delete_link(
        link_id: int,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_admin),
    ):
        links = await _load_links(db, plugin.storage_key())
        next_links = [it for it in links if int(it.get("id", 0)) != link_id]
        if len(next_links) == len(links):
            raise HTTPException(status_code=404, detail="Link not found")
        await _save_links(db, plugin.storage_key(), next_links)
        return {"message": "Deleted"}

    @router.get("/summary")
    async def summary(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
        links = await _load_links(db, plugin.storage_key())
        panel_count = len({str(it.get("panel", "")) for it in links if it.get("panel")})
        device_count = len({str(it.get("device", "")) for it in links if it.get("device")})
        return {"total_links": len(links), "panels": panel_count, "devices": device_count}

    return router
