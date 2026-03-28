from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException

if TYPE_CHECKING:
    from backend.plugins.builtin.proxmox.plugin import ProxmoxPlugin

logger = logging.getLogger(__name__)


def make_router(plugin: ProxmoxPlugin) -> APIRouter:
    router = APIRouter()

    # ── Nodes ────────────────────────────────────────────────────────────────

    @router.get("/nodes")
    async def get_nodes():
        try:
            client = plugin._client_or_raise()
            nodes = await asyncio.to_thread(client.nodes.get)
            return {"nodes": nodes}
        except Exception as exc:
            plugin._reset_client()
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/nodes/{node}/status")
    async def get_node_status(node: str):
        try:
            client = plugin._client_or_raise()
            status = await asyncio.to_thread(client.nodes(node).status.get)
            return status
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── VMs (QEMU + LXC) ─────────────────────────────────────────────────────

    @router.get("/vms")
    async def get_all_vms():
        """Return all QEMU VMs and LXC containers across every node."""
        try:
            client = plugin._client_or_raise()
            nodes = await asyncio.to_thread(client.nodes.get)

            async def _fetch_node_vms(node_name: str) -> list[dict]:
                results = []
                try:
                    qemu = await asyncio.to_thread(client.nodes(node_name).qemu.get)
                    for vm in qemu:
                        vm["type"] = "qemu"
                        vm["node"] = node_name
                        results.append(vm)
                except Exception:
                    pass
                try:
                    lxc = await asyncio.to_thread(client.nodes(node_name).lxc.get)
                    for ct in lxc:
                        ct["type"] = "lxc"
                        ct["node"] = node_name
                        results.append(ct)
                except Exception:
                    pass
                return results

            node_names = [n["node"] for n in nodes if n.get("status") == "online"]
            batches = await asyncio.gather(*[_fetch_node_vms(n) for n in node_names])
            vms = [vm for batch in batches for vm in batch]
            vms.sort(key=lambda v: (v.get("node", ""), v.get("vmid", 0)))
            return {"vms": vms}
        except Exception as exc:
            plugin._reset_client()
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/nodes/{node}/vms")
    async def get_node_vms(node: str):
        try:
            client = plugin._client_or_raise()
            qemu = await asyncio.to_thread(client.nodes(node).qemu.get)
            for vm in qemu:
                vm["type"] = "qemu"
                vm["node"] = node
            lxc = await asyncio.to_thread(client.nodes(node).lxc.get)
            for ct in lxc:
                ct["type"] = "lxc"
                ct["node"] = node
            return {"vms": qemu + lxc}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{node}/vms/{vmid}/start")
    async def start_vm(node: str, vmid: int, vm_type: str = "qemu"):
        try:
            client = plugin._client_or_raise()
            if vm_type == "lxc":
                task = await asyncio.to_thread(client.nodes(node).lxc(vmid).status.start.post)
            else:
                task = await asyncio.to_thread(client.nodes(node).qemu(vmid).status.start.post)
            return {"task": task}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{node}/vms/{vmid}/stop")
    async def stop_vm(node: str, vmid: int, vm_type: str = "qemu"):
        """Hard stop (power off)."""
        try:
            client = plugin._client_or_raise()
            if vm_type == "lxc":
                task = await asyncio.to_thread(client.nodes(node).lxc(vmid).status.stop.post)
            else:
                task = await asyncio.to_thread(client.nodes(node).qemu(vmid).status.stop.post)
            return {"task": task}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{node}/vms/{vmid}/shutdown")
    async def shutdown_vm(node: str, vmid: int, vm_type: str = "qemu"):
        """Graceful shutdown (ACPI)."""
        try:
            client = plugin._client_or_raise()
            if vm_type == "lxc":
                task = await asyncio.to_thread(client.nodes(node).lxc(vmid).status.shutdown.post)
            else:
                task = await asyncio.to_thread(client.nodes(node).qemu(vmid).status.shutdown.post)
            return {"task": task}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/nodes/{node}/vms/{vmid}/reboot")
    async def reboot_vm(node: str, vmid: int, vm_type: str = "qemu"):
        try:
            client = plugin._client_or_raise()
            if vm_type == "lxc":
                task = await asyncio.to_thread(client.nodes(node).lxc(vmid).status.reboot.post)
            else:
                task = await asyncio.to_thread(client.nodes(node).qemu(vmid).status.reboot.post)
            return {"task": task}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Storage ───────────────────────────────────────────────────────────────

    @router.get("/storage")
    async def get_storage():
        """Return storage pools from all online nodes."""
        try:
            client = plugin._client_or_raise()
            nodes = await asyncio.to_thread(client.nodes.get)

            async def _node_storage(node_name: str) -> list[dict]:
                try:
                    pools = await asyncio.to_thread(client.nodes(node_name).storage.get)
                    for p in pools:
                        p["node"] = node_name
                    return pools
                except Exception:
                    return []

            node_names = [n["node"] for n in nodes if n.get("status") == "online"]
            batches = await asyncio.gather(*[_node_storage(n) for n in node_names])
            pools = [p for batch in batches for p in batch]
            return {"storage": pools}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Tasks ─────────────────────────────────────────────────────────────────

    @router.get("/tasks")
    async def get_tasks(limit: int = 50):
        """Return recent tasks across all nodes."""
        try:
            client = plugin._client_or_raise()
            nodes = await asyncio.to_thread(client.nodes.get)

            async def _node_tasks(node_name: str) -> list[dict]:
                try:
                    tasks = await asyncio.to_thread(
                        client.nodes(node_name).tasks.get,
                        limit=limit // max(len(nodes), 1),
                    )
                    for t in tasks:
                        t["node"] = node_name
                    return tasks
                except Exception:
                    return []

            node_names = [n["node"] for n in nodes if n.get("status") == "online"]
            batches = await asyncio.gather(*[_node_tasks(n) for n in node_names])
            tasks = [t for batch in batches for t in batch]
            tasks.sort(key=lambda t: t.get("starttime", 0), reverse=True)
            return {"tasks": tasks[:limit]}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
