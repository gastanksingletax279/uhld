from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import threading

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

    # ── Networking extras ─────────────────────────────────────────────────────

    def _custom_objects(self):
        from kubernetes import client  # type: ignore[import]
        return client.CustomObjectsApi(self._get_api_client())

    async def _fetch_httproutes(self, namespace: str = "") -> list[dict]:
        co = self._custom_objects()
        try:
            if namespace:
                raw = await self._run(
                    co.list_namespaced_custom_object,
                    "gateway.networking.k8s.io", "v1", namespace, "httproutes",
                )
            else:
                raw = await self._run(
                    co.list_cluster_custom_object,
                    "gateway.networking.k8s.io", "v1", "httproutes",
                )
        except Exception:
            return []
        result = []
        for item in raw.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            parents = [
                f"{p.get('name', '')}{'/' + p.get('sectionName', '') if p.get('sectionName') else ''}"
                for p in spec.get("parentRefs", [])
            ]
            hostnames = spec.get("hostnames", [])
            rules = len(spec.get("rules", []))
            result.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "hostnames": hostnames,
                "parents": parents,
                "rules": rules,
                "created": meta.get("creationTimestamp", ""),
            })
        return result

    async def _fetch_ingressclasses(self) -> list[dict]:
        net = self._networking_v1()
        try:
            items = (await self._run(net.list_ingress_class)).items
        except Exception:
            return []
        result = []
        for ic in items:
            spec = ic.spec
            params = None
            if spec and spec.parameters:
                params = f"{spec.parameters.api_group or ''}/{spec.parameters.kind}/{spec.parameters.name}"
            result.append({
                "name": ic.metadata.name,
                "controller": (spec.controller or "") if spec else "",
                "parameters": params or "",
                "is_default": (ic.metadata.annotations or {}).get(
                    "ingressclass.kubernetes.io/is-default-class", "false"
                ) == "true",
                "created": _ts(ic.metadata.creation_timestamp),
            })
        return result

    # ── Longhorn storage ──────────────────────────────────────────────────────

    async def _fetch_longhorn_volumes(self) -> list[dict]:
        co = self._custom_objects()
        try:
            raw = await self._run(
                co.list_cluster_custom_object,
                "longhorn.io", "v1beta2", "volumes",
            )
        except Exception:
            return []
        result = []
        for item in raw.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            st = item.get("status", {})
            result.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", "longhorn-system"),
                "state": st.get("state", ""),
                "robustness": st.get("robustness", ""),
                "size": spec.get("size", ""),
                "replicas": spec.get("numberOfReplicas", 0),
                "frontend": spec.get("frontend", ""),
                "created": meta.get("creationTimestamp", ""),
            })
        return result

    async def _fetch_longhorn_nodes(self) -> list[dict]:
        co = self._custom_objects()
        try:
            raw = await self._run(
                co.list_cluster_custom_object,
                "longhorn.io", "v1beta2", "nodes",
            )
        except Exception:
            return []
        result = []
        for item in raw.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            st = item.get("status", {})
            disks = st.get("diskStatus", {})
            disk_count = len(disks)
            schedulable = spec.get("allowScheduling", True)
            conditions = {c.get("type"): c.get("status") for c in st.get("conditions", [])}
            ready = conditions.get("Ready", "False") == "True"
            result.append({
                "name": meta.get("name", ""),
                "ready": ready,
                "schedulable": schedulable,
                "disk_count": disk_count,
                "created": meta.get("creationTimestamp", ""),
            })
        return result

    # ── YAML get / apply ──────────────────────────────────────────────────────

    async def _get_resource_yaml(self, kind: str, namespace: str, name: str) -> str:
        import yaml  # type: ignore[import]
        v1 = self._core_v1()
        apps = self._apps_v1()
        batch = self._batch_v1()
        net = self._networking_v1()

        _kind = kind.lower()
        fetchers: dict[str, any] = {
            "pod":         lambda: v1.read_namespaced_pod(name, namespace),
            "deployment":  lambda: apps.read_namespaced_deployment(name, namespace),
            "statefulset": lambda: apps.read_namespaced_stateful_set(name, namespace),
            "daemonset":   lambda: apps.read_namespaced_daemon_set(name, namespace),
            "service":     lambda: v1.read_namespaced_service(name, namespace),
            "configmap":   lambda: v1.read_namespaced_config_map(name, namespace),
            "secret":      lambda: v1.read_namespaced_secret(name, namespace),
            "ingress":     lambda: net.read_namespaced_ingress(name, namespace),
            "persistentvolumeclaim": lambda: v1.read_namespaced_persistent_volume_claim(name, namespace),
            "persistentvolume": lambda: v1.read_persistent_volume(name),
            "namespace":   lambda: v1.read_namespace(name),
        }
        if _kind not in fetchers:
            raise ValueError(f"Unsupported kind: {kind}")
        obj = await self._run(fetchers[_kind])
        from kubernetes import client as k8s_client  # type: ignore[import]
        api_client = self._get_api_client()
        raw = api_client.sanitize_for_serialization(obj)
        # Strip managed fields for cleaner editing
        if "metadata" in raw and "managedFields" in raw["metadata"]:
            del raw["metadata"]["managedFields"]
        return yaml.dump(raw, default_flow_style=False, allow_unicode=True)

    async def _apply_resource_yaml(self, yaml_str: str) -> dict:
        import yaml  # type: ignore[import]
        body = yaml.safe_load(yaml_str)
        if not isinstance(body, dict):
            raise ValueError("YAML must be a mapping")
        kind = body.get("kind", "")
        namespace = (body.get("metadata") or {}).get("namespace", "")
        name = (body.get("metadata") or {}).get("name", "")
        if not kind or not name:
            raise ValueError("YAML must have kind and metadata.name")

        from kubernetes import client as k8s_client  # type: ignore[import]
        _kind = kind.lower()
        v1 = self._core_v1()
        apps = self._apps_v1()
        batch = self._batch_v1()
        net = self._networking_v1()

        patchers: dict[str, any] = {
            "pod":         lambda: v1.patch_namespaced_pod(name, namespace, body),
            "deployment":  lambda: apps.patch_namespaced_deployment(name, namespace, body),
            "statefulset": lambda: apps.patch_namespaced_stateful_set(name, namespace, body),
            "daemonset":   lambda: apps.patch_namespaced_daemon_set(name, namespace, body),
            "service":     lambda: v1.patch_namespaced_service(name, namespace, body),
            "configmap":   lambda: v1.patch_namespaced_config_map(name, namespace, body),
            "secret":      lambda: v1.patch_namespaced_secret(name, namespace, body),
            "ingress":     lambda: net.patch_namespaced_ingress(name, namespace, body),
            "persistentvolumeclaim": lambda: v1.patch_namespaced_persistent_volume_claim(name, namespace, body),
            "persistentvolume": lambda: v1.patch_persistent_volume(name, body),
            "namespace":   lambda: v1.patch_namespace(name, body),
        }
        if _kind not in patchers:
            raise ValueError(f"Unsupported kind: {kind}")
        await self._run(patchers[_kind])
        return {"ok": True, "kind": kind, "name": name}

    # ── Actions ───────────────────────────────────────────────────────────────

    async def _fetch_pod_logs(self, namespace: str, pod: str, container: str = "", tail: int = 200) -> str:
        v1 = self._core_v1()
        kwargs: dict = {"name": pod, "namespace": namespace, "tail_lines": tail, "timestamps": False}
        if container:
            kwargs["container"] = container
        try:
            return await self._run(v1.read_namespaced_pod_log, **kwargs) or ""
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc

    async def _fetch_pod_containers(self, namespace: str, pod: str) -> list[str]:
        v1 = self._core_v1()
        p = await self._run(v1.read_namespaced_pod, pod, namespace)
        return [c.name for c in (p.spec.containers or [])]

    async def _restart_pod(self, namespace: str, pod: str) -> None:
        from kubernetes import client  # type: ignore[import]
        v1 = self._core_v1()
        await self._run(v1.delete_namespaced_pod, pod, namespace, body=client.V1DeleteOptions(grace_period_seconds=0))

    async def _exec_pod_shell(self, websocket, namespace: str, pod: str, container: str = "", command: str = "/bin/sh") -> None:
        """Bridge a FastAPI WebSocket to a Kubernetes pod exec stream."""
        from kubernetes.stream import stream  # type: ignore[import]
        from kubernetes.stream.ws_client import STDOUT_CHANNEL, STDERR_CHANNEL  # type: ignore[import]
        loop = asyncio.get_event_loop()
        cmd = [command]
        v1 = self._core_v1()
        resp = await loop.run_in_executor(None, lambda: stream(
            v1.connect_get_namespaced_pod_exec,
            pod, namespace,
            command=cmd,
            container=container or None,
            stderr=True, stdin=True, stdout=True, tty=True,
            _preload_content=False,
        ))

        output_q: asyncio.Queue[str | None] = asyncio.Queue()

        def _read_loop() -> None:
            # Every peek/read_channel method on WSClient calls update() internally,
            # which triggers a second WebSocket recv. On clusters that negotiate
            # per-message deflate (RSV1 set), that second recv raises
            # WebSocketProtocolException("rsv is not implemented, yet").
            #
            # Fix: call update() exactly ONCE per iteration, then drain _channels
            # directly — bypassing every kubernetes client method that would call
            # update() again.
            channels: dict = getattr(resp, "_channels", {})
            try:
                while resp.is_open():
                    try:
                        resp.update(timeout=1)
                    except Exception as exc:
                        logger.debug("k8s exec update error: %s", exc)
                        break
                    # Pop data directly from the internal buffer; never call
                    # peek_channel / read_channel / peek_stdout / read_stdout etc.
                    for ch in (STDOUT_CHANNEL, STDERR_CHANNEL):
                        data = channels.pop(ch, None)
                        if data:
                            loop.call_soon_threadsafe(output_q.put_nowait, data)
            except Exception as exc:
                logger.debug("k8s exec read_loop ended: %s", exc)
            finally:
                loop.call_soon_threadsafe(output_q.put_nowait, None)

        t = threading.Thread(target=_read_loop, daemon=True)
        t.start()

        async def _send_loop() -> None:
            while True:
                data = await output_q.get()
                if data is None:
                    break
                try:
                    await websocket.send_text(data)
                except Exception:
                    break
            # Pod session ended — close the WebSocket so _recv_loop's iter_text
            # unblocks and asyncio.gather can complete, sending a close frame
            # to the frontend and triggering onclose there.
            try:
                await websocket.close()
            except Exception:
                pass

        async def _recv_loop() -> None:
            try:
                from starlette.websockets import WebSocketDisconnect
                async for msg in websocket.iter_text():
                    await loop.run_in_executor(None, resp.write_stdin, msg)
            except Exception:
                pass
            finally:
                resp.close()

        await asyncio.gather(_send_loop(), _recv_loop())
        t.join(timeout=2)

    async def _scale_deployment(self, namespace: str, name: str, replicas: int) -> dict:
        apps = self._apps_v1()
        patch = {"spec": {"replicas": replicas}}
        result = await self._run(apps.patch_namespaced_deployment_scale, name, namespace, patch)
        spec = result.spec
        return {"replicas": (spec.replicas or 0) if spec else replicas}

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
