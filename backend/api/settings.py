from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, require_admin
from backend.database import get_db
from backend.models import Setting, User

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingItem(BaseModel):
    key: str
    value: str | None


@router.get("/", response_model=list[SettingItem])
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Setting))
    return [SettingItem(key=s.key, value=s.value) for s in result.scalars().all()]


@router.put("/")
async def update_settings(
    items: list[SettingItem],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    for item in items:
        result = await db.execute(select(Setting).where(Setting.key == item.key))
        setting = result.scalar_one_or_none()
        if setting is None:
            db.add(Setting(key=item.key, value=item.value))
        else:
            setting.value = item.value
    await db.commit()
    return {"message": "Settings updated"}
