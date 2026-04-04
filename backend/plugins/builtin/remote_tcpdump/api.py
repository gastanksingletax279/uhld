from __future__ import annotations

import asyncio
import json
import os
import shlex
import shutil
import tempfile
from datetime import UTC, datetime
from typing import TYPE_CHECKING, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.models import User

if TYPE_CHECKING:
    from backend.plugins.builtin.remote_tcpdump.plugin import RemoteTcpdumpPlugin


class CaptureBody(BaseModel):
    interface: str = Field(default="any", min_length=1, max_length=64)
    # Termination: at least one should be set; if both, stops at whichever fires first
    packet_count: int | None = Field(default=100, ge=1, le=50000)
    duration_seconds: int | None = Field(default=None, ge=1, le=3600)
    filter: str = Field(default="")
    remote: bool = True
    # Output display options (ignored when writing PCAP)
    snaplen: int = Field(default=0, ge=0, le=65535)        # 0 = max
    ascii_output: bool = False                              # -A
    hex_ascii_output: bool = False                          # -X (overridden by ascii_output)
    verbosity: int = Field(default=0, ge=0, le=3)           # 0=default 1=-v 2=-vv 3=-vvv
    print_ethernet: bool = False                            # -e
    timestamp_format: str = Field(default="default")       # default|none|unix|delta|diff


def _process_timeout(body: CaptureBody) -> int:
    """Compute kill-timeout for the subprocess."""
    if body.duration_seconds:
        return body.duration_seconds + 10
    return 300  # generous ceiling for packet-count-only captures


def _build_tcpdump_cmd(
    body: CaptureBody,
    *,
    for_pcap: bool = False,
    for_stream: bool = False,
) -> list[str]:
    """Assemble tcpdump arguments from a CaptureBody."""
    cmd = ["tcpdump", "-nn"]

    if for_stream:
        cmd.append("-l")  # line-buffered stdout for real-time output

    # Always emit snaplen explicitly so the preview matches reality
    cmd.extend(["-s", str(body.snaplen)])

    if not for_pcap:
        if body.ascii_output:
            cmd.append("-A")
        elif body.hex_ascii_output:
            cmd.append("-X")

        if body.verbosity >= 3:
            cmd.append("-vvv")
        elif body.verbosity == 2:
            cmd.append("-vv")
        elif body.verbosity == 1:
            cmd.append("-v")

        if body.print_ethernet:
            cmd.append("-e")

        ts_flag = {
            "none": "-t",
            "unix": "-tt",
            "delta": "-ttt",
            "diff": "-tttt",
        }.get(body.timestamp_format)
        if ts_flag:
            cmd.append(ts_flag)

    cmd.extend(["-i", body.interface])

    if body.packet_count is not None:
        cmd.extend(["-c", str(body.packet_count)])

    if for_pcap:
        cmd.extend(["-w", "-"])

    filter_args = shlex.split(body.filter) if body.filter.strip() else []
    cmd.extend(filter_args)

    return cmd


def _parse_proc_net_dev(content: str) -> list[str]:
    ifaces: list[str] = []
    for line in content.splitlines()[2:]:
        stripped = line.strip()
        if ":" in stripped:
            name = stripped.split(":")[0].strip()
            if name:
                ifaces.append(name)
    return sorted(ifaces)


