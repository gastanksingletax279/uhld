from __future__ import annotations

import asyncio
import json
import re
import shutil
from typing import TYPE_CHECKING, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.models import User

if TYPE_CHECKING:
    from backend.plugins.builtin.network_tools.plugin import NetworkToolsPlugin

_HOST_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,255}$")


def _validate_host(host: str) -> str:
    value = host.strip()
    if not value or not _HOST_RE.match(value):
        raise HTTPException(status_code=400, detail="Invalid host or domain")
    return value


async def _run_command(args: list[str], timeout: int) -> dict:
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
        raise HTTPException(status_code=408, detail="Command timed out")

    out = stdout.decode("utf-8", errors="replace")
    err = stderr.decode("utf-8", errors="replace")
    return {"exit_code": proc.returncode, "stdout": out, "stderr": err}


async def _stream_command(args: list[str], timeout: int) -> AsyncGenerator[str, None]:
    """Stream command output line by line as Server-Sent Events."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,  # Merge stderr into stdout
    )
    
    try:
        if proc.stdout:
            # Use a per-line timeout instead of total timeout
            # This allows long-running commands like traceroute to work
            # where each hop can take time to respond
            line_timeout = 30.0  # 30 seconds per line is reasonable for traceroute
            
            while True:
                # Read with timeout on each line
                try:
                    line = await asyncio.wait_for(
                        proc.stdout.readline(),
                        timeout=line_timeout
                    )
                except asyncio.TimeoutError:
                    # Check if process is still running
                    if proc.returncode is not None:
                        break
                    # No output for line_timeout seconds - assume command is hung
                    raise
                
                if not line:
                    break
                
                # Send as SSE format: data: <content>\n\n
                decoded = line.decode("utf-8", errors="replace")
                yield f"data: {json.dumps({'line': decoded.rstrip()})}\n\n"
        
        # Wait for process to complete
        await proc.wait()
        
        # Send completion event
        yield f"data: {json.dumps({'done': True, 'exit_code': proc.returncode})}\n\n"
        
    except asyncio.TimeoutError:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        yield f"data: {json.dumps({'error': 'Command timed out'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


class PingBody(BaseModel):
    host: str
    count: int = Field(default=4, ge=1, le=10)
    timeout_seconds: int = Field(default=10, ge=2, le=60)


class TracerouteBody(BaseModel):
    host: str
    max_hops: int = Field(default=20, ge=1, le=64)
    timeout_seconds: int = Field(default=20, ge=2, le=120)


class DnsLookupBody(BaseModel):
    query: str
    record_type: str = Field(default="A")
    timeout_seconds: int = Field(default=10, ge=2, le=60)


class WhoisBody(BaseModel):
    query: str
    timeout_seconds: int = Field(default=15, ge=2, le=120)


class SpeedtestBody(BaseModel):
    timeout_seconds: int = Field(default=120, ge=10, le=300)


def make_router(plugin: NetworkToolsPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/tools")
    async def list_tools(_: User = Depends(get_current_user)):
        return {
            "tools": [
                {"id": "ping", "available": shutil.which("ping") is not None},
                {"id": "traceroute", "available": shutil.which("traceroute") is not None},
                {"id": "dns_lookup", "available": shutil.which("dig") is not None or shutil.which("nslookup") is not None},
                {"id": "whois", "available": shutil.which("whois") is not None},
                {"id": "speedtest", "available": shutil.which("speedtest") is not None},
            ]
        }

    @router.post("/ping")
    async def run_ping(body: PingBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("ping") is None:
            raise HTTPException(status_code=400, detail="ping command not found")
        result = await _run_command(["ping", "-c", str(body.count), "-W", "2", host], body.timeout_seconds)
        return {"command": "ping", **result}

    @router.post("/ping/stream")
    async def stream_ping(body: PingBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("ping") is None:
            raise HTTPException(status_code=400, detail="ping command not found")
        
        return StreamingResponse(
            _stream_command(["ping", "-c", str(body.count), "-W", "2", host], body.timeout_seconds),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            }
        )

    @router.post("/traceroute")
    async def run_traceroute(body: TracerouteBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("traceroute") is None:
            raise HTTPException(status_code=400, detail="traceroute command not found")
        result = await _run_command(
            ["traceroute", "-m", str(body.max_hops), host],
            body.timeout_seconds,
        )
        return {"command": "traceroute", **result}

    @router.post("/traceroute/stream")
    async def stream_traceroute(body: TracerouteBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("traceroute") is None:
            raise HTTPException(status_code=400, detail="traceroute command not found")
        
        return StreamingResponse(
            _stream_command(["traceroute", "-m", str(body.max_hops), host], body.timeout_seconds),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    @router.post("/dns")
    async def run_dns_lookup(body: DnsLookupBody, _: User = Depends(get_current_user)):
        query = _validate_host(body.query)
        record_type = body.record_type.strip().upper() or "A"
        if shutil.which("dig") is not None:
            args = ["dig", query, record_type, "+short"]
        elif shutil.which("nslookup") is not None:
            args = ["nslookup", "-type=" + record_type, query]
        else:
            raise HTTPException(status_code=400, detail="Neither dig nor nslookup command found")
        result = await _run_command(args, body.timeout_seconds)
        return {"command": "dns", "record_type": record_type, **result}

    @router.post("/whois")
    async def run_whois(body: WhoisBody, _: User = Depends(get_current_user)):
        query = _validate_host(body.query)
        if shutil.which("whois") is None:
            raise HTTPException(status_code=400, detail="whois command not found")
        result = await _run_command(["whois", query], body.timeout_seconds)
        return {"command": "whois", **result}

    @router.post("/speedtest")
    async def run_speedtest(body: SpeedtestBody, _: User = Depends(get_current_user)):
        if shutil.which("speedtest") is None:
            raise HTTPException(status_code=400, detail="speedtest command not found")

        # Python speedtest-cli uses --json instead of --format=json
        # and doesn't require --accept-license/--accept-gdpr flags
        result = await _run_command(
            ["speedtest", "--json"],
            body.timeout_seconds,
        )

        parsed: dict = {}
        if result["stdout"].strip():
            try:
                parsed = json.loads(result["stdout"])
            except json.JSONDecodeError:
                parsed = {"raw": result["stdout"][:5000]}

        if parsed:
            plugin.add_speedtest_result(parsed)

        return {"command": "speedtest", "result": parsed, **result}

    @router.get("/speedtest/history")
    async def speedtest_history(_: User = Depends(get_current_user)):
        return {"items": plugin.get_speedtest_history()}

    return router
