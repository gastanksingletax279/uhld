from __future__ import annotations

from pydantic import BaseModel


class NodeStatus(BaseModel):
    node: str
    status: str
    cpu: float          # fraction 0-1
    maxcpu: int
    mem: int            # bytes
    maxmem: int         # bytes
    disk: int           # bytes
    maxdisk: int        # bytes
    uptime: int         # seconds


class VMStatus(BaseModel):
    vmid: int
    name: str | None
    status: str         # "running" | "stopped" | "paused"
    type: str           # "qemu" | "lxc"
    node: str
    cpu: float          # fraction 0-1
    cpus: int
    mem: int            # bytes
    maxmem: int         # bytes
    uptime: int         # seconds


class StorageStatus(BaseModel):
    storage: str
    node: str
    type: str
    content: str
    used: int           # bytes
    avail: int          # bytes
    total: int          # bytes
    active: int         # 0 or 1
    enabled: int        # 0 or 1