def _build_ssh_args(plugin: RemoteTcpdumpPlugin, remote_cmd: str) -> tuple[list[str], str | None]:
    ssh_host = plugin.get_config("ssh_host")
    ssh_user = plugin.get_config("ssh_user")
    ssh_port = int(plugin.get_config("ssh_port", 22))
    ssh_key_content = plugin.get_config("ssh_key_content")
    ssh_key_path = plugin.get_config("ssh_key_path")
    ssh_password = plugin.get_config("ssh_password")

    if not ssh_host or not ssh_user:
        raise HTTPException(status_code=400, detail="SSH host and user are required for remote mode")
    if shutil.which("ssh") is None:
        raise HTTPException(status_code=400, detail="ssh command not found")

    tmp_key_path: str | None = None
    if ssh_key_content:
        fd, tmp_key_path = tempfile.mkstemp(prefix="uhld_ssh_key_")
        try:
            os.write(fd, ssh_key_content.encode())
        finally:
            os.close(fd)
        os.chmod(tmp_key_path, 0o600)

    effective_key = tmp_key_path or ssh_key_path

    if ssh_password and not effective_key:
        if shutil.which("sshpass") is None:
            raise HTTPException(status_code=400, detail="sshpass not found; install it to use password auth")
        command_args: list[str] = [
            "sshpass", "-p", ssh_password,
            "ssh", "-p", str(ssh_port), "-o", "StrictHostKeyChecking=no",
            f"{ssh_user}@{ssh_host}", remote_cmd,
        ]
    else:
        command_args = ["ssh", "-p", str(ssh_port), "-o", "StrictHostKeyChecking=no"]
        if effective_key:
            command_args.extend(["-i", str(effective_key)])
        command_args.extend([f"{ssh_user}@{ssh_host}", remote_cmd])

    return command_args, tmp_key_path


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


async def _run_binary(args: list[str], timeout: int) -> bytes:
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
    if not stdout:
        detail = stderr.decode("utf-8", errors="replace").strip() or "Capture produced no output"
        raise HTTPException(status_code=502, detail=detail)
    return stdout


