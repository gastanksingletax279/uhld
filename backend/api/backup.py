from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, require_admin
from backend.database import get_db
from backend.models import PluginConfig, Setting, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_VERSION = "1"


def _backup_dir() -> Path:
    """Return (and create) the backup storage directory."""
    from backend.database import DATABASE_PATH

    base = Path(DATABASE_PATH).parent
    d = base / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


_BACKUP_FILENAME_RE = re.compile(r"^backup_\d{8}_\d{6}\.json$")


def _resolve_backup_path(filename: str) -> Path:
    """Validate backup filename and return a path constrained to the backup directory."""
    if not _BACKUP_FILENAME_RE.fullmatch(filename):
        raise HTTPException(status_code=400, detail="Invalid backup filename format")

    backup_dir = _backup_dir().resolve()
    path = (backup_dir / filename).resolve()
    if path.parent != backup_dir:
        # Defense-in-depth in case future filename constraints are loosened.
        raise HTTPException(status_code=400, detail="Invalid filename path")
    return path


# ── Pydantic models ────────────────────────────────────────────────────────────


class BackupInfo(BaseModel):
    filename: str
    created_at: str
    size_bytes: int


class BackupSchedule(BaseModel):
    enabled: bool = False
    interval: str = "daily"  # daily | weekly
    keep_count: int = 7


# ── List / create / download / delete ─────────────────────────────────────────


@router.get("/", response_model=list[BackupInfo])
async def list_backups(_: User = Depends(get_current_user)):
    """List all available local backup files, newest first."""
    d = _backup_dir()
    backups = []
    for f in sorted(d.glob("backup_*.json"), reverse=True):
        stat = f.stat()
        backups.append(
            BackupInfo(
                filename=f.name,
                created_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                size_bytes=stat.st_size,
            )
        )
    return backups


