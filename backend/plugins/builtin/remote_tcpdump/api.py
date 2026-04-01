from __future__ import annotations

import asyncio
import shlex
import shutil
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.models import User

if TYPE_CHECKING:
    from backend.plugins.builtin.remote_tcpdump.plugin import RemoteTcpdumpPlugin


class CaptureBody(BaseModel):
    interface: str = Field(default="any", min_length=1, max_length=64)
    packet_count: int = Field(default=100, ge=1, le=5000)
    filter: str = Field(default="")
    timeout_seconds: int = Field(default=30, ge=2, le=300)
    remote: bool = False


async def _run(args: list[str], timeout: int) -> dict:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        await proc.communicate()
        raise HTTPException(status_code=408, detail="Capture timed out")
    return {
        "exit_code": proc.returncode,
        "stdout": stdout.decode("utf-8", errors="replace"),
        "stderr": stderr.decode("utf-8", errors="replace"),
    }


def make_router(plugin: RemoteTcpdumpPlugin) -> APIRouter:
    router = APIRouter()

    @router.post("/capture/run")
    async def run_capture(body: CaptureBody, _: User = Depends(get_current_user)):
        if shutil.which("tcpdump") is None:
            raise HTTPException(status_code=400, detail="tcpdump command not found")

        filter_args = shlex.split(body.filter) if body.filter.strip() else []
        base = ["tcpdump", "-nn", "-i", body.interface, "-c", str(body.packet_count), *filter_args]

        mode = "remote" if body.remote else "local"
        command_args: list[str] = base

        if body.remote:
            ssh_host = plugin.get_config("ssh_host")
            ssh_user = plugin.get_config("ssh_user")
            ssh_port = int(plugin.get_config("ssh_port", 22))
            ssh_key_path = plugin.get_config("ssh_key_path")
            if not ssh_host or not ssh_user:
                raise HTTPException(status_code=400, detail="SSH host and user are required for remote mode")
            if shutil.which("ssh") is None:
                raise HTTPException(status_code=400, detail="ssh command not found")

            remote_cmd = " ".join(shlex.quote(a) for a in base)
            command_args = ["ssh", "-p", str(ssh_port)]
            if ssh_key_path:
                command_args.extend(["-i", str(ssh_key_path)])
            command_args.extend([f"{ssh_user}@{ssh_host}", remote_cmd])

        result = await _run(command_args, body.timeout_seconds)
        plugin.push_capture(
            {
                "mode": mode,
                "interface": body.interface,
                "packet_count": body.packet_count,
                "filter": body.filter,
                "command": " ".join(command_args),
                "exit_code": result["exit_code"],
                "stdout": result["stdout"],
                "stderr": result["stderr"],
            }
        )

        return {
            "mode": mode,
            **result,
        }

    @router.get("/captures")
    async def list_captures(_: User = Depends(get_current_user)):
        items = plugin.list_captures()
        return {
            "items": [
                {
                    "id": i["id"],
                    "created_at": i["created_at"],
                    "mode": i.get("mode"),
                    "interface": i.get("interface"),
                    "packet_count": i.get("packet_count"),
                    "exit_code": i.get("exit_code"),
                    "stdout_preview": (i.get("stdout") or "")[:400],
                    "stderr_preview": (i.get("stderr") or "")[:240],
                }
                for i in reversed(items)
            ]
        }

    @router.get("/captures/{capture_id}")
    async def get_capture(capture_id: str, _: User = Depends(get_current_user)):
        item = plugin.get_capture(capture_id)
        if not item:
            raise HTTPException(status_code=404, detail="Capture not found")
        return item

    return router
