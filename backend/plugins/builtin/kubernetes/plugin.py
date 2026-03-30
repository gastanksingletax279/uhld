from __future__ import annotations

import asyncio
import logging
import os
import tempfile

from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class KubernetesPlugin(PluginBase):
    plugin_id = "kubernetes"
    display_name = "Kubernetes"
    description = "Monitor Kubernetes cluster nodes, pods, and namespaces"
    version = "1.0.0"
    icon = "container"
    category = "containers"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "kubeconfig_content": {
                "type": "string",
                "title": "Kubeconfig (paste content)",
                "description": "Paste the full contents of your kubeconfig file here. Stored encrypted. Takes priority over path.",
                "sensitive": True,
                "format": "textarea",
            },
            "kubeconfig_path": {
                "type": "string",
                "title": "Kubeconfig Path",
                "description": "Path to kubeconfig file on the host. Used when content above is not set. Leave blank to use ~/.kube/config or in-cluster config.",
                "placeholder": "/root/.kube/config",
            },
            "context": {
                "type": "string",
                "title": "Context",
                "description": "Kubernetes context name. Leave blank for current context.",
            },
            "in_cluster": {
                "type": "boolean",
                "title": "In-Cluster Config",
                "default": False,
                "description": "Use in-cluster service account (when running inside a Kubernetes pod).",
            },
            "namespace": {
                "type": "string",
                "title": "Default Namespace",
                "description": "Filter pods to this namespace. Leave blank for all namespaces.",
                "placeholder": "default",
            },
        },
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._api_client = None
        self._summary_cache: dict | None = None
        self._tmp_kubeconfig: str | None = None  # path to temp file written from content

    # ── Client ────────────────────────────────────────────────────────────────

    def _load_config(self) -> None:
        from kubernetes import client, config as k8s_config  # type: ignore[import]

        if self._config.get("in_cluster"):
            k8s_config.load_incluster_config()
        else:
            kube_path = self._resolve_kubeconfig_path()
            context = self._config.get("context") or None
            k8s_config.load_kube_config(config_file=kube_path, context=context)

        self._api_client = client.ApiClient()

    def _resolve_kubeconfig_path(self) -> str | None:
        """Return path to kubeconfig: write content to temp file if provided, else use path."""
        content = self._config.get("kubeconfig_content") or ""
        if content.strip():
            if self._tmp_kubeconfig is None:
                fd, path = tempfile.mkstemp(suffix=".yaml", prefix="uhld_kubeconfig_")
                os.write(fd, content.encode())
                os.close(fd)
                self._tmp_kubeconfig = path
                logger.debug("Kubernetes: wrote kubeconfig content to temp file %s", path)
            return self._tmp_kubeconfig
        return self._config.get("kubeconfig_path") or None

    def _cleanup_tmp(self) -> None:
        if self._tmp_kubeconfig and os.path.exists(self._tmp_kubeconfig):
            try:
                os.unlink(self._tmp_kubeconfig)
            except OSError:
                pass
            self._tmp_kubeconfig = None

    def _get_api_client(self):
        if self._api_client is None:
            self._load_config()
        return self._api_client

    def _core_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.CoreV1Api(self._get_api_client())

    async def _run(self, fn, *args, **kwargs):
        """Run a synchronous kubernetes client call in a thread pool."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        self._api_client = None
        self._summary_cache = None
        # If config changed, discard old temp file so it's recreated with new content
        self._cleanup_tmp()

    async def on_disable(self) -> None:
        if self._api_client is not None:
            self._api_client.rest_client.pool_manager.clear()
            self._api_client = None
        self._summary_cache = None
        self._cleanup_tmp()

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            v1 = self._core_v1()
            nodes = await self._run(v1.list_node)
            ready = sum(
                1 for n in nodes.items
                if any(c.type == "Ready" and c.status == "True" for c in (n.status.conditions or []))
            )
            total = len(nodes.items)
            return {"status": "ok", "message": f"{ready}/{total} node(s) ready"}
        except Exception as exc:
            self._api_client = None
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()

    async def _fetch_summary(self) -> dict:
        try:
            v1 = self._core_v1()
            nodes, pods = await asyncio.gather(
                self._run(v1.list_node),
                self._run(v1.list_pod_for_all_namespaces),
            )
            nodes_ready = sum(
                1 for n in nodes.items
                if any(c.type == "Ready" and c.status == "True" for c in (n.status.conditions or []))
            )
            pods_running = sum(1 for p in pods.items if (p.status.phase or "") == "Running")
            result = {
                "status": "ok",
                "nodes_ready": nodes_ready,
                "nodes_total": len(nodes.items),
                "pods_running": pods_running,
                "pods_total": len(pods.items),
            }
            self._summary_cache = result
            return result
        except Exception as exc:
            logger.error("Kubernetes fetch_summary error: %s", exc)
            self._api_client = None
            return {"status": "error", "message": str(exc)}

    # ── Data fetchers ─────────────────────────────────────────────────────────

    async def _fetch_nodes(self) -> list[dict]:
        v1 = self._core_v1()
        nodes = await self._run(v1.list_node)
        result = []
        for n in nodes.items:
            conditions = n.status.conditions or []
            ready = any(c.type == "Ready" and c.status == "True" for c in conditions)
            roles = sorted(
                k.replace("node-role.kubernetes.io/", "")
                for k in (n.metadata.labels or {})
                if k.startswith("node-role.kubernetes.io/")
            ) or ["worker"]
            version = (n.status.node_info.kubelet_version or "") if n.status.node_info else ""
            result.append({
                "name": n.metadata.name,
                "status": "Ready" if ready else "NotReady",
                "roles": roles,
                "version": version,
                "created": _ts(n.metadata.creation_timestamp),
                "internal_ip": next(
                    (a.address for a in (n.status.addresses or []) if a.type == "InternalIP"),
                    "",
                ),
                "os_image": n.status.node_info.os_image if n.status.node_info else "",
                "container_runtime": n.status.node_info.container_runtime_version if n.status.node_info else "",
                "conditions": [
                    {"type": c.type, "status": c.status, "reason": c.reason or ""}
                    for c in conditions
                ],
            })
        return result

    async def _fetch_pods(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            pods = await self._run(v1.list_namespaced_pod, namespace)
        else:
            pods = await self._run(v1.list_pod_for_all_namespaces)
        result = []
        for p in pods.items:
            containers = p.spec.containers or []
            statuses = p.status.container_statuses or []
            ready_count = sum(1 for s in statuses if s.ready)
            restarts = sum(s.restart_count for s in statuses)
            result.append({
                "name": p.metadata.name,
                "namespace": p.metadata.namespace,
                "ready": f"{ready_count}/{len(containers)}",
                "status": p.status.phase or "Unknown",
                "restarts": restarts,
                "node": p.spec.node_name or "",
                "ip": p.status.pod_ip or "",
                "created": _ts(p.metadata.creation_timestamp),
            })
        return result

    async def _fetch_namespaces(self) -> list[dict]:
        v1 = self._core_v1()
        nss = await self._run(v1.list_namespace)
        return [
            {
                "name": ns.metadata.name,
                "status": ns.status.phase or "Active",
                "created": _ts(ns.metadata.creation_timestamp),
            }
            for ns in nss.items
        ]

    # ── Workloads ─────────────────────────────────────────────────────────────

    def _apps_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.AppsV1Api(self._get_api_client())

    def _batch_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.BatchV1Api(self._get_api_client())

    def _networking_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.NetworkingV1Api(self._get_api_client())

    async def _fetch_deployments(self, namespace: str = "") -> list[dict]:
        apps = self._apps_v1()
        if namespace:
            items = (await self._run(apps.list_namespaced_deployment, namespace)).items
        else:
            items = (await self._run(apps.list_deployment_for_all_namespaces)).items
        result = []
        for d in items:
            desired = (d.spec.replicas or 0) if d.spec else 0
            s = d.status
            result.append({
                "name": d.metadata.name,
                "namespace": d.metadata.namespace,
                "ready": f"{s.ready_replicas or 0}/{desired}",
                "up_to_date": s.updated_replicas or 0,
                "available": s.available_replicas or 0,
                "created": _ts(d.metadata.creation_timestamp),
            })
        return result

    async def _fetch_statefulsets(self, namespace: str = "") -> list[dict]:
        apps = self._apps_v1()
        if namespace:
            items = (await self._run(apps.list_namespaced_stateful_set, namespace)).items
        else:
            items = (await self._run(apps.list_stateful_set_for_all_namespaces)).items
        result = []
        for s in items:
            desired = (s.spec.replicas or 0) if s.spec else 0
            result.append({
                "name": s.metadata.name,
                "namespace": s.metadata.namespace,
                "ready": f"{s.status.ready_replicas or 0}/{desired}",
                "current_revision": s.status.current_revision or "",
                "created": _ts(s.metadata.creation_timestamp),
            })
        return result

    async def _fetch_daemonsets(self, namespace: str = "") -> list[dict]:
        apps = self._apps_v1()
        if namespace:
            items = (await self._run(apps.list_namespaced_daemon_set, namespace)).items
        else:
            items = (await self._run(apps.list_daemon_set_for_all_namespaces)).items
        result = []
        for d in items:
            st = d.status
            result.append({
                "name": d.metadata.name,
                "namespace": d.metadata.namespace,
                "desired": st.desired_number_scheduled or 0,
                "current": st.current_number_scheduled or 0,
                "ready": st.number_ready or 0,
                "up_to_date": st.updated_number_scheduled or 0,
                "available": st.number_available or 0,
                "created": _ts(d.metadata.creation_timestamp),
            })
        return result

    async def _fetch_jobs(self, namespace: str = "") -> list[dict]:
        batch = self._batch_v1()
        if namespace:
            items = (await self._run(batch.list_namespaced_job, namespace)).items
        else:
            items = (await self._run(batch.list_job_for_all_namespaces)).items
        result = []
        for j in items:
            spec = j.spec
            st = j.status
            completions = (spec.completions or 1) if spec else 1
            succeeded = st.succeeded or 0
            failed = st.failed or 0
            duration = ""
            if st.start_time and st.completion_time:
                secs = int((st.completion_time - st.start_time).total_seconds())
                if secs < 60:
                    duration = f"{secs}s"
                elif secs < 3600:
                    duration = f"{secs // 60}m{secs % 60}s"
                else:
                    duration = f"{secs // 3600}h{(secs % 3600) // 60}m"
            job_status = "Complete" if st.completion_time else ("Failed" if failed else "Running")
            result.append({
                "name": j.metadata.name,
                "namespace": j.metadata.namespace,
                "status": job_status,
                "completions": f"{succeeded}/{completions}",
                "failed": failed,
                "duration": duration,
                "created": _ts(j.metadata.creation_timestamp),
            })
        return result

    async def _fetch_cronjobs(self, namespace: str = "") -> list[dict]:
        batch = self._batch_v1()
        if namespace:
            items = (await self._run(batch.list_namespaced_cron_job, namespace)).items
        else:
            items = (await self._run(batch.list_cron_job_for_all_namespaces)).items
        result = []
        for cj in items:
            spec = cj.spec
            st = cj.status
            active = len(st.active) if (st and st.active) else 0
            last_schedule = _ts(st.last_schedule_time) if (st and st.last_schedule_time) else ""
            result.append({
                "name": cj.metadata.name,
                "namespace": cj.metadata.namespace,
                "schedule": spec.schedule if spec else "",
                "last_schedule": last_schedule,
                "active": active,
                "suspended": bool(spec.suspend) if spec else False,
                "created": _ts(cj.metadata.creation_timestamp),
            })
        return result

    # ── Networking ────────────────────────────────────────────────────────────

    async def _fetch_services(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_service, namespace)).items
        else:
            items = (await self._run(v1.list_service_for_all_namespaces)).items
        result = []
        for svc in items:
            spec = svc.spec
            st = svc.status
            ports = []
            for p in (spec.ports or []):
                s = f"{p.port}/{p.protocol}"
                if p.node_port:
                    s += f" :{p.node_port}"
                ports.append(s)
            external_ips: list[str] = []
            if spec.type == "LoadBalancer" and st and st.load_balancer and st.load_balancer.ingress:
                for ing in st.load_balancer.ingress:
                    external_ips.append(ing.ip or ing.hostname or "")
            elif getattr(spec, "external_i_ps", None):
                external_ips = list(spec.external_i_ps)
            result.append({
                "name": svc.metadata.name,
                "namespace": svc.metadata.namespace,
                "type": spec.type or "ClusterIP",
                "cluster_ip": spec.cluster_ip or "",
                "external_ips": external_ips,
                "ports": ports,
                "created": _ts(svc.metadata.creation_timestamp),
            })
        return result

    async def _fetch_ingresses(self, namespace: str = "") -> list[dict]:
        net = self._networking_v1()
        if namespace:
            items = (await self._run(net.list_namespaced_ingress, namespace)).items
        else:
            items = (await self._run(net.list_ingress_for_all_namespaces)).items
        result = []
        for ing in items:
            spec = ing.spec
            st = ing.status
            hosts = [r.host for r in (spec.rules or []) if r.host] if spec else []
            address: list[str] = []
            if st and st.load_balancer and st.load_balancer.ingress:
                for lb in st.load_balancer.ingress:
                    address.append(lb.ip or lb.hostname or "")
            ing_class = ""
            if spec:
                ing_class = spec.ingress_class_name or ""
            if not ing_class:
                ing_class = (ing.metadata.annotations or {}).get("kubernetes.io/ingress.class", "")
            result.append({
                "name": ing.metadata.name,
                "namespace": ing.metadata.namespace,
                "class": ing_class,
                "hosts": hosts,
                "address": address,
                "created": _ts(ing.metadata.creation_timestamp),
            })
        return result

    # ── Storage ───────────────────────────────────────────────────────────────

    async def _fetch_persistentvolumes(self) -> list[dict]:
        v1 = self._core_v1()
        items = (await self._run(v1.list_persistent_volume)).items
        result = []
        for pv in items:
            spec = pv.spec
            st = pv.status
            capacity = (spec.capacity or {}).get("storage", "") if spec else ""
            claim = ""
            if spec and spec.claim_ref:
                claim = f"{spec.claim_ref.namespace}/{spec.claim_ref.name}"
            result.append({
                "name": pv.metadata.name,
                "capacity": capacity,
                "access_modes": spec.access_modes or [] if spec else [],
                "reclaim_policy": (spec.persistent_volume_reclaim_policy or "") if spec else "",
                "status": (st.phase or "") if st else "",
                "claim": claim,
                "storage_class": (spec.storage_class_name or "") if spec else "",
                "created": _ts(pv.metadata.creation_timestamp),
            })
        return result

    async def _fetch_persistentvolumeclaims(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_persistent_volume_claim, namespace)).items
        else:
            items = (await self._run(v1.list_persistent_volume_claim_for_all_namespaces)).items
        result = []
        for pvc in items:
            spec = pvc.spec
            st = pvc.status
            capacity = (st.capacity or {}).get("storage", "") if st else ""
            result.append({
                "name": pvc.metadata.name,
                "namespace": pvc.metadata.namespace,
                "status": (st.phase or "") if st else "",
                "volume": (spec.volume_name or "") if spec else "",
                "capacity": capacity,
                "access_modes": (spec.access_modes or []) if spec else [],
                "storage_class": (spec.storage_class_name or "") if spec else "",
                "created": _ts(pvc.metadata.creation_timestamp),
            })
        return result

    async def _fetch_configmaps(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_config_map, namespace)).items
        else:
            items = (await self._run(v1.list_config_map_for_all_namespaces)).items
        result = []
        for cm in items:
            result.append({
                "name": cm.metadata.name,
                "namespace": cm.metadata.namespace,
                "data_count": len(cm.data or {}),
                "created": _ts(cm.metadata.creation_timestamp),
            })
        return result

    async def _fetch_secrets(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_secret, namespace)).items
        else:
            items = (await self._run(v1.list_secret_for_all_namespaces)).items
        result = []
        for sec in items:
            result.append({
                "name": sec.metadata.name,
                "namespace": sec.metadata.namespace,
                "type": sec.type or "",
                "data_count": len(sec.data or {}),
                "created": _ts(sec.metadata.creation_timestamp),
            })
        return result

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.kubernetes.api import make_router
        return make_router(self)


def _ts(dt) -> str:
    """Convert a datetime (or None) to ISO string."""
    if dt is None:
        return ""
    try:
        return dt.isoformat()
    except Exception:
        return str(dt)
