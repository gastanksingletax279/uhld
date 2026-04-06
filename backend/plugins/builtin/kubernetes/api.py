from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from backend.plugins.builtin.kubernetes.plugin import KubernetesPlugin


class ScaleRequest(BaseModel):
    replicas: int


class YamlApplyRequest(BaseModel):
    yaml: str


class YamlValidateRequest(BaseModel):
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

    @router.get("/replicasets")
    async def list_replicasets(namespace: str = ""):
        try:
            return {"replicasets": await plugin._fetch_replicasets(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/hpas")
    async def list_hpas(namespace: str = ""):
        try:
            return {"hpas": await plugin._fetch_hpas(namespace)}
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

    @router.get("/endpoints")
    async def list_endpoints(namespace: str = ""):
        try:
            return {"endpoints": await plugin._fetch_endpoints(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/networkpolicies")
    async def list_networkpolicies(namespace: str = ""):
        try:
            return {"networkpolicies": await plugin._fetch_networkpolicies(namespace)}
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

    @router.get("/storageclasses")
    async def list_storageclasses():
        try:
            return {"storageclasses": await plugin._fetch_storageclasses()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/crds")
    async def list_crds():
        try:
            return {"crds": await plugin._fetch_crds()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/resourcequotas")
    async def list_resourcequotas(namespace: str = ""):
        try:
            return {"resourcequotas": await plugin._fetch_resourcequotas(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/limitranges")
    async def list_limitranges(namespace: str = ""):
        try:
            return {"limitranges": await plugin._fetch_limitranges(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/priorityclasses")
    async def list_priorityclasses():
        try:
            return {"priorityclasses": await plugin._fetch_priorityclasses()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/pdbs")
    async def list_pdbs(namespace: str = ""):
        try:
            return {"pdbs": await plugin._fetch_pdbs(namespace)}
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

    @router.get("/pods/{namespace}/{pod}/detail")
    async def pod_detail(namespace: str, pod: str):
        try:
            return await plugin._fetch_pod_detail(namespace, pod)
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

    @router.post("/{kind}/{namespace}/{name}/restart")
    async def restart_workload(kind: str, namespace: str, name: str):
        try:
            return await plugin._restart_workload(kind, namespace, name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/namespaces/{name}")
    async def delete_namespace(name: str):
        try:
            return await plugin._delete_namespace(name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{name}/cordon")
    async def cordon_node(name: str):
        try:
            return await plugin._cordon_node(name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{name}/uncordon")
    async def uncordon_node(name: str):
        try:
            return await plugin._uncordon_node(name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{name}/drain")
    async def drain_node(name: str):
        try:
            return await plugin._drain_node(name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/nodes/{name}")
    async def delete_node(name: str):
        try:
            return await plugin._delete_node(name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.websocket("/pods/watch")
    async def watch_pods(websocket: WebSocket, namespace: str = ""):
        await websocket.accept()
        try:
            await plugin._watch_pods(websocket, namespace)
        except Exception:
            pass
        finally:
            try:
                await websocket.close()
            except Exception:
                pass

    @router.websocket("/pods/{namespace}/{pod}/logs/stream")
    async def pod_logs_stream(websocket: WebSocket, namespace: str, pod: str, container: str = ""):
        try:
            await plugin._stream_pod_logs(websocket, namespace, pod, container)
        except Exception as exc:
            try:
                await websocket.close(code=1011, reason=str(exc))
            except Exception:
                pass

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

    # ── Access control ────────────────────────────────────────────────────────

    @router.get("/serviceaccounts")
    async def list_serviceaccounts(namespace: str = ""):
        try:
            return {"serviceaccounts": await plugin._fetch_serviceaccounts(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/roles")
    async def list_roles(namespace: str = ""):
        try:
            return {"roles": await plugin._fetch_roles(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/clusterroles")
    async def list_clusterroles():
        try:
            return {"clusterroles": await plugin._fetch_clusterroles()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/rolebindings")
    async def list_rolebindings(namespace: str = ""):
        try:
            return {"rolebindings": await plugin._fetch_rolebindings(namespace)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/clusterrolebindings")
    async def list_clusterrolebindings():
        try:
            return {"clusterrolebindings": await plugin._fetch_clusterrolebindings()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Helm ──────────────────────────────────────────────────────────────────

    @router.get("/helm/releases")
    async def list_helm_releases(namespace: str = ""):
        try:
            return {"releases": await plugin._fetch_helm_releases(namespace)}
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

    @router.post("/yaml/validate")
    async def validate_resource_yaml(body: YamlValidateRequest):
        try:
            return await plugin._validate_resource_yaml(body.yaml)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Deployment detail ─────────────────────────────────────────────────────

    @router.get("/namespaces/{namespace}/deployments/{name}")
    async def deployment_detail(namespace: str, name: str):
        try:
            return await plugin._fetch_deployment_detail(namespace, name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Node detail ───────────────────────────────────────────────────────────

    @router.get("/nodes/{name}/details")
    async def node_details(name: str):
        try:
            return await plugin._fetch_node_detail(name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── MetalLB ──────────────────────────────────────────────────────────────

    @router.get("/metallb/overview")
    async def metallb_overview():
        try:
            return await plugin._fetch_metallb_overview()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/metallb/ipaddresspools")
    async def metallb_ipaddresspools():
        try:
            return {"ipaddresspools": await plugin._fetch_metallb_ipaddresspools()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/metallb/l2advertisements")
    async def metallb_l2advertisements():
        try:
            return {"l2advertisements": await plugin._fetch_metallb_l2advertisements()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/metallb/bgpadvertisements")
    async def metallb_bgpadvertisements():
        try:
            return {"bgpadvertisements": await plugin._fetch_metallb_bgpadvertisements()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/metallb/bgppeers")
    async def metallb_bgppeers():
        try:
            return {"bgppeers": await plugin._fetch_metallb_bgppeers()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/metallb/bfdprofiles")
    async def metallb_bfdprofiles():
        try:
            return {"bfdprofiles": await plugin._fetch_metallb_bfdprofiles()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/metallb/communities")
    async def metallb_communities():
        try:
            return {"communities": await plugin._fetch_metallb_communities()}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── etcd ─────────────────────────────────────────────────────────────────

    @router.get("/etcd/status")
    async def etcd_status():
        try:
            return await plugin._fetch_etcd_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/etcd/metrics")
    async def etcd_metrics():
        """Fetch per-member etcd health and Prometheus metrics via the Kubernetes API
        pod proxy.  Returns ``{"available": false, "reason": "..."}`` when etcd is
        not detected or the pod proxy is unreachable — never raises 502 so the
        frontend can degrade gracefully."""
        try:
            return await plugin._fetch_etcd_metrics()
        except Exception as exc:
            logger.warning("etcd metrics unavailable: %s", exc)
            return {"available": False, "reason": "etcd metrics unavailable"}

    return router
