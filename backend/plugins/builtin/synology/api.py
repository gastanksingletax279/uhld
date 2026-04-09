from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.auth import get_current_user, require_admin

if TYPE_CHECKING:
    from backend.plugins.builtin.synology.plugin import SynologyPlugin

logger = logging.getLogger(__name__)


# ── Request bodies ────────────────────────────────────────────────────────────


class CreateDownloadRequest(BaseModel):
    uri: str


class CreateFolderRequest(BaseModel):
    path: str
    name: str


class DeleteFilesRequest(BaseModel):
    path: str


# ── Router factory ────────────────────────────────────────────────────────────


def make_router(plugin: SynologyPlugin) -> APIRouter:
    router = APIRouter()

    # ── System ────────────────────────────────────────────────────────────────

    @router.get("/info")
    async def get_info(_user=Depends(get_current_user)):
        """Return DSM model, version, serial number, uptime, and temperature."""
        try:
            data = await plugin._api(
                {"api": "SYNO.DSM.Info", "version": "2", "method": "getinfo"}
            )
            return {
                "model": data.get("model", ""),
                "version": data.get("version", ""),
                "serial": data.get("serial", ""),
                "uptime": data.get("uptime", 0),
                "temperature": data.get("temperature", None),
                "temperature_warn": data.get("temperature_warn", False),
                "hostname": data.get("hostname", ""),
            }
        except Exception as exc:
            logger.error("Synology /info error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to fetch DSM info")

    @router.get("/utilisation")
    async def get_utilisation(_user=Depends(get_current_user)):
        """Return CPU %, RAM used/total/%, and per-interface network I/O."""
        try:
            data = await plugin._api(
                {"api": "SYNO.Core.System.Utilisation", "version": "1", "method": "get"}
            )

            cpu: dict[str, Any] = data.get("cpu", {})
            mem: dict[str, Any] = data.get("memory", {})
            net_list: list[dict[str, Any]] = data.get("network", [])

            mem_total = int(mem.get("real_total", 0))
            mem_avail = int(mem.get("avail_real", 0))
            mem_used = mem_total - mem_avail
            mem_pct = round(mem_used / mem_total * 100, 1) if mem_total else 0.0

            cpu_pct = int(cpu.get("user_load", 0)) + int(cpu.get("system_load", 0))

            interfaces = [
                {
                    "device": iface.get("device", ""),
                    "rx": int(iface.get("rx", 0)),
                    "tx": int(iface.get("tx", 0)),
                }
                for iface in net_list
            ]

            return {
                "available": True,
                "cpu": {
                    "user": int(cpu.get("user_load", 0)),
                    "system": int(cpu.get("system_load", 0)),
                    "total": cpu_pct,
                },
                "memory": {
                    "total": mem_total,
                    "used": mem_used,
                    "free": mem_avail,
                    "usage": mem_pct,
                },
                "network": interfaces,
            }
        except RuntimeError as exc:
            # SYNO.Core.System.Utilisation requires admin privileges; return graceful zeros
            logger.warning("Synology utilisation unavailable (may require admin): %s", exc)
            return {
                "available": False,
                "cpu": {"user": 0, "system": 0, "total": 0},
                "memory": {"total": 0, "used": 0, "free": 0, "usage": 0.0},
                "network": [],
            }
        except Exception as exc:
            logger.error("Synology /utilisation error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to fetch utilisation data")

    # ── Storage ───────────────────────────────────────────────────────────────

    @router.get("/storage")
    async def get_storage(_user=Depends(get_current_user)):
        """Return volumes and disks from SYNO.Storage.CGI.Storage."""
        try:
            data = await plugin._api(
                {
                    "api": "SYNO.Storage.CGI.Storage",
                    "version": "1",
                    "method": "load_info",
                    "offset": "0",
                    "limit": "50",
                }
            )

            raw_volumes: list[dict[str, Any]] = data.get("volumes", [])
            raw_disks: list[dict[str, Any]] = data.get("disks", [])

            volumes = [
                {
                    "id": v.get("id", ""),
                    "name": v.get("name", ""),
                    "status": v.get("status", ""),
                    "size_total": int(v.get("size", {}).get("total", 0)),
                    "size_used": int(v.get("size", {}).get("used", 0)),
                    "fs_type": v.get("fs_type", ""),
                    "raid_type": v.get("raid_type", ""),
                    "device_type": v.get("device_type", ""),
                }
                for v in raw_volumes
            ]

            disks = [
                {
                    "id": d.get("id", ""),
                    "name": d.get("name", ""),
                    "model": d.get("model", ""),
                    "serial": d.get("serial", ""),
                    "size_total": int(d.get("size_total", 0)),
                    "temp": d.get("temp", None),
                    "status": d.get("status", ""),
                    "smart_status": d.get("smart_status", ""),
                    "type": d.get("type", ""),
                    "container": d.get("container", {}).get("name", "") if isinstance(d.get("container"), dict) else "",
                }
                for d in raw_disks
            ]

            return {"volumes": volumes, "disks": disks}
        except Exception as exc:
            logger.error("Synology /storage error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to fetch storage data")

    @router.post("/storage/disks/{disk_id}/smart_test")
    async def start_smart_test(disk_id: str, _admin=Depends(require_admin)):
        """Start a SMART quick test on a disk."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.Storage.CGI.Smart",
                    "version": "1",
                    "method": "start_quick_test",
                    "disk_id": disk_id,
                }
            )
            return {"status": "ok", "message": f"SMART quick test started on disk {disk_id}"}
        except Exception as exc:
            logger.error("Synology SMART test error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to start SMART test")

    # ── Shared Folders ────────────────────────────────────────────────────────

    @router.get("/shares")
    async def get_shares(_user=Depends(get_current_user)):
        """List shared folders with quota and encryption status."""
        try:
            data = await plugin._api(
                {
                    "api": "SYNO.Core.Share",
                    "version": "1",
                    "method": "list",
                    "additional": '["share_quota"]',
                    "offset": "0",
                    "limit": "200",
                }
            )
            raw_shares: list[dict[str, Any]] = data.get("shares", [])
            shares = [
                {
                    "name": s.get("name", ""),
                    "vol_path": s.get("vol_path", ""),
                    "desc": s.get("desc", ""),
                    "encrypt": bool(s.get("encrypt", False)),
                    "is_aclmode": bool(s.get("is_aclmode", False)),
                    "quota_value": s.get("quota_value", 0),
                    "quota_unit": s.get("quota_unit", "GB"),
                }
                for s in raw_shares
            ]
            return {"shares": shares}
        except Exception as exc:
            logger.error("Synology /shares error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to fetch shared folders")

    @router.post("/shares/{name}/encrypt_mount")
    async def encrypt_mount_share(name: str, _admin=Depends(require_admin)):
        """Mount an encrypted shared folder."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.Core.Share",
                    "version": "1",
                    "method": "set_enc_mount",
                    "name": name,
                    "action": "mount",
                }
            )
            return {"status": "ok", "message": f"Share '{name}' mounted"}
        except Exception as exc:
            logger.error("Synology encrypt_mount error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to mount encrypted share")

    @router.post("/shares/{name}/encrypt_unmount")
    async def encrypt_unmount_share(name: str, _admin=Depends(require_admin)):
        """Unmount an encrypted shared folder."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.Core.Share",
                    "version": "1",
                    "method": "set_enc_mount",
                    "name": name,
                    "action": "unmount",
                }
            )
            return {"status": "ok", "message": f"Share '{name}' unmounted"}
        except Exception as exc:
            logger.error("Synology encrypt_unmount error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to unmount encrypted share")

    # ── Download Station ──────────────────────────────────────────────────────

    @router.get("/downloads")
    async def get_downloads(_user=Depends(get_current_user)):
        """List Download Station tasks with progress, speed, size, status, and destination."""
        try:
            data = await plugin._api(
                {
                    "api": "SYNO.DownloadStation.Task",
                    "version": "3",
                    "method": "list",
                    "additional": "detail,transfer",
                    "offset": "0",
                    "limit": "200",
                }
            )
            raw_tasks: list[dict[str, Any]] = data.get("tasks", [])
            tasks = []
            for t in raw_tasks:
                detail: dict[str, Any] = t.get("additional", {}).get("detail", {})
                transfer: dict[str, Any] = t.get("additional", {}).get("transfer", {})
                size = int(t.get("size", 0))
                downloaded = int(transfer.get("size_downloaded", 0))
                progress = round(downloaded / size * 100, 1) if size > 0 else 0.0
                tasks.append(
                    {
                        "id": t.get("id", ""),
                        "title": t.get("title", ""),
                        "type": t.get("type", ""),
                        "status": t.get("status", ""),
                        "size": size,
                        "size_downloaded": downloaded,
                        "size_uploaded": int(transfer.get("size_uploaded", 0)),
                        "speed_download": int(transfer.get("speed_download", 0)),
                        "speed_upload": int(transfer.get("speed_upload", 0)),
                        "progress": progress,
                        "destination": detail.get("destination", ""),
                        "uri": detail.get("uri", ""),
                        "create_time": detail.get("create_time", 0),
                    }
                )
            return {"available": True, "tasks": tasks, "total": data.get("total", len(tasks))}
        except RuntimeError as exc:
            # DownloadStation may not be installed or user lacks permission
            logger.warning("Synology DownloadStation unavailable: %s", exc)
            return {"available": False, "tasks": [], "total": 0}
        except Exception as exc:
            logger.error("Synology /downloads error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to fetch download tasks")

    @router.post("/downloads")
    async def create_download(body: CreateDownloadRequest, _admin=Depends(require_admin)):
        """Add a new download task by URI."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.DownloadStation.Task",
                    "version": "3",
                    "method": "create",
                    "uri": body.uri,
                }
            )
            return {"status": "ok", "message": "Download task created"}
        except Exception as exc:
            logger.error("Synology create_download error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to create download task")

    @router.post("/downloads/{task_id}/pause")
    async def pause_download(task_id: str, _admin=Depends(require_admin)):
        """Pause a download task."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.DownloadStation.Task",
                    "version": "3",
                    "method": "pause",
                    "id": task_id,
                }
            )
            return {"status": "ok", "message": f"Task {task_id} paused"}
        except Exception as exc:
            logger.error("Synology pause_download error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to pause download task")

    @router.post("/downloads/{task_id}/resume")
    async def resume_download(task_id: str, _admin=Depends(require_admin)):
        """Resume a paused download task."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.DownloadStation.Task",
                    "version": "3",
                    "method": "resume",
                    "id": task_id,
                }
            )
            return {"status": "ok", "message": f"Task {task_id} resumed"}
        except Exception as exc:
            logger.error("Synology resume_download error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to resume download task")

    @router.delete("/downloads/{task_id}")
    async def delete_download(task_id: str, _admin=Depends(require_admin)):
        """Delete a download task and optionally its files."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.DownloadStation.Task",
                    "version": "3",
                    "method": "delete",
                    "id": task_id,
                    "force_complete": "false",
                }
            )
            return {"status": "ok", "message": f"Task {task_id} deleted"}
        except Exception as exc:
            logger.error("Synology delete_download error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to delete download task")

    # ── Packages ──────────────────────────────────────────────────────────────

    @router.get("/packages")
    async def get_packages(_user=Depends(get_current_user)):
        """List installed packages with name, id, version, and status."""
        try:
            data = await plugin._api(
                {
                    "api": "SYNO.Core.Package",
                    "version": "1",
                    "method": "list",
                    "additional": '["description","description_enu"]',
                    "offset": "0",
                    "limit": "200",
                }
            )
            raw_packages: list[dict[str, Any]] = data.get("packages", [])
            packages = [
                {
                    "id": p.get("id", ""),
                    "name": p.get("name", ""),
                    "version": p.get("version", ""),
                    "status": p.get("status", ""),
                    "description": p.get("description_enu", p.get("description", "")),
                }
                for p in raw_packages
            ]
            return {"packages": packages}
        except Exception as exc:
            logger.error("Synology /packages error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to fetch packages")

    @router.post("/packages/{package_id}/start")
    async def start_package(package_id: str, _admin=Depends(require_admin)):
        """Start a stopped package."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.Core.Package",
                    "version": "1",
                    "method": "start",
                    "id": package_id,
                }
            )
            return {"status": "ok", "message": f"Package '{package_id}' started"}
        except Exception as exc:
            logger.error("Synology start_package error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to start package")

    @router.post("/packages/{package_id}/stop")
    async def stop_package(package_id: str, _admin=Depends(require_admin)):
        """Stop a running package."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.Core.Package",
                    "version": "1",
                    "method": "stop",
                    "id": package_id,
                }
            )
            return {"status": "ok", "message": f"Package '{package_id}' stopped"}
        except Exception as exc:
            logger.error("Synology stop_package error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to stop package")

    # ── File Station ──────────────────────────────────────────────────────────

    @router.get("/files")
    async def list_files(
        path: str = Query(default="/", description="Folder path to list"),
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=100, ge=1, le=1000),
        _user=Depends(get_current_user),
    ):
        """List files and folders at the given path.

        At the root ("/") we use list_share to enumerate shared folders.
        For any sub-path we use list with folder_path.
        """
        try:
            if path in ("/", ""):
                # Root level: enumerate shared folders
                data = await plugin._api(
                    {
                        "api": "SYNO.FileStation.List",
                        "version": "2",
                        "method": "list_share",
                        "offset": str(offset),
                        "limit": str(limit),
                        "additional": '["size","time"]',
                        "sort_by": "name",
                        "sort_direction": "ASC",
                    }
                )
                raw_files: list[dict[str, Any]] = data.get("shares", [])
                files = [
                    {
                        "name": f.get("name", ""),
                        "path": f.get("path", f"/{f.get('name', '')}"),
                        "is_dir": True,
                        "size": 0,
                        "mtime": 0,
                        "type": "dir",
                    }
                    for f in raw_files
                ]
            else:
                data = await plugin._api(
                    {
                        "api": "SYNO.FileStation.List",
                        "version": "2",
                        "method": "list",
                        "folder_path": path,
                        "offset": str(offset),
                        "limit": str(limit),
                        "additional": '["size","time","type"]',
                        "sort_by": "name",
                        "sort_direction": "ASC",
                    }
                )
                raw_files = data.get("files", [])
                files = [
                    {
                        "name": f.get("name", ""),
                        "path": f.get("path", ""),
                        "is_dir": bool(f.get("isdir", False)),
                        "size": int((f.get("additional", {}) or {}).get("size", 0)),
                        "mtime": int(
                            ((f.get("additional", {}) or {}).get("time", {}) or {}).get("mtime", 0)
                        ),
                        "type": (f.get("additional", {}) or {}).get("type", ""),
                    }
                    for f in raw_files
                ]
            return {
                "files": files,
                "total": data.get("total", len(files)),
                "offset": data.get("offset", offset),
            }
        except Exception as exc:
            logger.error("Synology /files error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to list files")

    @router.post("/files/folder")
    async def create_folder(body: CreateFolderRequest, _admin=Depends(require_admin)):
        """Create a new folder at path/name."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.FileStation.CreateFolder",
                    "version": "2",
                    "method": "create",
                    "folder_path": body.path,
                    "name": body.name,
                    "force_parent": "false",
                }
            )
            return {"status": "ok", "message": f"Folder '{body.name}' created in '{body.path}'"}
        except Exception as exc:
            logger.error("Synology create_folder error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to create folder")

    @router.delete("/files")
    async def delete_file(body: DeleteFilesRequest, _admin=Depends(require_admin)):
        """Delete a file or folder at the given path."""
        try:
            await plugin._api(
                {
                    "api": "SYNO.FileStation.Delete",
                    "version": "2",
                    "method": "delete",
                    "path": body.path,
                    "recursive": "true",
                }
            )
            return {"status": "ok", "message": f"'{body.path}' deleted"}
        except Exception as exc:
            logger.error("Synology delete_file error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to delete file or folder")

    @router.get("/files/download")
    async def download_file(
        path: str = Query(..., description="Full path to the file to download"),
        _user=Depends(get_current_user),
    ):
        """Stream a file from File Station with the correct Content-Type."""
        try:
            resp = await plugin._api_raw(
                {
                    "api": "SYNO.FileStation.Download",
                    "version": "2",
                    "method": "download",
                    "path": path,
                    "mode": "download",
                }
            )
            content_type = resp.headers.get("content-type", "application/octet-stream")
            filename = path.split("/")[-1]

            async def _iter():
                async for chunk in resp.aiter_bytes(chunk_size=65536):
                    yield chunk

            return StreamingResponse(
                _iter(),
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                },
            )
        except Exception as exc:
            logger.error("Synology download_file error: %s", exc)
            raise HTTPException(status_code=502, detail="Failed to download file")

    return router
