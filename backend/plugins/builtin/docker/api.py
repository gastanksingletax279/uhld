from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.docker.plugin import DockerPlugin


def make_router(plugin: DockerPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/containers")
    async def list_containers():
        try:
            containers = await plugin._fetch_containers()
            return {"containers": containers}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/containers/{container_id}/start")
    async def start_container(container_id: str):
        try:
            return await plugin._container_action(container_id, "start")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/containers/{container_id}/stop")
    async def stop_container(container_id: str):
        try:
            return await plugin._container_action(container_id, "stop")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/containers/{container_id}/restart")
    async def restart_container(container_id: str):
        try:
            return await plugin._container_action(container_id, "restart")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/containers/{container_id}/logs", response_class=PlainTextResponse)
    async def container_logs(container_id: str, tail: int = 100):
        try:
            return await plugin._fetch_container_logs(container_id, tail)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/images")
    async def list_images():
        try:
            images = await plugin._fetch_images()
            return {"images": images}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
