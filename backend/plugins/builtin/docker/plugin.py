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