def make_router(plugin: RemoteTcpdumpPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/info")
    async def get_info(_: User = Depends(get_current_user)):
        """Return non-sensitive SSH connection info for the UI badge."""
        return {
            "ssh_host": plugin.get_config("ssh_host") or None,
            "ssh_user": plugin.get_config("ssh_user") or None,
            "ssh_port": plugin.get_config("ssh_port", 22),
        }

    @router.get("/interfaces")
    async def list_interfaces(remote: bool = True, _: User = Depends(get_current_user)):
        if not remote:
            try:
                with open("/proc/net/dev") as f:
                    content = f.read()
                return {"interfaces": _parse_proc_net_dev(content)}
            except OSError as exc:
                raise HTTPException(status_code=500, detail=f"Could not read /proc/net/dev: {exc}")

        command_args, tmp_key_path = _build_ssh_args(plugin, "cat /proc/net/dev")
        try:
            result = await _run(command_args, 10)
            if result["exit_code"] != 0:
                raise HTTPException(status_code=502, detail=f"Remote command failed: {result['stderr'].strip()}")
            return {"interfaces": _parse_proc_net_dev(result["stdout"])}
        finally:
            if tmp_key_path and os.path.exists(tmp_key_path):
                os.unlink(tmp_key_path)

    @router.post("/capture/run")
    async def run_capture(body: CaptureBody, _: User = Depends(get_current_user)):
        if not body.remote and shutil.which("tcpdump") is None:
            raise HTTPException(status_code=400, detail="tcpdump command not found")

        base_cmd = _build_tcpdump_cmd(body)
        mode = "remote" if body.remote else "local"
        tmp_key_path: str | None = None
        try:
            if body.remote:
                remote_cmd = " ".join(shlex.quote(a) for a in base_cmd)
                command_args, tmp_key_path = _build_ssh_args(plugin, remote_cmd)
            else:
                command_args = base_cmd
            result = await _run(command_args, _process_timeout(body))
        finally:
            if tmp_key_path and os.path.exists(tmp_key_path):
                os.unlink(tmp_key_path)

        plugin.push_capture({
            "mode": mode, "interface": body.interface,
            "packet_count": body.packet_count, "duration_seconds": body.duration_seconds,
            "filter": body.filter, "command": " ".join(command_args),
            "exit_code": result["exit_code"],
            "stdout": result["stdout"], "stderr": result["stderr"],
        })
        return {"mode": mode, **result}

    @router.post("/capture/stream")
    async def stream_capture(body: CaptureBody, _: User = Depends(get_current_user)):
        if not body.remote and shutil.which("tcpdump") is None:
            raise HTTPException(status_code=400, detail="tcpdump command not found")

        base_cmd = _build_tcpdump_cmd(body, for_stream=True)
        mode = "remote" if body.remote else "local"
        tmp_key_path: str | None = None

        if body.remote:
            remote_cmd = " ".join(shlex.quote(a) for a in base_cmd)
            command_args, tmp_key_path = _build_ssh_args(plugin, remote_cmd)
        else:
            command_args = base_cmd

        timeout = _process_timeout(body)

        async def generate() -> AsyncGenerator[str, None]:
            collected_stdout: list[str] = []
            collected_stderr: list[str] = []
            proc = await asyncio.create_subprocess_exec(
                *command_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                async def _read(stream: asyncio.StreamReader, dest: list[str]) -> None:
                    while True:
                        line = await stream.readline()
                        if not line:
                            break
                        dest.append(line.decode("utf-8", errors="replace").rstrip())

                stdout_task = asyncio.create_task(_read(proc.stdout, collected_stdout))  # type: ignore[arg-type]
                stderr_task = asyncio.create_task(_read(proc.stderr, collected_stderr))  # type: ignore[arg-type]

                deadline = asyncio.get_event_loop().time() + timeout
                last_out = last_err = 0

                while not (stdout_task.done() and stderr_task.done()):
                    await asyncio.sleep(0.1)
                    for line in collected_stdout[last_out:]:
                        yield f"data: {json.dumps({'line': line})}\n\n"
                    last_out = len(collected_stdout)
                    for line in collected_stderr[last_err:]:
                        yield f"data: {json.dumps({'line': line, 'stderr': True})}\n\n"
                    last_err = len(collected_stderr)
                    if asyncio.get_event_loop().time() > deadline:
                        proc.kill()
                        break

                await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
                for line in collected_stdout[last_out:]:
                    yield f"data: {json.dumps({'line': line})}\n\n"
                for line in collected_stderr[last_err:]:
                    yield f"data: {json.dumps({'line': line, 'stderr': True})}\n\n"

                await proc.wait()
                yield f"data: {json.dumps({'done': True, 'exit_code': proc.returncode})}\n\n"

                plugin.push_capture({
                    "mode": mode, "interface": body.interface,
                    "packet_count": body.packet_count, "duration_seconds": body.duration_seconds,
                    "filter": body.filter, "command": " ".join(command_args),
                    "exit_code": proc.returncode,
                    "stdout": "\n".join(collected_stdout),
                    "stderr": "\n".join(collected_stderr),
                })
            except Exception as exc:
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
            finally:
                if tmp_key_path and os.path.exists(tmp_key_path):
                    os.unlink(tmp_key_path)

        return StreamingResponse(generate(), media_type="text/event-stream")

    @router.post("/capture/pcap")
    async def download_pcap(body: CaptureBody, _: User = Depends(get_current_user)):
        if not body.remote and shutil.which("tcpdump") is None:
            raise HTTPException(status_code=400, detail="tcpdump command not found")

        base_cmd = _build_tcpdump_cmd(body, for_pcap=True)
        tmp_key_path: str | None = None
        try:
            if body.remote:
                remote_cmd = " ".join(shlex.quote(a) for a in base_cmd)
                command_args, tmp_key_path = _build_ssh_args(plugin, remote_cmd)
            else:
                command_args = base_cmd
            pcap_bytes = await _run_binary(command_args, _process_timeout(body))
        finally:
            if tmp_key_path and os.path.exists(tmp_key_path):
                os.unlink(tmp_key_path)

        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = f"capture-{body.interface}-{timestamp}.pcap"
        return Response(
            content=pcap_bytes,
            media_type="application/vnd.tcpdump.pcap",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

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
                    "duration_seconds": i.get("duration_seconds"),
                    "filter": i.get("filter"),
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

    @router.delete("/captures/{capture_id}")
    async def delete_capture(capture_id: str, _: User = Depends(get_current_user)):
        if not plugin.delete_capture(capture_id):
            raise HTTPException(status_code=404, detail="Capture not found")
        return {"ok": True}

    return router
