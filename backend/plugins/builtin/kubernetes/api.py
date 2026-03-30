from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException

if TYPE_CHECKING:
    from backend.plugins.builtin.kubernetes.plugin import KubernetesPlugin


def make_router(plugin: KubernetesPlugin) -> APIRouter:
    router = APIRouter()

    # ── Cluster ───────────────────────────────────────────────────────────────

    @router.get("/nodes")
    async def list_nodes():
        try:
            return {"nodes": await plugin._fetch_nodes()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/namespaces")
    async def list_namespaces():
        try:
            return {"namespaces": await plugin._fetch_namespaces()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Workloads ─────────────────────────────────────────────────────────────

    @router.get("/pods")
    async def list_pods(namespace: str = ""):
        try:
            return {"pods": await plugin._fetch_pods(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/deployments")
    async def list_deployments(namespace: str = ""):
        try:
            return {"deployments": await plugin._fetch_deployments(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/statefulsets")
    async def list_statefulsets(namespace: str = ""):
        try:
            return {"statefulsets": await plugin._fetch_statefulsets(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/daemonsets")
    async def list_daemonsets(namespace: str = ""):
        try:
            return {"daemonsets": await plugin._fetch_daemonsets(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/jobs")
    async def list_jobs(namespace: str = ""):
        try:
            return {"jobs": await plugin._fetch_jobs(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/cronjobs")
    async def list_cronjobs(namespace: str = ""):
        try:
            return {"cronjobs": await plugin._fetch_cronjobs(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Networking ────────────────────────────────────────────────────────────

    @router.get("/services")
    async def list_services(namespace: str = ""):
        try:
            return {"services": await plugin._fetch_services(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/ingresses")
    async def list_ingresses(namespace: str = ""):
        try:
            return {"ingresses": await plugin._fetch_ingresses(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Storage ───────────────────────────────────────────────────────────────

    @router.get("/persistentvolumes")
    async def list_pvs():
        try:
            return {"pvs": await plugin._fetch_persistentvolumes()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/persistentvolumeclaims")
    async def list_pvcs(namespace: str = ""):
        try:
            return {"pvcs": await plugin._fetch_persistentvolumeclaims(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/configmaps")
    async def list_configmaps(namespace: str = ""):
        try:
            return {"configmaps": await plugin._fetch_configmaps(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/secrets")
    async def list_secrets(namespace: str = ""):
        try:
            return {"secrets": await plugin._fetch_secrets(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
