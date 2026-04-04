from __future__ import annotations

import asyncio
import logging
import ssl
import urllib.parse
from typing import TYPE_CHECKING

import websockets
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

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

    # ── VM / LXC config ──────────────────────────────────────────────────────

    @router.get("/nodes/{node}/qemu/{vmid}/config")
    async def get_qemu_config(node: str, vmid: int):
        """Return full hardware config for a QEMU VM."""
        try:
            client = plugin._client_or_raise()
            config = await asyncio.to_thread(client.nodes(node).qemu(vmid).config.get)
            return config
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/nodes/{node}/lxc/{vmid}/config")
    async def get_lxc_config(node: str, vmid: int):
        """Return full config for an LXC container."""
        try:
            client = plugin._client_or_raise()
            config = await asyncio.to_thread(client.nodes(node).lxc(vmid).config.get)
            return config
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

    # ── RRD performance data ───────────────────────────────────────────────────

    @router.get("/nodes/{node}/rrddata")
    async def get_node_rrddata(node: str, timeframe: str = "hour", cf: str = "AVERAGE"):
        """Return time-series RRD data for a node (cpu, mem, net, disk I/O)."""
        try:
            client = plugin._client_or_raise()
            data = await asyncio.to_thread(
                client.nodes(node).rrddata.get,
                timeframe=timeframe,
                cf=cf,
            )
            return {"rrddata": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/nodes/{node}/qemu/{vmid}/rrddata")
    async def get_qemu_rrddata(node: str, vmid: int, timeframe: str = "hour", cf: str = "AVERAGE"):
        """Return time-series RRD data for a QEMU VM."""
        try:
            client = plugin._client_or_raise()
            data = await asyncio.to_thread(
                client.nodes(node).qemu(vmid).rrddata.get,
                timeframe=timeframe,
                cf=cf,
            )
            return {"rrddata": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/nodes/{node}/lxc/{vmid}/rrddata")
    async def get_lxc_rrddata(node: str, vmid: int, timeframe: str = "hour", cf: str = "AVERAGE"):
        """Return time-series RRD data for an LXC container."""
        try:
            client = plugin._client_or_raise()
            data = await asyncio.to_thread(
                client.nodes(node).lxc(vmid).rrddata.get,
                timeframe=timeframe,
                cf=cf,
            )
            return {"rrddata": data}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Cluster resources (tree view) ─────────────────────────────────────────

    @router.get("/cluster/status")
    async def get_cluster_status():
        """Return cluster name, quorum status, and per-node online state from /cluster/status."""
        try:
            client = plugin._client_or_raise()
            items = await asyncio.to_thread(client.cluster.status.get)
            return {"status": items}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/cluster/resources")
    async def get_cluster_resources():
        """Return all cluster resources (nodes, VMs, LXCs, storage) for tree view."""
        try:
            client = plugin._client_or_raise()
            resources: list[dict] = []

            # Proxmox may scope results by type; aggregate key resource groups
            # so single-node and clustered installs both return nodes + guests.
            for resource_type in ("node", "vm", "storage", "sdn"):
                try:
                    batch = await asyncio.to_thread(
                        client.cluster.resources.get,
                        type=resource_type,
                    )
                    if batch:
                        resources.extend(batch)
                except Exception:
                    # Some installs may not support every resource type (e.g. sdn).
                    continue

            if not resources:
                resources = await asyncio.to_thread(client.cluster.resources.get)

            # Deduplicate by id/type while preserving order.
            seen: set[tuple[str, str]] = set()
            deduped: list[dict] = []
            for item in resources:
                item_id = str(item.get("id", ""))
                item_type = str(item.get("type", ""))
                key = (item_id, item_type)
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(item)
            return {"resources": deduped}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Console (VNC for QEMU) ─────────────────────────────
    # DISABLED: Console access requires VNC password research
    # TODO: Re-enable when VNC socket authentication is properly configured
    #
    # @router.post("/nodes/{node}/vms/{vmid}/console")
    # async def create_console(node: str, vmid: int, vm_type: str = "qemu"):
    #     """
    #     Create a console for a QEMU VM using direct VNC socket access.
    #     Returns: { port, host, vm_type }
    #
    #     For QEMU VMs: Connect directly to TCP VNC socket at host:5900+vmid
    #     For LXC: Console access not supported via API (requires SSH/serial access)
    #     """
    #     if vm_type == "lxc":
    #         raise HTTPException(
    #             status_code=405,
    #             detail="Console access for LXC containers is not supported via VNC. "
    #             "Use SSH or serial console access instead."
    #         )
    #
    #     try:
    #         host = plugin._config.get("host", "")
    #         port = int(plugin._config.get("port", 8006))
    #
    #         # For QEMU VMs, connect directly to the VNC socket
    #         # VNC port is 5900 + vmid offset
    #         vnc_port = 5900 + vmid
    #         return {
    #             "port": vnc_port,
    #             "host": host,
    #             "vm_type": "qemu",
    #             "auth_required": not bool(plugin._config.get("verify_ssl", False))
    #         }
    #     except Exception as exc:
    #         logger.error("Proxmox console setup error: %s", exc)
    #         raise HTTPException(status_code=502, detail=str(exc))
    #
    # @router.websocket("/nodes/{node}/vms/{vmid}/console/ws")
    # async def console_ws(
    #     websocket: WebSocket,
    #     node: str,
    #     vmid: int,
    #     vm_type: str = "qemu",
    #     port: int | None = None,
    # ):
    #     """
    #     WebSocket proxy: browser (noVNC) ↔ UHLD backend ↔ Proxmox VNC socket.
    #
    #     Connects directly to Proxmox VNC TCP socket and streams VNC RFB protocol
    #     to the browser via noVNC. Handles VNC RFB authentication (challenge-response).
    #     """
    #     if vm_type != "qemu":
    #         await websocket.close(code=4004, reason="QEMU VMs only")
    #         return
    #
    #     if port is None:
    #         host = plugin._config.get("host", "")
    #         port = 5900 + vmid
    #
    #     host = plugin._config.get("host", "")
    #     verify_ssl = bool(plugin._config.get("verify_ssl", False))
    #
    #     # Calculate VNC port (5900 + vmid offset)
    #     vnc_port = 5900 + vmid if port is None else port
    #
    #     # Build direct VNC socket URL
    #     upstream = f"{host}:{vnc_port}"
    #
    #     ssl_ctx = ssl.create_default_context()
    #     if not verify_ssl:
    #         ssl_ctx.check_hostname = False
    #         ssl_ctx.verify_mode = ssl.CERT_NONE
    #
    #     try:
    #         # Connect directly to Proxmox VNC TCP socket
    #         # VNC socket auth is handled by noVNC (RFB password challenge) or no auth if socket is open
    #         async with websockets.connect(
    #             upstream,
    #             ssl=ssl_ctx,
    #             max_size=None,
    #         ) as upstream_ws:
    #             # VNC RFB protocol is byte-oriented, stream directly
    #             # noVNC in browser expects standard VNC protocol over WebSocket
    #
    #             async def from_browser():
    #                 try:
    #                     async for msg in websocket.iter_bytes():
    #                         await upstream_ws.send(msg)
    #                 except (WebSocketDisconnect, Exception):
    #                     pass
    #                 finally:
    #                     try:
    #                         await upstream_ws.close()
    #                     except Exception:
    #                         pass
    #
    #             async def from_proxmox():
    #                 try:
    #                     async for msg in upstream_ws:
    #                         # VNC data is bytes, forward directly
    #                         await websocket.send_bytes(msg if isinstance(msg, bytes) else msg.encode())
    #                 except Exception:
    #                     pass
    #                 finally:
    #                     try:
    #                         await websocket.close()
    #                     except Exception:
    #                         pass
    #
    #             await asyncio.gather(from_browser(), from_proxmox())
    #     except Exception as exc:
    #         logger.error("Proxmox VNC WebSocket error: %s", exc)
    #         try:
    #             await websocket.close(code=1011, reason=str(exc))
    #         except Exception:
    #             pass

    return router
