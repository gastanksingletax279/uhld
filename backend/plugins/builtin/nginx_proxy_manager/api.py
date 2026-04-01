from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException

from backend.auth import get_current_user, require_admin
from backend.models import User

if TYPE_CHECKING:
    from backend.plugins.builtin.nginx_proxy_manager.plugin import NginxProxyManagerPlugin


def make_router(plugin: NginxProxyManagerPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/proxy-hosts")
    async def list_proxy_hosts(_: User = Depends(get_current_user)):
        try:
            items = await plugin.fetch_proxy_hosts()
            return {"items": items}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/proxy-hosts/{host_id}")
    async def get_proxy_host(host_id: int, _: User = Depends(get_current_user)):
        try:
            data = await plugin._request("GET", f"/nginx/proxy-hosts/{host_id}")
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/proxy-hosts")
    async def create_proxy_host(body: dict[str, Any], _: User = Depends(require_admin)):
        try:
            data = await plugin._request("POST", "/nginx/proxy-hosts", body)
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.put("/proxy-hosts/{host_id}")
    async def update_proxy_host(host_id: int, body: dict[str, Any], _: User = Depends(require_admin)):
        try:
            data = await plugin._request("PUT", f"/nginx/proxy-hosts/{host_id}", body)
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/proxy-hosts/{host_id}/enable")
    async def enable_proxy_host(host_id: int, _: User = Depends(require_admin)):
        try:
            data = await plugin._request("POST", f"/nginx/proxy-hosts/{host_id}/enable")
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/proxy-hosts/{host_id}/disable")
    async def disable_proxy_host(host_id: int, _: User = Depends(require_admin)):
        try:
            data = await plugin._request("POST", f"/nginx/proxy-hosts/{host_id}/disable")
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/proxy-hosts/{host_id}")
    async def delete_proxy_host(host_id: int, _: User = Depends(require_admin)):
        try:
            await plugin._request("DELETE", f"/nginx/proxy-hosts/{host_id}")
            return {"message": "Deleted"}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/certificates")
    async def list_certificates(_: User = Depends(get_current_user)):
        try:
            items = await plugin.fetch_certificates()
            return {"items": items}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/certificates/{cert_id}")
    async def get_certificate(cert_id: int, _: User = Depends(get_current_user)):
        try:
            data = await plugin._request("GET", f"/nginx/certificates/{cert_id}")
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/certificates")
    async def create_certificate(body: dict[str, Any], _: User = Depends(require_admin)):
        try:
            data = await plugin._request("POST", "/nginx/certificates", body)
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.put("/certificates/{cert_id}")
    async def update_certificate(cert_id: int, body: dict[str, Any], _: User = Depends(require_admin)):
        try:
            data = await plugin._request("PUT", f"/nginx/certificates/{cert_id}", body)
            return {"item": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/certificates/{cert_id}")
    async def delete_certificate(cert_id: int, _: User = Depends(require_admin)):
        try:
            await plugin._request("DELETE", f"/nginx/certificates/{cert_id}")
            return {"message": "Deleted"}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/access-lists")
    async def list_access_lists(_: User = Depends(get_current_user)):
        try:
            items = await plugin.fetch_access_lists()
            return {"items": items}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
