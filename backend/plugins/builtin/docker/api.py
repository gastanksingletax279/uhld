from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, WebSocket, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.docker.plugin import DockerPlugin


def make_router(plugin: DockerPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/info")
    async def get_info():
        try:
            return await plugin._fetch_info()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/events")
    async def get_events(since: int = 0):
        try:
            events = await plugin._fetch_events(since)
            return {"events": events}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

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

    @router.get("/containers/{container_id}/stats")
    async def container_stats(container_id: str):
        try:
            return await plugin._fetch_container_stats(container_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.websocket("/containers/{container_id}/logs/stream")
    async def stream_logs(container_id: str, websocket: WebSocket):
        await plugin._stream_container_logs(container_id, websocket)

    @router.get("/images")
    async def list_images():
        try:
            images = await plugin._fetch_images()
            return {"images": images}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/images/{image_id:path}")
    async def delete_image(image_id: str, force: bool = False):
        try:
            return await plugin._delete_image(image_id, force)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/networks")
    async def list_networks():
        try:
            networks = await plugin._fetch_networks()
            return {"networks": networks}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/volumes")
    async def list_volumes():
        try:
            volumes = await plugin._fetch_volumes()
            return {"volumes": volumes}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/compose")
    async def list_compose():
        try:
            projects = await plugin._fetch_compose_projects()
            return {"projects": projects}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/compose/{project}/start")
    async def compose_start(project: str):
        try:
            return await plugin._compose_action(project, "start")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/compose/{project}/stop")
    async def compose_stop(project: str):
        try:
            return await plugin._compose_action(project, "stop")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/compose/{project}/restart")
    async def compose_restart(project: str):
        try:
            return await plugin._compose_action(project, "restart")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.websocket("/containers/{container_id}/exec")
    async def exec_container(container_id: str, websocket: WebSocket, cmd: str = Query(default="/bin/sh")):
        await plugin._exec_container_shell(container_id, cmd, websocket)

    return router
