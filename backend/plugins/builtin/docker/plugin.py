from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)

_DEFAULT_SOCKET = "/var/run/docker.sock"
_API_VERSION = "v1.41"


class DockerPlugin(PluginBase):
    plugin_id = "docker"
    display_name = "Docker"
    description = "Monitor and manage Docker containers and images"
    version = "1.0.0"
    icon = "container"
    category = "containers"
    poll_interval = 30

    config_schema = {
        "type": "object",
        "properties": {
            "socket_path": {
                "type": "string",
                "title": "Socket Path",
                "description": "Path to Docker Unix socket. Leave blank to use default.",
                "default": "/var/run/docker.sock",
                "placeholder": "/var/run/docker.sock",
            },
            "host": {
                "type": "string",
                "title": "TCP Host (optional)",
                "description": "Use instead of socket for remote Docker daemon, e.g. tcp://192.168.1.10:2375",
                "placeholder": "tcp://192.168.1.10:2375",
            },
            "verify_ssl": {
                "type": "boolean",
                "title": "Verify SSL",
                "default": False,
                "description": "Verify TLS certificate for remote daemon",
            },
        },
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._summary_cache: dict | None = None

    # ── Client ────────────────────────────────────────────────────────────────

    def _make_client(self) -> httpx.AsyncClient:
        host = (self._config.get("host") or "").strip()
        if host:
            # Remote TCP endpoint
            verify = bool(self._config.get("verify_ssl", False))
            base = host.replace("tcp://", "http://").replace("https://", "https://")
            return httpx.AsyncClient(base_url=base, verify=verify, timeout=15.0)
        else:
            # Unix socket
            socket_path = self._config.get("socket_path") or _DEFAULT_SOCKET
            transport = httpx.AsyncHTTPTransport(uds=socket_path)
            return httpx.AsyncClient(
                transport=transport,
                base_url="http://docker",
                timeout=15.0,
            )

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = self._make_client()
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _url(self, path: str) -> str:
        return f"/{_API_VERSION}{path}"

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        await self._close_client()
        self._summary_cache = None

    async def on_disable(self) -> None:
        await self._close_client()
        self._summary_cache = None

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            resp = await self._get_client().get(self._url("/info"))
            resp.raise_for_status()
            data = resp.json()
            containers = data.get("Containers", 0)
            running = data.get("ContainersRunning", 0)
            return {
                "status": "ok",
                "message": f"{running}/{containers} container(s) running — {data.get('ServerVersion', 'unknown')}",
            }
        except Exception as exc:
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()

    async def _fetch_summary(self) -> dict:
        try:
            resp = await self._get_client().get(self._url("/containers/json?all=1"))
            resp.raise_for_status()
            containers = resp.json()
            total = len(containers)
            running = sum(1 for c in containers if c.get("State") == "running")
            result = {"status": "ok", "containers_running": running, "containers_total": total}
            self._summary_cache = result
            return result
        except Exception as exc:
            logger.error("Docker fetch_summary error: %s", exc)
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    # ── Data fetchers ─────────────────────────────────────────────────────────

    async def _fetch_containers(self) -> list[dict]:
        resp = await self._get_client().get(self._url("/containers/json?all=1"))
        resp.raise_for_status()
        containers = []
        for c in resp.json():
            ports = []
            for p in c.get("Ports", []):
                ports.append({
                    "ip": p.get("IP", ""),
                    "private_port": p.get("PrivatePort", 0),
                    "public_port": p.get("PublicPort"),
                    "type": p.get("Type", "tcp"),
                })
            containers.append({
                "id": c["Id"][:12],
                "full_id": c["Id"],
                "names": [n.lstrip("/") for n in c.get("Names", [])],
                "image": c.get("Image", ""),
                "image_id": c.get("ImageID", "")[:19],
                "command": c.get("Command", ""),
                "created": c.get("Created", 0),
                "status": c.get("Status", ""),
                "state": c.get("State", ""),
                "ports": ports,
                "labels": c.get("Labels") or {},
            })
        return containers

    async def _fetch_images(self) -> list[dict]:
        resp = await self._get_client().get(self._url("/images/json"))
        resp.raise_for_status()
        images = []
        for img in resp.json():
            images.append({
                "id": img["Id"].replace("sha256:", "")[:12],
                "full_id": img["Id"],
                "repo_tags": img.get("RepoTags") or ["<none>:<none>"],
                "size": img.get("Size", 0),
                "created": img.get("Created", 0),
                "labels": img.get("Labels") or {},
            })
        return images

    async def _container_action(self, container_id: str, action: str) -> dict:
        resp = await self._get_client().post(self._url(f"/containers/{container_id}/{action}"))
        if resp.status_code not in (200, 204, 304):
            try:
                msg = resp.json().get("message", resp.text)
            except Exception:
                msg = resp.text or f"HTTP {resp.status_code}"
            raise ValueError(msg)
        return {"message": f"Container {action} successful"}

    async def _exec_container_shell(self, container_id: str, cmd: str, websocket) -> None:
        """Bridge a FastAPI WebSocket to a Docker exec TTY session via raw socket."""
        import asyncio
        import json as _json

        await websocket.accept()

        # Step 1: Create exec instance via REST
        try:
            resp = await self._get_client().post(
                self._url(f"/containers/{container_id}/exec"),
                json={
                    "AttachStdin": True,
                    "AttachStdout": True,
                    "AttachStderr": True,
                    "Tty": True,
                    "Cmd": [cmd],
                },
            )
            resp.raise_for_status()
            exec_id = resp.json()["Id"]
        except Exception as exc:
            try:
                await websocket.send_text(f"\r\nError creating exec: {exc}\r\n")
                await websocket.close()
            except Exception:
                pass
            return

        # Step 2: Open a raw socket connection to the Docker daemon
        host = (self._config.get("host") or "").strip()
        socket_path = self._config.get("socket_path") or _DEFAULT_SOCKET

        try:
            if host:
                clean = host.replace("tcp://", "").replace("http://", "").replace("https://", "")
                h, _, port_str = clean.partition(":")
                reader, writer = await asyncio.open_connection(h, int(port_str) if port_str else 2375)
            else:
                reader, writer = await asyncio.open_unix_connection(socket_path)
        except Exception as exc:
            try:
                await websocket.send_text(f"\r\nCannot connect to Docker daemon: {exc}\r\n")
                await websocket.close()
            except Exception:
                pass
            return

        # Step 3: Send HTTP exec start request (raw — httpx can't hijack the connection)
        body = _json.dumps({"Detach": False, "Tty": True})
        body_bytes = body.encode()
        request = (
            f"POST /{_API_VERSION}/exec/{exec_id}/start HTTP/1.1\r\n"
            f"Host: localhost\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body_bytes)}\r\n"
            f"\r\n"
        ).encode() + body_bytes
        writer.write(request)
        await writer.drain()

        # Step 4: Consume HTTP response headers
        try:
            while True:
                line = await asyncio.wait_for(reader.readline(), timeout=10)
                if not line or line == b"\r\n":
                    break
        except Exception as exc:
            try:
                await websocket.send_text(f"\r\nFailed to start exec: {exc}\r\n")
                await websocket.close()
            except Exception:
                pass
            writer.close()
            return

        # Step 5: Bridge raw Docker stream ↔ WebSocket
        stop = asyncio.Event()

        async def docker_to_ws() -> None:
            try:
                while not stop.is_set():
                    try:
                        data = await asyncio.wait_for(reader.read(4096), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue
                    if not data:
                        break
                    try:
                        await websocket.send_text(data.decode("utf-8", errors="replace"))
                    except Exception:
                        break
            except Exception:
                pass
            finally:
                stop.set()
                try:
                    await websocket.close()
                except Exception:
                    pass

        async def ws_to_docker() -> None:
            try:
                async for msg in websocket.iter_text():
                    if stop.is_set():
                        break
                    writer.write(msg.encode())
                    await writer.drain()
            except Exception:
                pass
            finally:
                stop.set()
                try:
                    writer.close()
                except Exception:
                    pass

        await asyncio.gather(docker_to_ws(), ws_to_docker(), return_exceptions=True)

    async def _fetch_info(self) -> dict:
        resp = await self._get_client().get(self._url("/info"))
        resp.raise_for_status()
        d = resp.json()
        return {
            "server_version": d.get("ServerVersion", ""),
            "os": d.get("OperatingSystem", ""),
            "kernel": d.get("KernelVersion", ""),
            "arch": d.get("Architecture", ""),
            "cpus": d.get("NCPU", 0),
            "mem_total": d.get("MemTotal", 0),
            "containers": d.get("Containers", 0),
            "containers_running": d.get("ContainersRunning", 0),
            "containers_paused": d.get("ContainersPaused", 0),
            "containers_stopped": d.get("ContainersStopped", 0),
            "images": d.get("Images", 0),
            "storage_driver": d.get("Driver", ""),
            "logging_driver": d.get("LoggingDriver", ""),
            "name": d.get("Name", ""),
        }

    async def _fetch_events(self, since: int = 0) -> list[dict]:
        import json as _json
        import time as _time
        now = int(_time.time())
        if not since:
            since = now - 3600
        resp = await self._get_client().get(self._url(f"/events?since={since}&until={now}"))
        resp.raise_for_status()
        events = []
        for line in resp.text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(_json.loads(line))
            except Exception:
                pass
        return list(reversed(events[-50:]))

    async def _fetch_container_stats(self, container_id: str) -> dict:
        resp = await self._get_client().get(
            self._url(f"/containers/{container_id}/stats?stream=false&one-shot=true")
        )
        resp.raise_for_status()
        d = resp.json()
        cpu_delta = (
            d["cpu_stats"]["cpu_usage"]["total_usage"]
            - d["precpu_stats"]["cpu_usage"]["total_usage"]
        )
        system_delta = (
            d["cpu_stats"].get("system_cpu_usage", 0)
            - d["precpu_stats"].get("system_cpu_usage", 0)
        )
        num_cpus = d["cpu_stats"].get("online_cpus") or len(
            d["cpu_stats"]["cpu_usage"].get("percpu_usage") or [0]
        )
        cpu_pct = (cpu_delta / system_delta) * num_cpus * 100.0 if system_delta > 0 else 0.0
        mem_usage = d["memory_stats"].get("usage", 0)
        mem_limit = d["memory_stats"].get("limit", 0)
        mem_cache = (d["memory_stats"].get("stats") or {}).get("cache", 0)
        mem_actual = max(mem_usage - mem_cache, 0)
        mem_pct = (mem_actual / mem_limit * 100.0) if mem_limit > 0 else 0.0
        net_rx = net_tx = 0
        for iface in (d.get("networks") or {}).values():
            net_rx += iface.get("rx_bytes", 0)
            net_tx += iface.get("tx_bytes", 0)
        return {
            "cpu_pct": round(cpu_pct, 2),
            "mem_usage": mem_actual,
            "mem_limit": mem_limit,
            "mem_pct": round(mem_pct, 2),
            "net_rx": net_rx,
            "net_tx": net_tx,
        }

    async def _stream_container_logs(self, container_id: str, websocket) -> None:
        import asyncio as _asyncio
        await websocket.accept()
        client = self._make_client()
        try:
            url = self._url(
                f"/containers/{container_id}/logs?stdout=1&stderr=1&follow=1&timestamps=1&tail=100"
            )
            async with client.stream("GET", url) as response:
                stop = _asyncio.Event()
                buf = b""

                async def _stream() -> None:
                    nonlocal buf
                    try:
                        async for chunk in response.aiter_bytes():
                            if stop.is_set():
                                break
                            buf += chunk
                            while len(buf) >= 8:
                                frame_size = int.from_bytes(buf[4:8], "big")
                                if len(buf) < 8 + frame_size:
                                    break
                                line = buf[8: 8 + frame_size].decode("utf-8", errors="replace")
                                buf = buf[8 + frame_size:]
                                try:
                                    await websocket.send_text(line)
                                except Exception:
                                    stop.set()
                                    return
                    except Exception:
                        pass
                    finally:
                        stop.set()

                async def _watch() -> None:
                    try:
                        async for _ in websocket.iter_text():
                            pass
                    except Exception:
                        pass
                    finally:
                        stop.set()

                await _asyncio.gather(_stream(), _watch(), return_exceptions=True)
        except Exception as exc:
            try:
                await websocket.send_text(f"Error: {exc}")
            except Exception:
                pass
        finally:
            await client.aclose()
            try:
                await websocket.close()
            except Exception:
                pass

    async def _fetch_container_logs(self, container_id: str, tail: int = 100) -> str:
        resp = await self._get_client().get(
            self._url(f"/containers/{container_id}/logs?stdout=1&stderr=1&tail={tail}&timestamps=1")
        )
        resp.raise_for_status()
        # Docker log stream has 8-byte header per frame; strip them
        raw = resp.content
        lines: list[str] = []
        i = 0
        while i + 8 <= len(raw):
            frame_size = int.from_bytes(raw[i + 4:i + 8], "big")
            i += 8
            if i + frame_size <= len(raw):
                lines.append(raw[i:i + frame_size].decode("utf-8", errors="replace"))
            i += frame_size
        return "".join(lines) if lines else raw.decode("utf-8", errors="replace")

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.docker.api import make_router
        return make_router(self)
