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
            _role_prefix = "node-role.kubernetes.io/"
            roles = sorted(
                k[len(_role_prefix):]
                for k in (n.metadata.labels or {})
                if k.startswith(_role_prefix)
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
                "unschedulable": bool(n.spec.unschedulable) if n.spec else False,
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

    def _autoscaling_v2(self):
        from kubernetes import client  # type: ignore[import]
        return client.AutoscalingV2Api(self._get_api_client())

    def _policy_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.PolicyV1Api(self._get_api_client())

    def _scheduling_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.SchedulingV1Api(self._get_api_client())

    def _storage_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.StorageV1Api(self._get_api_client())

    def _apiextensions_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.ApiextensionsV1Api(self._get_api_client())

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

    async def _fetch_secret_data(self, namespace: str, name: str) -> dict:
        """Return decoded secret data with key names and base64-decoded values."""
        import base64
        v1 = self._core_v1()
        sec = await self._run(v1.read_namespaced_secret, name, namespace)
        decoded: dict[str, str] = {}
        for key, val in (sec.data or {}).items():
            if val is None:
                decoded[key] = ""
            else:
                try:
                    decoded[key] = base64.b64decode(val).decode("utf-8", errors="replace")
                except Exception:
                    decoded[key] = f"<binary: {len(val)} bytes>"
        return {"type": sec.type or "", "data": decoded}

    async def _fetch_certificates(self, namespace: str = "") -> list[dict]:
        """Fetch cert-manager Certificate resources. Returns [] if CRDs not installed."""
        import base64
        co = self._custom_objects()
        try:
            if namespace:
                raw = await self._run(
                    co.list_namespaced_custom_object,
                    "cert-manager.io", "v1", namespace, "certificates",
                )
            else:
                raw = await self._run(
                    co.list_cluster_custom_object,
                    "cert-manager.io", "v1", "certificates",
                )
        except Exception:
            return []
        result = []
        for item in raw.get("items", []):
            meta = item.get("metadata", {})
            spec = item.get("spec", {})
            status = item.get("status", {})
            conditions = status.get("conditions", [])
            ready_cond = next((c for c in conditions if c.get("type") == "Ready"), None)
            ready = ready_cond.get("status") == "True" if ready_cond else False
            not_before = status.get("notBefore", "")
            not_after = status.get("notAfter", "")
            renewal_time = status.get("renewalTime", "")
            result.append({
                "name": meta.get("name", ""),
                "namespace": meta.get("namespace", ""),
                "secret_name": spec.get("secretName", ""),
                "dns_names": spec.get("dnsNames", []),
                "issuer_ref": spec.get("issuerRef", {}).get("name", ""),
                "issuer_kind": spec.get("issuerRef", {}).get("kind", "Issuer"),
                "ready": ready,
                "not_before": not_before,
                "not_after": not_after,
                "renewal_time": renewal_time,
                "created": meta.get("creationTimestamp", ""),
            })
        return result

    async def _fetch_events(self, namespace: str = "", warning_only: bool = False) -> list[dict]:
        """Fetch cluster events, optionally filtered to Warning type."""
        v1 = self._core_v1()
        field_selector = "type=Warning" if warning_only else ""
        kwargs: dict = {}
        if field_selector:
            kwargs["field_selector"] = field_selector
        if namespace:
            items = (await self._run(v1.list_namespaced_event, namespace, **kwargs)).items
        else:
            items = (await self._run(v1.list_event_for_all_namespaces, **kwargs)).items
        result = []
        for ev in items:
            result.append({
                "name": ev.metadata.name,
                "namespace": ev.metadata.namespace or "",
                "type": ev.type or "",
                "reason": ev.reason or "",
                "message": ev.message or "",
                "object": f"{ev.involved_object.kind}/{ev.involved_object.name}" if ev.involved_object else "",
                "count": ev.count or 1,
                "first_time": _ts(ev.first_timestamp),
                "last_time": _ts(ev.last_timestamp),
            })
        # Sort by last_time descending
        result.sort(key=lambda e: e["last_time"], reverse=True)
        return result[:200]

    async def _fetch_overview(self) -> dict:
        """Aggregate cluster overview: node summary, workload counts, recent warning events."""
        v1 = self._core_v1()
        apps = self._apps_v1()
        batch = self._batch_v1()
        nodes_resp, pods_resp, deploys_resp, sts_resp, ds_resp, events_resp = await asyncio.gather(
            self._run(v1.list_node),
            self._run(v1.list_pod_for_all_namespaces),
            self._run(apps.list_deployment_for_all_namespaces),
            self._run(apps.list_stateful_set_for_all_namespaces),
            self._run(apps.list_daemon_set_for_all_namespaces),
            self._run(v1.list_event_for_all_namespaces, field_selector="type=Warning"),
            return_exceptions=True,
        )

        # Nodes
        nodes: list[dict] = []
        if not isinstance(nodes_resp, Exception):
            for n in nodes_resp.items:
                conds = n.status.conditions or []
                ready = any(c.type == "Ready" and c.status == "True" for c in conds)
                _role_prefix = "node-role.kubernetes.io/"
                roles = sorted(
                    k[len(_role_prefix):]
                    for k in (n.metadata.labels or {})
                    if k.startswith(_role_prefix)
                ) or ["worker"]
                allocatable = n.status.allocatable or {}
                nodes.append({
                    "name": n.metadata.name,
                    "status": "Ready" if ready else "NotReady",
                    "roles": roles,
                    "cpu": allocatable.get("cpu", ""),
                    "memory": allocatable.get("memory", ""),
                })

        # Pods by phase
        pod_phases: dict[str, int] = {}
        if not isinstance(pods_resp, Exception):
            for p in pods_resp.items:
                phase = p.status.phase or "Unknown"
                pod_phases[phase] = pod_phases.get(phase, 0) + 1

        # Workload counts
        def _count(resp, attr: str) -> dict:
            if isinstance(resp, Exception):
                return {"total": 0, "ready": 0}
            items = resp.items
            total = len(items)
            ready = 0
            for obj in items:
                st = obj.status
                if hasattr(st, "ready_replicas") and (st.ready_replicas or 0) == (getattr(st, "replicas", 0) or 0) and total > 0:
                    ready += 1
            return {"total": total, "ready": ready}

        workloads = {
            "deployments": _count(deploys_resp, "ready_replicas"),
            "statefulsets": _count(sts_resp, "ready_replicas"),
            "daemonsets": _count(ds_resp, "number_ready"),
        }

        # Recent warning events
        events: list[dict] = []
        if not isinstance(events_resp, Exception):
            for ev in sorted(events_resp.items, key=lambda e: _ts(e.last_timestamp), reverse=True)[:30]:
                events.append({
                    "namespace": ev.metadata.namespace or "",
                    "type": ev.type or "",
                    "reason": ev.reason or "",
                    "message": ev.message or "",
                    "object": f"{ev.involved_object.kind}/{ev.involved_object.name}" if ev.involved_object else "",
                    "count": ev.count or 1,
                    "last_time": _ts(ev.last_timestamp),
                })

        return {
            "nodes": nodes,
            "pod_phases": pod_phases,
            "workloads": workloads,
            "events": events,
        }

    async def _fetch_replicasets(self, namespace: str = "") -> list[dict]:
        apps = self._apps_v1()
        if namespace:
            items = (await self._run(apps.list_namespaced_replica_set, namespace)).items
        else:
            items = (await self._run(apps.list_replica_set_for_all_namespaces)).items
        result = []
        for rs in items:
            spec = rs.spec
            st = rs.status
            desired = (spec.replicas or 0) if spec else 0
            ready = (st.ready_replicas or 0) if st else 0
            # Determine owner (e.g. Deployment name)
            owner = ""
            for ref in (rs.metadata.owner_references or []):
                if ref.kind == "Deployment":
                    owner = ref.name
                    break
            result.append({
                "name": rs.metadata.name,
                "namespace": rs.metadata.namespace,
                "desired": desired,
                "ready": ready,
                "owner": owner,
                "created": _ts(rs.metadata.creation_timestamp),
            })
        return result

    async def _fetch_hpas(self, namespace: str = "") -> list[dict]:
        auto = self._autoscaling_v2()
        if namespace:
            items = (await self._run(auto.list_namespaced_horizontal_pod_autoscaler, namespace)).items
        else:
            items = (await self._run(auto.list_horizontal_pod_autoscaler_for_all_namespaces)).items
        result = []
        for hpa in items:
            spec = hpa.spec
            st = hpa.status
            target = ""
            if spec and spec.scale_target_ref:
                target = f"{spec.scale_target_ref.kind}/{spec.scale_target_ref.name}"
            min_r = (spec.min_replicas or 1) if spec else 1
            max_r = (spec.max_replicas or 0) if spec else 0
            current = (st.current_replicas or 0) if st else 0
            desired = (st.desired_replicas or 0) if st else 0
            cpu_pct: int | None = None
            for m in (st.current_metrics or []) if st else []:
                if m.type == "Resource" and m.resource and m.resource.name == "cpu":
                    if m.resource.current and m.resource.current.average_utilization is not None:
                        cpu_pct = m.resource.current.average_utilization
                        break
            result.append({
                "name": hpa.metadata.name,
                "namespace": hpa.metadata.namespace,
                "target": target,
                "min_replicas": min_r,
                "max_replicas": max_r,
                "current_replicas": current,
                "desired_replicas": desired,
                "cpu_pct": cpu_pct,
                "created": _ts(hpa.metadata.creation_timestamp),
            })
        return result

    async def _fetch_endpoints(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_endpoints, namespace)).items
        else:
            items = (await self._run(v1.list_endpoints_for_all_namespaces)).items
        result = []
        for ep in items:
            address_count = 0
            port_strs: list[str] = []
            for subset in (ep.subsets or []):
                address_count += len(subset.addresses or [])
                for p in (subset.ports or []):
                    s = f"{p.port}/{p.protocol}"
                    if s not in port_strs:
                        port_strs.append(s)
            result.append({
                "name": ep.metadata.name,
                "namespace": ep.metadata.namespace,
                "addresses": address_count,
                "ports": port_strs,
                "created": _ts(ep.metadata.creation_timestamp),
            })
        return result

    async def _fetch_networkpolicies(self, namespace: str = "") -> list[dict]:
        net = self._networking_v1()
        if namespace:
            items = (await self._run(net.list_namespaced_network_policy, namespace)).items
        else:
            items = (await self._run(net.list_network_policy_for_all_namespaces)).items
        result = []
        for np in items:
            spec = np.spec
            selector_labels: dict = {}
            if spec and spec.pod_selector and spec.pod_selector.match_labels:
                selector_labels = dict(spec.pod_selector.match_labels)
            pod_selector = ", ".join(f"{k}={v}" for k, v in selector_labels.items()) if selector_labels else "<all>"
            policy_types = list(spec.policy_types or []) if spec else []
            result.append({
                "name": np.metadata.name,
                "namespace": np.metadata.namespace,
                "pod_selector": pod_selector,
                "policy_types": policy_types,
                "created": _ts(np.metadata.creation_timestamp),
            })
        return result

    async def _fetch_resourcequotas(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_resource_quota, namespace)).items
        else:
            items = (await self._run(v1.list_resource_quota_for_all_namespaces)).items
        result = []
        for rq in items:
            hard = dict(rq.status.hard or {}) if rq.status else {}
            used = dict(rq.status.used or {}) if rq.status else {}
            limits = [
                {"resource": k, "hard": hard.get(k, ""), "used": used.get(k, "")}
                for k in sorted(hard.keys())
            ]
            result.append({
                "name": rq.metadata.name,
                "namespace": rq.metadata.namespace,
                "limits": limits,
                "created": _ts(rq.metadata.creation_timestamp),
            })
        return result

    async def _fetch_limitranges(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_limit_range, namespace)).items
        else:
            items = (await self._run(v1.list_limit_range_for_all_namespaces)).items
        result = []
        for lr in items:
            limits_count = len((lr.spec.limits or []) if lr.spec else [])
            limit_types = sorted({lim.type for lim in (lr.spec.limits or []) if lim.type} if lr.spec else [])
            result.append({
                "name": lr.metadata.name,
                "namespace": lr.metadata.namespace,
                "limits_count": limits_count,
                "limit_types": limit_types,
                "created": _ts(lr.metadata.creation_timestamp),
            })
        return result

    async def _fetch_priorityclasses(self) -> list[dict]:
        sched = self._scheduling_v1()
        items = (await self._run(sched.list_priority_class)).items
        result = []
        for pc in items:
            result.append({
                "name": pc.metadata.name,
                "value": pc.value or 0,
                "global_default": bool(pc.global_default),
                "preemption_policy": pc.preemption_policy or "PreemptLowerPriority",
                "description": pc.description or "",
                "created": _ts(pc.metadata.creation_timestamp),
            })
        result.sort(key=lambda x: x["value"], reverse=True)
        return result

    async def _fetch_pdbs(self, namespace: str = "") -> list[dict]:
        pol = self._policy_v1()
        if namespace:
            items = (await self._run(pol.list_namespaced_pod_disruption_budget, namespace)).items
        else:
            items = (await self._run(pol.list_pod_disruption_budget_for_all_namespaces)).items
        result = []
        for pdb in items:
            spec = pdb.spec
            st = pdb.status
            min_available = str(spec.min_available) if spec and spec.min_available is not None else ""
            max_unavailable = str(spec.max_unavailable) if spec and spec.max_unavailable is not None else ""
            result.append({
                "name": pdb.metadata.name,
                "namespace": pdb.metadata.namespace,
                "min_available": min_available,
                "max_unavailable": max_unavailable,
                "current_healthy": (st.current_healthy or 0) if st else 0,
                "desired_healthy": (st.desired_healthy or 0) if st else 0,
                "disruptions_allowed": (st.disruptions_allowed or 0) if st else 0,
                "expected_pods": (st.expected_pods or 0) if st else 0,
                "created": _ts(pdb.metadata.creation_timestamp),
            })
        return result

    async def _fetch_storageclasses(self) -> list[dict]:
        stor = self._storage_v1()
        items = (await self._run(stor.list_storage_class)).items
        result = []
        for sc in items:
            is_default = (sc.metadata.annotations or {}).get(
                "storageclass.kubernetes.io/is-default-class", "false"
            ) == "true"
            result.append({
                "name": sc.metadata.name,
                "provisioner": sc.provisioner or "",
                "reclaim_policy": sc.reclaim_policy or "Delete",
                "volume_binding_mode": sc.volume_binding_mode or "Immediate",
                "allow_volume_expansion": bool(sc.allow_volume_expansion),
                "is_default": is_default,
                "created": _ts(sc.metadata.creation_timestamp),
            })
        return result

    async def _fetch_crds(self) -> list[dict]:
        ext = self._apiextensions_v1()
        try:
            items = (await self._run(ext.list_custom_resource_definition)).items
        except Exception:
            return []
        result = []
        for crd in items:
            spec = crd.spec
            versions = [v.name for v in (spec.versions or [])] if spec else []
            result.append({
                "name": crd.metadata.name,
                "group": (spec.group or "") if spec else "",
                "scope": (spec.scope or "") if spec else "",
                "kind": (spec.names.kind or "") if (spec and spec.names) else "",
                "versions": versions,
                "created": _ts(crd.metadata.creation_timestamp),
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

    async def _fetch_pod_detail(self, namespace: str, pod: str) -> dict:
        """Fetch full detail for a single pod: properties, containers, volumes, events."""
        v1 = self._core_v1()
        p = await self._run(v1.read_namespaced_pod, pod, namespace)

        def _qty(d) -> dict:
            if not d:
                return {}
            return {k: str(v) for k, v in (d.items() if hasattr(d, "items") else {})}

        def _container_info(c, status) -> dict:
            state = "Unknown"
            ready = False
            restarts = 0
            if status:
                ready = bool(status.ready)
                restarts = int(status.restart_count or 0)
                s = status.state
                if s:
                    if s.running:
                        state = "Running"
                    elif s.waiting:
                        state = f"Waiting ({s.waiting.reason or ''})"
                    elif s.terminated:
                        state = f"Terminated ({s.terminated.reason or ''})"
            res = c.resources or {}
            return {
                "name": c.name,
                "image": c.image or "",
                "state": state,
                "ready": ready,
                "restarts": restarts,
                "resources": {
                    "requests": _qty(getattr(res, "requests", None)),
                    "limits": _qty(getattr(res, "limits", None)),
                },
                "ports": [
                    {"name": pp.name or "", "container_port": pp.container_port, "protocol": pp.protocol or "TCP"}
                    for pp in (c.ports or [])
                ],
                "env_count": len(c.env or []),
            }

        def _volume_info(v) -> tuple[str, str]:
            if v.config_map:
                return "ConfigMap", v.config_map.name or ""
            if v.secret:
                return "Secret", v.secret.secret_name or ""
            if v.persistent_volume_claim:
                rw = "ro" if v.persistent_volume_claim.read_only else "rw"
                return "PVC", f"{v.persistent_volume_claim.claim_name} ({rw})"
            if v.empty_dir:
                return "EmptyDir", v.empty_dir.medium or "default"
            if v.host_path:
                return "HostPath", v.host_path.path or ""
            if v.downward_api:
                return "DownwardAPI", ""
            if v.projected:
                return "Projected", ""
            if v.nfs:
                return "NFS", f"{v.nfs.server}:{v.nfs.path}"
            return "Volume", ""

        init_statuses = {s.name: s for s in (p.status.init_container_statuses or [])}
        container_statuses = {s.name: s for s in (p.status.container_statuses or [])}
        init_containers = [_container_info(c, init_statuses.get(c.name)) for c in (p.spec.init_containers or [])]
        containers = [_container_info(c, container_statuses.get(c.name)) for c in (p.spec.containers or [])]

        volumes: list[dict] = []
        for vol in (p.spec.volumes or []):
            vtype, vsource = _volume_info(vol)
            volumes.append({"name": vol.name, "type": vtype, "source": vsource})

        evts = await self._run(
            v1.list_namespaced_event, namespace,
            field_selector=f"involvedObject.name={pod},involvedObject.kind=Pod",
        )
        events = sorted(
            [
                {
                    "type": e.type or "",
                    "reason": e.reason or "",
                    "message": e.message or "",
                    "count": e.count or 1,
                    "last_time": _ts(e.last_timestamp),
                }
                for e in evts.items
            ],
            key=lambda x: x["last_time"],
            reverse=True,
        )
        annotations = {
            k: v
            for k, v in (p.metadata.annotations or {}).items()
            if not k.startswith("kubectl.kubernetes.io/last-applied")
        }
        return {
            "name": p.metadata.name,
            "namespace": p.metadata.namespace,
            "node": p.spec.node_name or "",
            "ip": p.status.pod_ip or "",
            "host_ip": p.status.host_ip or "",
            "phase": p.status.phase or "Unknown",
            "qos_class": p.status.qos_class or "",
            "service_account": p.spec.service_account_name or "",
            "priority": p.spec.priority or 0,
            "created": _ts(p.metadata.creation_timestamp),
            "labels": dict(p.metadata.labels or {}),
            "annotations": annotations,
            "init_containers": init_containers,
            "containers": containers,
            "volumes": volumes,
            "events": events,
        }

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

    async def _restart_workload(self, kind: str, namespace: str, name: str) -> dict:
        """Trigger a rollout restart by patching the pod template annotation."""
        import datetime
        apps = self._apps_v1()
        now = datetime.datetime.utcnow().isoformat() + "Z"
        patch = {"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": now}}}}}
        _kind = kind.lower()
        if _kind == "deployment":
            await self._run(apps.patch_namespaced_deployment, name, namespace, patch)
        elif _kind == "statefulset":
            await self._run(apps.patch_namespaced_stateful_set, name, namespace, patch)
        elif _kind == "daemonset":
            await self._run(apps.patch_namespaced_daemon_set, name, namespace, patch)
        else:
            raise ValueError(f"Unsupported workload kind for restart: {kind}")
        return {"ok": True, "kind": kind, "name": name}

    async def _delete_namespace(self, name: str) -> dict:
        from kubernetes import client  # type: ignore[import]
        v1 = self._core_v1()
        await self._run(v1.delete_namespace, name, body=client.V1DeleteOptions())
        return {"ok": True, "name": name}

    # ── Node maintenance ──────────────────────────────────────────────────────

    async def _cordon_node(self, name: str) -> dict:
        v1 = self._core_v1()
        await self._run(v1.patch_node, name, {"spec": {"unschedulable": True}})
        return {"ok": True}

    async def _uncordon_node(self, name: str) -> dict:
        v1 = self._core_v1()
        await self._run(v1.patch_node, name, {"spec": {"unschedulable": False}})
        return {"ok": True}

    async def _drain_node(self, name: str) -> dict:
        """Cordon the node then evict all evictable (non-DaemonSet, non-mirror) pods."""
        await self._cordon_node(name)
        v1 = self._core_v1()
        pods_resp = await self._run(
            v1.list_pod_for_all_namespaces,
            field_selector=f"spec.nodeName={name}",
        )
        evicted: list[str] = []
        skipped: list[str] = []
        errors: list[str] = []
        for pod in pods_resp.items:
            pname = pod.metadata.name
            ns = pod.metadata.namespace
            owners = pod.metadata.owner_references or []
            if any(o.kind == "DaemonSet" for o in owners):
                skipped.append(pname)
                continue
            if "kubernetes.io/config.mirror" in (pod.metadata.annotations or {}):
                skipped.append(pname)
                continue
            try:
                from kubernetes.client import V1Eviction, V1ObjectMeta  # type: ignore[import]
                eviction = V1Eviction(metadata=V1ObjectMeta(name=pname, namespace=ns))
                await self._run(v1.create_namespaced_pod_eviction, pname, ns, eviction)
                evicted.append(pname)
            except Exception as exc:
                errors.append(f"{pname}: {exc}")
        return {"ok": True, "evicted": evicted, "skipped": skipped, "errors": errors}

    async def _delete_node(self, name: str) -> dict:
        from kubernetes import client  # type: ignore[import]
        v1 = self._core_v1()
        await self._run(v1.delete_node, name, body=client.V1DeleteOptions())
        return {"ok": True}

    # ── Access control ────────────────────────────────────────────────────────

    def _rbac_v1(self):
        from kubernetes import client  # type: ignore[import]
        return client.RbacAuthorizationV1Api(self._get_api_client())

    async def _fetch_serviceaccounts(self, namespace: str = "") -> list[dict]:
        v1 = self._core_v1()
        if namespace:
            items = (await self._run(v1.list_namespaced_service_account, namespace)).items
        else:
            items = (await self._run(v1.list_service_account_for_all_namespaces)).items
        return [
            {
                "name": sa.metadata.name,
                "namespace": sa.metadata.namespace,
                "secrets": len(sa.secrets or []),
                "created": _ts(sa.metadata.creation_timestamp),
            }
            for sa in items
        ]

    async def _fetch_roles(self, namespace: str = "") -> list[dict]:
        rbac = self._rbac_v1()
        if namespace:
            items = (await self._run(rbac.list_namespaced_role, namespace)).items
        else:
            items = (await self._run(rbac.list_role_for_all_namespaces)).items
        return [
            {
                "name": r.metadata.name,
                "namespace": r.metadata.namespace,
                "rules": len(r.rules or []),
                "created": _ts(r.metadata.creation_timestamp),
            }
            for r in items
        ]

    async def _fetch_clusterroles(self) -> list[dict]:
        rbac = self._rbac_v1()
        items = (await self._run(rbac.list_cluster_role)).items
        return [
            {
                "name": r.metadata.name,
                "rules": len(r.rules or []),
                "aggregation": bool(r.aggregation_rule),
                "created": _ts(r.metadata.creation_timestamp),
            }
            for r in items
        ]

    async def _fetch_rolebindings(self, namespace: str = "") -> list[dict]:
        rbac = self._rbac_v1()
        if namespace:
            items = (await self._run(rbac.list_namespaced_role_binding, namespace)).items
        else:
            items = (await self._run(rbac.list_role_binding_for_all_namespaces)).items
        return [
            {
                "name": rb.metadata.name,
                "namespace": rb.metadata.namespace,
                "role_ref": f"{rb.role_ref.kind}/{rb.role_ref.name}" if rb.role_ref else "",
                "subjects": len(rb.subjects or []),
                "created": _ts(rb.metadata.creation_timestamp),
            }
            for rb in items
        ]

    async def _fetch_clusterrolebindings(self) -> list[dict]:
        rbac = self._rbac_v1()
        items = (await self._run(rbac.list_cluster_role_binding)).items
        return [
            {
                "name": rb.metadata.name,
                "role_ref": f"{rb.role_ref.kind}/{rb.role_ref.name}" if rb.role_ref else "",
                "subjects": len(rb.subjects or []),
                "created": _ts(rb.metadata.creation_timestamp),
            }
            for rb in items
        ]

    # ── Helm releases ─────────────────────────────────────────────────────────

    async def _fetch_helm_releases(self, namespace: str = "") -> list[dict]:
        """List Helm v3 releases by reading the release secrets (owner=helm)."""
        import base64, gzip, json as _json
        v1 = self._core_v1()
        label_selector = "owner=helm,status=deployed"
        try:
            if namespace:
                items = (await self._run(
                    v1.list_namespaced_secret, namespace,
                    label_selector=label_selector,
                )).items
            else:
                items = (await self._run(
                    v1.list_secret_for_all_namespaces,
                    label_selector=label_selector,
                )).items
        except Exception:
            return []

        result = []
        for sec in items:
            labels = sec.metadata.labels or {}
            release_data: dict = {}
            raw = (sec.data or {}).get("release")
            if raw:
                try:
                    # Helm stores: base64(gzip(base64(json)))
                    decoded = base64.b64decode(raw)
                    decoded2 = base64.b64decode(decoded)
                    release_data = _json.loads(gzip.decompress(decoded2))
                except Exception:
                    pass

            chart_meta = release_data.get("chart", {}).get("metadata", {})
            info = release_data.get("info", {})
            result.append({
                "name": labels.get("name", sec.metadata.name.replace("sh.helm.release.v1.", "").rsplit(".", 1)[0]),
                "namespace": sec.metadata.namespace,
                "chart": chart_meta.get("name", ""),
                "chart_version": chart_meta.get("version", ""),
                "app_version": chart_meta.get("appVersion", ""),
                "revision": int(labels.get("version", "1")),
                "status": labels.get("status", ""),
                "description": info.get("description", ""),
                "first_deployed": info.get("first_deployed", ""),
                "last_deployed": info.get("last_deployed", ""),
            })

        result.sort(key=lambda r: (r["namespace"], r["name"]))
        return result

    # ── Realtime log streaming ─────────────────────────────────────────────────

    async def _stream_pod_logs(self, websocket, namespace: str, pod: str, container: str = "") -> None:
        """Stream pod logs to a WebSocket in real time using a background thread."""
        await websocket.accept()
        v1 = self._core_v1()
        loop = asyncio.get_event_loop()
        kwargs: dict = {"follow": True, "_preload_content": False, "timestamps": True}
        if container:
            kwargs["container"] = container
        try:
            resp = await loop.run_in_executor(None, lambda: v1.read_namespaced_pod_log(pod, namespace, **kwargs))
        except Exception as exc:
            try:
                await websocket.send_text(f"Error opening log stream: {exc}\n")
                await websocket.close()
            except Exception:
                pass
            return

        output_q: asyncio.Queue[str | None] = asyncio.Queue()
        stop_event = threading.Event()

        def _read_thread() -> None:
            try:
                for chunk in resp.stream(amt=4096):
                    if stop_event.is_set():
                        break
                    text = chunk.decode("utf-8", errors="replace")
                    loop.call_soon_threadsafe(output_q.put_nowait, text)
            except Exception:
                pass
            finally:
                loop.call_soon_threadsafe(output_q.put_nowait, None)

        t = threading.Thread(target=_read_thread, daemon=True)
        t.start()

        async def send_loop():
            try:
                while True:
                    chunk = await output_q.get()
                    if chunk is None:
                        break
                    try:
                        await websocket.send_text(chunk)
                    except Exception:
                        break
            finally:
                stop_event.set()
                try:
                    await websocket.close()
                except Exception:
                    pass

        async def recv_loop():
            try:
                async for _ in websocket.iter_text():
                    pass
            except Exception:
                pass
            finally:
                stop_event.set()
                try:
                    resp.close()
                except Exception:
                    pass

        await asyncio.gather(send_loop(), recv_loop(), return_exceptions=True)
        t.join(timeout=2)

    async def _watch_pods(self, websocket, namespace: str = "") -> None:
        """Stream Kubernetes pod watch events to a WebSocket."""
        import concurrent.futures
        import json

        from kubernetes import watch as k8s_watch  # type: ignore[import]

        loop = asyncio.get_event_loop()
        stop_event = asyncio.Event()

        def _stream() -> None:
            w = k8s_watch.Watch()
            core = self._core_v1()
            list_fn = (
                core.list_namespaced_pod if namespace else core.list_pod_for_all_namespaces
            )
            kwargs: dict = {"timeout_seconds": 300}
            if namespace:
                kwargs["namespace"] = namespace
            try:
                for event in w.stream(list_fn, **kwargs):
                    if stop_event.is_set():
                        w.stop()
                        break
                    pod = event["object"]
                    meta = pod.metadata
                    status_obj = pod.status
                    phase = (status_obj.phase or "Unknown") if status_obj else "Unknown"
                    containers = (status_obj.container_statuses or []) if status_obj else []
                    restarts = sum(c.restart_count or 0 for c in containers)
                    ready_count = sum(1 for c in containers if c.ready)
                    spec_containers = (pod.spec.containers or []) if pod.spec else []
                    total = len(spec_containers)
                    row = {
                        "name": meta.name,
                        "namespace": meta.namespace,
                        "status": phase,
                        "ready": f"{ready_count}/{total}",
                        "restarts": restarts,
                        "node": (pod.spec.node_name or "") if pod.spec else "",
                        "ip": (status_obj.pod_ip or "") if status_obj else "",
                        "created": _ts(meta.creation_timestamp),
                    }
                    payload = json.dumps({"type": event["type"], "pod": row})
                    asyncio.run_coroutine_threadsafe(websocket.send_text(payload), loop)
            except Exception:
                pass
            finally:
                asyncio.run_coroutine_threadsafe(stop_event.set(), loop)

        async def _client_recv() -> None:
            try:
                while True:
                    await websocket.receive_text()
            except Exception:
                stop_event.set()

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        recv_task = asyncio.create_task(_client_recv())
        try:
            await loop.run_in_executor(executor, _stream)
        except Exception:
            pass
        finally:
            stop_event.set()
            recv_task.cancel()
            executor.shutdown(wait=False)

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
