from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.database import get_db
from backend.models import Asset
from backend.plugins.builtin.assets.schema import AssetCreate, AssetOut, AssetUpdate


def make_router(plugin) -> APIRouter:  # noqa: ARG001
    router = APIRouter()

    @router.get("/assets")
    async def list_assets(
        db: AsyncSession = Depends(get_db),
        _=Depends(get_current_user),
    ):
        result = await db.execute(select(Asset).order_by(Asset.name))
        assets = result.scalars().all()
        return {"assets": [AssetOut.model_validate(a) for a in assets]}

    @router.post("/assets", status_code=201)
    async def create_asset(
        body: AssetCreate,
        db: AsyncSession = Depends(get_db),
        _=Depends(get_current_user),
    ):
        asset = Asset(**body.model_dump())
        db.add(asset)
        await db.commit()
        await db.refresh(asset)
        return AssetOut.model_validate(asset)

    @router.put("/assets/{asset_id}")
    async def update_asset(
        asset_id: int,
        body: AssetUpdate,
        db: AsyncSession = Depends(get_db),
        _=Depends(get_current_user),
    ):
        asset = await db.get(Asset, asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")
        for k, v in body.model_dump().items():
            setattr(asset, k, v)
        await db.commit()
        await db.refresh(asset)
        return AssetOut.model_validate(asset)

    @router.delete("/assets/{asset_id}", status_code=204)
    async def delete_asset(
        asset_id: int,
        db: AsyncSession = Depends(get_db),
        _=Depends(get_current_user),
    ):
        asset = await db.get(Asset, asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")
        await db.delete(asset)
        await db.commit()

    @router.get("/assets/summary")
    async def assets_summary(
        db: AsyncSession = Depends(get_db),
        _=Depends(get_current_user),
    ):
        total = await db.scalar(select(func.count()).select_from(Asset)) or 0
        result = await db.execute(
            select(Asset.asset_type, func.count(Asset.id)).group_by(Asset.asset_type)
        )
        by_type = {row[0]: row[1] for row in result.fetchall()}
        return {"total": total, "by_type": by_type}

    return router