@router.post("/", response_model=BackupInfo)
async def create_backup(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Create a new backup snapshot of all plugin configs and settings."""
    data = await _build_backup_data(db)
    d = _backup_dir()
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{ts}.json"
    path = d / filename
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    stat = path.stat()
    logger.info("Manual backup created: %s", filename)
    return BackupInfo(
        filename=filename,
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
        size_bytes=stat.st_size,
    )


@router.get("/{filename}/download")
async def download_backup(filename: str, _: User = Depends(require_admin)):
    """Download a backup file."""
    path = _resolve_backup_path(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(path=str(path), filename=filename, media_type="application/json")


@router.delete("/{filename}")
async def delete_backup(filename: str, _: User = Depends(require_admin)):
    """Delete a backup file."""
    path = _resolve_backup_path(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    path.unlink()
    logger.info("Backup deleted: %s", filename)
    return {"message": "Backup deleted"}


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Restore plugin configs and settings from an uploaded backup JSON file.

    All restored plugin configs are set to disabled=True so the admin must
    re-enable them after reviewing the restored configuration.
    """
    try:
        content = await file.read()
        data = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid backup file — could not parse JSON")

    if data.get("version") != BACKUP_VERSION:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported backup version: {data.get('version')!r}. Expected {BACKUP_VERSION!r}.",
        )

    restored_plugins = 0
    restored_settings = 0

    for cfg_data in data.get("plugin_configs", []):
        pid = cfg_data.get("plugin_id")
        iid = cfg_data.get("instance_id", "default")
        if not pid:
            continue
        result = await db.execute(
            select(PluginConfig).where(
                PluginConfig.plugin_id == pid,
                PluginConfig.instance_id == iid,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.instance_label = cfg_data.get("instance_label")
            existing.enabled = False  # never auto-enable on restore
            existing.config_json = cfg_data.get("config_json")
        else:
            db.add(
                PluginConfig(
                    plugin_id=pid,
                    instance_id=iid,
                    instance_label=cfg_data.get("instance_label"),
                    enabled=False,
                    config_json=cfg_data.get("config_json"),
                )
            )
        restored_plugins += 1

    for s_data in data.get("settings", []):
        key = s_data.get("key")
        if not key:
            continue
        result = await db.execute(select(Setting).where(Setting.key == key))
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = s_data.get("value")
        else:
            db.add(Setting(key=key, value=s_data.get("value")))
        restored_settings += 1

    await db.commit()
    logger.info(
        "Backup restored: %d plugin configs, %d settings", restored_plugins, restored_settings
    )
    return {
        "message": (
            f"Backup restored: {restored_plugins} plugin config(s), {restored_settings} setting(s). "
            "Restart the application to apply restored plugin configurations."
        )
    }


# ── Schedule ───────────────────────────────────────────────────────────────────


@router.get("/schedule", response_model=BackupSchedule)
async def get_backup_schedule(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Setting).where(
            Setting.key.in_(
                ["backup_schedule_enabled", "backup_schedule_interval", "backup_keep_count"]
            )
        )
    )
    settings = {s.key: s.value for s in result.scalars().all()}
    return BackupSchedule(
        enabled=settings.get("backup_schedule_enabled", "false") == "true",
        interval=settings.get("backup_schedule_interval", "daily"),
        keep_count=int(settings.get("backup_keep_count", "7")),
    )


@router.put("/schedule")
async def update_backup_schedule(
    body: BackupSchedule,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    updates = {
        "backup_schedule_enabled": "true" if body.enabled else "false",
        "backup_schedule_interval": body.interval,
        "backup_keep_count": str(body.keep_count),
    }
    for key, value in updates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            db.add(Setting(key=key, value=value))
    await db.commit()
    apply_backup_schedule(body.enabled, body.interval)
    return {"message": "Backup schedule updated"}


# ── Shared helpers ─────────────────────────────────────────────────────────────


async def _build_backup_data(db: AsyncSession) -> dict:
    """Build the full backup data structure from the current DB state."""
    pc_result = await db.execute(select(PluginConfig))
    plugin_configs = [
        {
            "plugin_id": cfg.plugin_id,
            "instance_id": cfg.instance_id,
            "instance_label": cfg.instance_label,
            "enabled": cfg.enabled,
            "config_json": cfg.config_json,
        }
        for cfg in pc_result.scalars().all()
    ]

    st_result = await db.execute(select(Setting))
    settings = [{"key": s.key, "value": s.value} for s in st_result.scalars().all()]

    return {
        "version": BACKUP_VERSION,
        "created_at": datetime.now(UTC).isoformat(),
        "plugin_configs": plugin_configs,
        "settings": settings,
    }


async def _scheduled_backup_job() -> None:
    """APScheduler job: create backup and prune according to keep_count."""
    from backend.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        data = await _build_backup_data(db)
        result = await db.execute(select(Setting).where(Setting.key == "backup_keep_count"))
        s = result.scalar_one_or_none()
        keep_count = int(s.value) if s and s.value else 7

    d = _backup_dir()
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    path = d / f"backup_{ts}.json"
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    logger.info("Scheduled backup created: %s", path.name)

    # Prune oldest backups beyond keep_count
    all_backups = sorted(d.glob("backup_*.json"))
    while len(all_backups) > keep_count:
        oldest = all_backups.pop(0)
        oldest.unlink()
        logger.info("Pruned old backup: %s", oldest.name)


def apply_backup_schedule(enabled: bool, interval: str) -> None:
    """Register or remove the scheduled backup APScheduler job."""
    from apscheduler.triggers.cron import CronTrigger

    from backend.scheduler import scheduler

    job_id = "backup_scheduled"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not enabled:
        logger.info("Backup schedule disabled")
        return

    trigger = (
        CronTrigger(day_of_week="sun", hour=2, minute=0)
        if interval == "weekly"
        else CronTrigger(hour=2, minute=0)
    )
    scheduler.add_job(
        _scheduled_backup_job,
        trigger=trigger,
        id=job_id,
        replace_existing=True,
        misfire_grace_time=300,
    )
    logger.info("Backup schedule activated: %s", interval)
