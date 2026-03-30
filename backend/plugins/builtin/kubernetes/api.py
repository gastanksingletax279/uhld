from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.kubernetes.plugin import KubernetesPlugin


class ScaleRequest(BaseModel):
    replicas: int


class YamlApplyRequest(BaseModel):
    yaml: str


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

    @router.get("/secrets/{namespace}/{name}/data")
    async def get_secret_data(namespace: str, name: str):
        try:
            return await plugin._fetch_secret_data(namespace, name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/certificates")
    async def list_certificates(namespace: str = ""):
        try:
            return {"certificates": await plugin._fetch_certificates(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/events")
    async def list_events(namespace: str = "", warning_only: bool = False):
        try:
            return {"events": await plugin._fetch_events(namespace, warning_only)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/overview")
    async def cluster_overview():
        try:
            return await plugin._fetch_overview()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Actions ───────────────────────────────────────────────────────────────

    @router.get("/pods/{namespace}/{pod}/containers")
    async def pod_containers(namespace: str, pod: str):
        try:
            return {"containers": await plugin._fetch_pod_containers(namespace, pod)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/pods/{namespace}/{pod}/logs")
    async def pod_logs(namespace: str, pod: str, container: str = "", tail: int = 200):
        try:
            text = await plugin._fetch_pod_logs(namespace, pod, container, tail)
            return {"logs": text}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/pods/{namespace}/{pod}")
    async def restart_pod(namespace: str, pod: str):
        try:
            await plugin._restart_pod(namespace, pod)
            return {"ok": True}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.patch("/deployments/{namespace}/{name}/scale")
    async def scale_deployment(namespace: str, name: str, body: ScaleRequest):
        try:
            return await plugin._scale_deployment(namespace, name, body.replicas)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.websocket("/pods/{namespace}/{pod}/exec")
    async def pod_exec(websocket: WebSocket, namespace: str, pod: str, container: str = "", command: str = "/bin/sh"):
        await websocket.accept()
        try:
            await plugin._exec_pod_shell(websocket, namespace, pod, container, command)
        except Exception as exc:
            try:
                await websocket.close(code=1011, reason=str(exc))
            except Exception:
                pass

    # ── Networking extras ─────────────────────────────────────────────────────

    @router.get("/httproutes")
    async def list_httproutes(namespace: str = ""):
        try:
            return {"httproutes": await plugin._fetch_httproutes(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/ingressclasses")
    async def list_ingressclasses():
        try:
            return {"ingressclasses": await plugin._fetch_ingressclasses()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Longhorn ──────────────────────────────────────────────────────────────

    @router.get("/longhorn/volumes")
    async def list_longhorn_volumes():
        try:
            return {"volumes": await plugin._fetch_longhorn_volumes()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/longhorn/nodes")
    async def list_longhorn_nodes():
        try:
            return {"nodes": await plugin._fetch_longhorn_nodes()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── YAML ──────────────────────────────────────────────────────────────────

    @router.get("/yaml/{kind}/{name}")
    async def get_resource_yaml(kind: str, name: str, namespace: str = ""):
        try:
            return {"yaml": await plugin._get_resource_yaml(kind, namespace, name)}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/yaml/apply")
    async def apply_resource_yaml(body: YamlApplyRequest):
        try:
            return await plugin._apply_resource_yaml(body.yaml)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
