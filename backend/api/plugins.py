from __future__ import annotations

import logging
from datetime import datetime, UTC

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, require_admin
from backend.database import get_db
from backend.encryption import decrypt_config, mask_sensitive
from backend.models import PluginConfig, User
from backend.plugins import registry

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


class PluginListItem(BaseModel):
    plugin_id: str
    display_name: str
    description: str
    version: str
    icon: str
    category: str
    enabled: bool
    health_status: str | None
    health_message: str | None
    poll_interval: int


class PluginDetail(PluginListItem):
    config_schema: dict
    config: dict | None  # masked


class EnableRequest(BaseModel):
    config: dict = {}


class UpdateConfigRequest(BaseModel):
    config: dict


@router.get("/", response_model=list[PluginListItem])
async def list_plugins(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all known plugins with their enabled state and health."""
    result = await db.execute(select(PluginConfig))
    db_configs: dict[str, PluginConfig] = {r.plugin_id: r for r in result.scalars().all()}

    items = []
    for plugin_id, cls in registry.get_all_plugin_classes().items():
        cfg = db_configs.get(plugin_id)
        items.append(
            PluginListItem(
                plugin_id=plugin_id,
                display_name=cls.display_name,
                description=cls.description,
                version=cls.version,
                icon=cls.icon,
                category=cls.category,
                enabled=cfg.enabled if cfg else False,
                health_status=cfg.health_status if cfg else None,
                health_message=cfg.health_message if cfg else None,
                poll_interval=cls.poll_interval,
            )
        )
    return items


@router.get("/{plugin_id}", response_model=PluginDetail)
async def get_plugin(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cls = registry.get_all_plugin_classes().get(plugin_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Plugin not found")

    result = await db.execute(select(PluginConfig).where(PluginConfig.plugin_id == plugin_id))
    cfg = result.scalar_one_or_none()

    masked_config: dict | None = None
    if cfg and cfg.config_json:
        try:
            raw = decrypt_config(cfg.config_json)
            masked_config = mask_sensitive(raw, cls.config_schema)
        except Exception:
            masked_config = None

    return PluginDetail(
        plugin_id=plugin_id,
        display_name=cls.display_name,
        description=cls.description,
        version=cls.version,
        icon=cls.icon,
        category=cls.category,
        enabled=cfg.enabled if cfg else False,
        health_status=cfg.health_status if cfg else None,
        health_message=cfg.health_message if cfg else None,
        poll_interval=cls.poll_interval,
        config_schema=cls.config_schema,
        config=masked_config,
    )


@router.post("/{plugin_id}/enable", status_code=status.HTTP_200_OK)
async def enable_plugin(
    plugin_id: str,
    body: EnableRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cls = registry.get_all_plugin_classes().get(plugin_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    try:
        await registry.enable_plugin(plugin_id, body.config, db, request.app)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Plugin {plugin_id} enabled"}


@router.post("/{plugin_id}/disable", status_code=status.HTTP_200_OK)
async def disable_plugin(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    await registry.disable_plugin(plugin_id, db)
    return {"message": f"Plugin {plugin_id} disabled"}


@router.put("/{plugin_id}/config", status_code=status.HTTP_200_OK)
async def update_config(
    plugin_id: str,
    body: UpdateConfigRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    try:
        await registry.update_plugin_config(plugin_id, body.config, db, request.app)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Plugin {plugin_id} config updated"}


@router.post("/{plugin_id}/clear", status_code=status.HTTP_200_OK)
async def clear_plugin(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Disable plugin and wipe its stored configuration."""
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    await registry.disable_plugin(plugin_id, db)
    result = await db.execute(select(PluginConfig).where(PluginConfig.plugin_id == plugin_id))
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.config_json = None
        await db.commit()
    return {"message": f"Plugin {plugin_id} cleared"}


@router.get("/{plugin_id}/health")
async def plugin_health(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    instance = registry.get_plugin_instance(plugin_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="Plugin not enabled")
    try:
        result = await instance.health_check()
    except Exception as exc:
        logger.error("Health check failed for %s: %s", plugin_id, exc)
        result = {"status": "error", "message": "Health check failed"}

    # Persist health check result
    db_result = await db.execute(select(PluginConfig).where(PluginConfig.plugin_id == plugin_id))
    cfg = db_result.scalar_one_or_none()
    if cfg:
        cfg.last_health_check = datetime.now(UTC)
        cfg.health_status = result.get("status", "error")
        cfg.health_message = result.get("message", "")
        await db.commit()

    return result
