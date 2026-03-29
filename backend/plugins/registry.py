from __future__ import annotations

import importlib
import logging
import pkgutil
from typing import TYPE_CHECKING

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.encryption import decrypt_config, encrypt_config
from backend.models import PluginConfig
from backend.plugins.base import PluginBase
from backend.scheduler import add_plugin_job, remove_plugin_job

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Maps plugin_id -> PluginBase subclass (shared across all instances)
_plugin_classes: dict[str, type[PluginBase]] = {}
# Maps "{plugin_id}:{instance_id}" -> live PluginBase instance (only enabled)
_plugin_instances: dict[str, PluginBase] = {}

_RESERVED_INSTANCE_IDS = {"enable", "disable", "config", "health", "clear", "instances"}


def _instance_key(plugin_id: str, instance_id: str) -> str:
    return f"{plugin_id}:{instance_id}"


def discover_plugins() -> None:
    """Auto-discover all plugin classes under backend.plugins.builtin.*"""
    import backend.plugins.builtin as builtin_pkg

    for finder, name, is_pkg in pkgutil.iter_modules(builtin_pkg.__path__):
        if not is_pkg:
            continue
        try:
            module = importlib.import_module(f"backend.plugins.builtin.{name}.plugin")
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, PluginBase)
                    and attr is not PluginBase
                    and attr.plugin_id
                ):
                    _plugin_classes[attr.plugin_id] = attr
                    logger.info("Discovered plugin: %s (%s)", attr.plugin_id, attr.display_name)
        except Exception:
            logger.exception("Failed to discover plugin in package: %s", name)


def get_all_plugin_classes() -> dict[str, type[PluginBase]]:
    return _plugin_classes


def get_plugin_instance(plugin_id: str, instance_id: str = "default") -> PluginBase | None:
    return _plugin_instances.get(_instance_key(plugin_id, instance_id))


def get_all_instances() -> dict[str, PluginBase]:
    return _plugin_instances


async def load_enabled_plugins(db: AsyncSession, app: FastAPI) -> None:
    """On startup: instantiate all enabled plugins and mount their routers."""
    result = await db.execute(select(PluginConfig).where(PluginConfig.enabled == True))  # noqa: E712
    configs = result.scalars().all()
    for cfg in configs:
        await _enable_plugin(cfg.plugin_id, cfg.instance_id, cfg.instance_label, cfg.config_json, app)


async def _enable_plugin(
    plugin_id: str,
    instance_id: str,
    instance_label: str | None,
    encrypted_config: str | None,
    app: FastAPI,
) -> None:
    cls = _plugin_classes.get(plugin_id)
    if cls is None:
        logger.warning("Plugin class not found for id: %s", plugin_id)
        return
    key = _instance_key(plugin_id, instance_id)
    try:
        config = decrypt_config(encrypted_config) if encrypted_config else {}
        instance = cls(config)
        await instance.on_enable(config)
        _plugin_instances[key] = instance

        # Mount plugin router
        router = instance.get_router()
        # Default instance: mount at /api/plugins/{plugin_id} (backward compat)
        # Additional instances: mount at /api/plugins/{plugin_id}/{instance_id}
        if instance_id == "default":
            prefix = f"/api/plugins/{plugin_id}"
        else:
            prefix = f"/api/plugins/{plugin_id}/{instance_id}"
        app.include_router(router, prefix=prefix, tags=[plugin_id])
        logger.info("Mounted plugin router: %s (%s)", prefix, instance_label or instance_id)

        # Schedule polling job if plugin defines one
        job_id = key  # unique job per instance
        if cls.poll_interval > 0:
            add_plugin_job(job_id, instance.scheduled_poll, cls.poll_interval)
    except Exception:
        logger.exception("Failed to enable plugin: %s:%s", plugin_id, instance_id)


async def enable_plugin(
    plugin_id: str,
    instance_id: str,
    instance_label: str | None,
    config: dict,
    db: AsyncSession,
    app: FastAPI,
) -> None:
    """Enable (or re-enable) a plugin instance: persist config, instantiate, mount router."""
    if instance_id in _RESERVED_INSTANCE_IDS:
        raise ValueError(f"Instance ID '{instance_id}' is reserved")

    cls = _plugin_classes.get(plugin_id)
    if cls is None:
        raise ValueError(f"Unknown plugin: {plugin_id}")

    # Upsert PluginConfig row — merge sensitive fields from existing encrypted config
    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
    cfg = result.scalar_one_or_none()

    if cfg and cfg.config_json:
        try:
            existing = decrypt_config(cfg.config_json)
            sensitive_keys = {
                k for k, v in (cls.config_schema.get("properties") or {}).items()
                if v.get("sensitive")
            }
            merged = dict(existing)
            merged.update(config)
            for k in sensitive_keys:
                if k not in config and k in existing:
                    merged[k] = existing[k]
            config = merged
        except Exception:
            pass

    encrypted = encrypt_config(config)

    if cfg is None:
        cfg = PluginConfig(
            plugin_id=plugin_id,
            instance_id=instance_id,
            instance_label=instance_label,
            enabled=True,
            config_json=encrypted,
        )
        db.add(cfg)
    else:
        cfg.enabled = True
        cfg.config_json = encrypted
        if instance_label is not None:
            cfg.instance_label = instance_label
    await db.commit()

    # Tear down existing instance if any
    key = _instance_key(plugin_id, instance_id)
    if key in _plugin_instances:
        await _plugin_instances[key].on_disable()
        del _plugin_instances[key]
        remove_plugin_job(key)

    await _enable_plugin(plugin_id, instance_id, instance_label, encrypted, app)


async def disable_plugin(plugin_id: str, instance_id: str, db: AsyncSession) -> None:
    """Disable a plugin instance: stop instance and mark disabled in DB."""
    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.enabled = False
        await db.commit()

    key = _instance_key(plugin_id, instance_id)
    if key in _plugin_instances:
        try:
            await _plugin_instances[key].on_disable()
        except Exception:
            logger.exception("Error during on_disable for %s:%s", plugin_id, instance_id)
        del _plugin_instances[key]
        remove_plugin_job(key)


async def delete_instance(plugin_id: str, instance_id: str, db: AsyncSession) -> None:
    """Disable and permanently delete an instance config from the DB."""
    if instance_id == "default":
        raise ValueError("Cannot delete the default instance — use disable instead")
    await disable_plugin(plugin_id, instance_id, db)
    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        await db.delete(cfg)
        await db.commit()


async def update_plugin_config(
    plugin_id: str,
    instance_id: str,
    config: dict,
    db: AsyncSession,
    app: FastAPI,
) -> None:
    """Update plugin config and re-enable with new config."""
    result = await db.execute(
        select(PluginConfig).where(
            PluginConfig.plugin_id == plugin_id,
            PluginConfig.instance_id == instance_id,
        )
    )
    cfg = result.scalar_one_or_none()
    if cfg is None or not cfg.enabled:
        raise ValueError(f"Plugin {plugin_id}:{instance_id} is not enabled")
    await enable_plugin(plugin_id, instance_id, cfg.instance_label, config, db, app)
