from __future__ import annotations

import logging
from datetime import UTC, datetime

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


# ── Pydantic models ────────────────────────────────────────────────────────────

class PluginListItem(BaseModel):
    plugin_id: str
    instance_id: str
    instance_label: str | None
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
    instance_id: str = "default"
    instance_label: str | None = None


class UpdateConfigRequest(BaseModel):
    config: dict


class CreateInstanceRequest(BaseModel):
    instance_id: str
    instance_label: str | None = None
    config: dict = {}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_list_item(
    plugin_id: str,
    cls: type,
    cfg: PluginConfig | None,
    instance_id: str = "default",
) -> PluginListItem:
    return PluginListItem(
        plugin_id=plugin_id,
        instance_id=instance_id,
        instance_label=cfg.instance_label if cfg else None,
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


# ── List / get ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[PluginListItem])
async def list_plugins(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all known plugins and ALL their instances."""
    result = await db.execute(select(PluginConfig))
    db_configs = result.scalars().all()

    # Build map: (plugin_id, instance_id) -> PluginConfig
    cfg_map: dict[tuple[str, str], PluginConfig] = {
        (r.plugin_id, r.instance_id): r for r in db_configs
    }
    # Track which plugin_ids have at least one DB entry
    seen_plugin_ids: set[str] = {r.plugin_id for r in db_configs}

    items: list[PluginListItem] = []
    for plugin_id, cls in registry.get_all_plugin_classes().items():
        if plugin_id in seen_plugin_ids:
            # Emit one entry per stored instance
            for cfg in db_configs:
                if cfg.plugin_id == plugin_id:
                    items.append(_make_list_item(plugin_id, cls, cfg, cfg.instance_id))
        else:
            # Plugin has never been configured: show once with defaults
            items.append(_make_list_item(plugin_id, cls, None, "default"))

    return items


@router.get("/{plugin_id}", response_model=PluginDetail)
async def get_plugin(
    plugin_id: str,
    instance_id: str = "default",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cls = registry.get_all_plugin_classes().get(plugin_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Plugin not found")

    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
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
        instance_id=instance_id,
        instance_label=cfg.instance_label if cfg else None,
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


# ── Enable / disable / config (default instance — backward compat) ─────────────

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
        await registry.enable_plugin(
            plugin_id, body.instance_id, body.instance_label, body.config, db, request.app
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Plugin {plugin_id}:{body.instance_id} enabled"}


@router.post("/{plugin_id}/disable", status_code=status.HTTP_200_OK)
async def disable_plugin(
    plugin_id: str,
    instance_id: str = "default",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    await registry.disable_plugin(plugin_id, instance_id, db)
    return {"message": f"Plugin {plugin_id}:{instance_id} disabled"}


@router.put("/{plugin_id}/config", status_code=status.HTTP_200_OK)
async def update_config(
    plugin_id: str,
    body: UpdateConfigRequest,
    request: Request,
    instance_id: str = "default",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    try:
        await registry.update_plugin_config(plugin_id, instance_id, body.config, db, request.app)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Plugin {plugin_id}:{instance_id} config updated"}


@router.post("/{plugin_id}/clear", status_code=status.HTTP_200_OK)
async def clear_plugin(
    plugin_id: str,
    instance_id: str = "default",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Disable plugin instance and wipe its stored configuration."""
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    await registry.disable_plugin(plugin_id, instance_id, db)
    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.config_json = None
        await db.commit()
    return {"message": f"Plugin {plugin_id}:{instance_id} cleared"}


@router.get("/{plugin_id}/health")
async def plugin_health(
    plugin_id: str,
    instance_id: str = "default",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    instance = registry.get_plugin_instance(plugin_id, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="Plugin instance not enabled")
    try:
        result = await instance.health_check()
    except Exception as exc:
        logger.error("Health check failed for %s:%s: %s", plugin_id, instance_id, exc)
        result = {"status": "error", "message": "Health check failed"}

    db_result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
    cfg = db_result.scalar_one_or_none()
    if cfg:
        cfg.last_health_check = datetime.now(UTC)
        cfg.health_status = result.get("status", "error")
        cfg.health_message = result.get("message", "")
        await db.commit()

    return result


# ── Multi-instance management ──────────────────────────────────────────────────

@router.get("/{plugin_id}/instances")
async def list_instances(
    plugin_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all instances (enabled or not) for a plugin."""
    cls = registry.get_all_plugin_classes().get(plugin_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Plugin not found")

    result = await db.execute(select(PluginConfig).where(PluginConfig.plugin_id == plugin_id))
    cfgs = result.scalars().all()

    if not cfgs:
        # Return a default placeholder so the UI always has something to show
        return [_make_list_item(plugin_id, cls, None, "default")]

    return [_make_list_item(plugin_id, cls, cfg, cfg.instance_id) for cfg in cfgs]


@router.post("/{plugin_id}/instances", status_code=status.HTTP_201_CREATED)
async def create_instance(
    plugin_id: str,
    body: CreateInstanceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Create and enable a new instance of a plugin."""
    cls = registry.get_all_plugin_classes().get(plugin_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    # Check not already exists
    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == body.instance_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Instance '{body.instance_id}' already exists")
    try:
        await registry.enable_plugin(
            plugin_id, body.instance_id, body.instance_label, body.config, db, request.app
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Instance {plugin_id}:{body.instance_id} created"}


@router.delete("/{plugin_id}/instances/{instance_id}", status_code=status.HTTP_200_OK)
async def delete_instance(
    plugin_id: str,
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Delete a non-default plugin instance."""
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    try:
        await registry.delete_instance(plugin_id, instance_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Instance {plugin_id}:{instance_id} deleted"}


@router.put("/{plugin_id}/instances/{instance_id}/config")
async def update_instance_config(
    plugin_id: str,
    instance_id: str,
    body: UpdateConfigRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if registry.get_all_plugin_classes().get(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin not found")
    try:
        await registry.update_plugin_config(plugin_id, instance_id, body.config, db, request.app)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": f"Instance {plugin_id}:{instance_id} config updated"}


@router.get("/{plugin_id}/instances/{instance_id}/health")
async def instance_health(
    plugin_id: str,
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await plugin_health(plugin_id, instance_id, db, _)
