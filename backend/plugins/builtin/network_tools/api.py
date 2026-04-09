from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import socket as _socket
import ssl as _ssl
from datetime import datetime, timezone
from typing import TYPE_CHECKING, AsyncGenerator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.auth import get_current_user, require_admin
from backend.models import User

if TYPE_CHECKING:
    from backend.plugins.builtin.network_tools.plugin import NetworkToolsPlugin

_HOST_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,255}$")
_MAC_RE = re.compile(r"^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$|^[0-9a-fA-F]{12}$")
logger = logging.getLogger(__name__)

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


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

    return {
        "exit_code": proc.returncode,
        "stdout": stdout.decode("utf-8", errors="replace"),
        "stderr": stderr.decode("utf-8", errors="replace"),
    }


async def _stream_command(args: list[str], timeout: int) -> AsyncGenerator[str, None]:
    """Stream command output line-by-line as SSE."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        if proc.stdout:
            line_timeout = 30.0
            while True:
                try:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=line_timeout)
                except asyncio.TimeoutError:
                    if proc.returncode is not None:
                        break
                    raise
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                yield f"data: {json.dumps({'line': decoded.rstrip()})}\n\n"
        await proc.wait()
        yield f"data: {json.dumps({'done': True, 'exit_code': proc.returncode})}\n\n"
    except asyncio.TimeoutError:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        yield f"data: {json.dumps({'error': 'Command timed out'})}\n\n"
    except Exception:
        logger.exception("Network tools stream command failed")
        yield f"data: {json.dumps({'error': 'Command failed'})}\n\n"


# ── Request bodies ────────────────────────────────────────────────────────────

class PingBody(BaseModel):
    host: str
    count: int = Field(default=4, ge=1, le=10)
    timeout_seconds: int = Field(default=10, ge=2, le=60)


class TracerouteBody(BaseModel):
    host: str
    max_hops: int = Field(default=20, ge=1, le=64)
    timeout_seconds: int = Field(default=20, ge=2, le=120)


class MtrBody(BaseModel):
    host: str
    cycles: int = Field(default=10, ge=1, le=50)
    timeout_seconds: int = Field(default=60, ge=5, le=120)


class PortCheckBody(BaseModel):
    host: str
    port: int = Field(ge=1, le=65535)
    timeout_seconds: int = Field(default=5, ge=1, le=30)


class HttpCheckBody(BaseModel):
    url: str
    follow_redirects: bool = Field(default=True)
    timeout_seconds: int = Field(default=15, ge=2, le=60)


class SslCertBody(BaseModel):
    host: str
    port: int = Field(default=443, ge=1, le=65535)
    timeout_seconds: int = Field(default=10, ge=2, le=30)


class DnsLookupBody(BaseModel):
    query: str
    record_type: str = Field(default="A")
    timeout_seconds: int = Field(default=10, ge=2, le=60)


class DigBody(BaseModel):
    query: str
    record_type: str = Field(default="A")
    timeout_seconds: int = Field(default=10, ge=2, le=60)


class WhoisBody(BaseModel):
    query: str
    timeout_seconds: int = Field(default=15, ge=2, le=120)


class IperfBody(BaseModel):
    host: str
    port: int = Field(default=5201, ge=1, le=65535)
    duration: int = Field(default=10, ge=1, le=60)
    reverse: bool = Field(default=False)
    timeout_seconds: int = Field(default=90, ge=10, le=120)


class SpeedtestBody(BaseModel):
    timeout_seconds: int = Field(default=120, ge=10, le=300)


class WolBody(BaseModel):
    mac: str
    broadcast: str = Field(default="255.255.255.255")


# ── Router factory ────────────────────────────────────────────────────────────

def make_router(plugin: NetworkToolsPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/tools")
    async def list_tools(_: User = Depends(get_current_user)):
        return {
            "tools": [
                {"id": "ping",       "available": shutil.which("ping") is not None},
                {"id": "traceroute", "available": shutil.which("traceroute") is not None},
                {"id": "mtr",        "available": shutil.which("mtr") is not None},
                {"id": "http",       "available": True},   # httpx — no binary needed
                {"id": "port_check", "available": True},   # pure Python asyncio
                {"id": "ssl",        "available": True},   # Python ssl module
                {"id": "dns_lookup", "available": shutil.which("dig") is not None or shutil.which("nslookup") is not None},
                {"id": "dig",        "available": shutil.which("dig") is not None},
                {"id": "whois",      "available": shutil.which("whois") is not None},
                {"id": "iperf3",     "available": shutil.which("iperf3") is not None},
                {"id": "speedtest",  "available": shutil.which("speedtest") is not None},
                {"id": "wol",        "available": True},   # pure Python socket
            ]
        }

    # ── Ping ──────────────────────────────────────────────────────────────────

    @router.post("/ping/stream")
    async def stream_ping(body: PingBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("ping") is None:
            raise HTTPException(status_code=400, detail="ping command not found")
        return StreamingResponse(
            _stream_command(["ping", "-c", str(body.count), "-W", "2", host], body.timeout_seconds),
            media_type="text/event-stream",
            headers=_SSE_HEADERS,
        )

    # ── Traceroute ────────────────────────────────────────────────────────────

    @router.post("/traceroute/stream")
    async def stream_traceroute(body: TracerouteBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("traceroute") is None:
            raise HTTPException(status_code=400, detail="traceroute command not found")
        return StreamingResponse(
            _stream_command(["traceroute", "-m", str(body.max_hops), host], body.timeout_seconds),
            media_type="text/event-stream",
            headers=_SSE_HEADERS,
        )

    # ── MTR ───────────────────────────────────────────────────────────────────

    @router.post("/mtr/stream")
    async def stream_mtr(body: MtrBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("mtr") is None:
            raise HTTPException(status_code=400, detail="mtr command not found")
        return StreamingResponse(
            _stream_command(
                ["mtr", "--report", "--report-cycles", str(body.cycles), "--no-dns", host],
                body.timeout_seconds,
            ),
            media_type="text/event-stream",
            headers=_SSE_HEADERS,
        )

    # ── Port Check ────────────────────────────────────────────────────────────

    @router.post("/port-check")
    async def check_port(body: PortCheckBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        import time
        t0 = time.monotonic()
        open_result = False
        reason = ""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, body.port),
                timeout=body.timeout_seconds,
            )
            open_result = True
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
        except (ConnectionRefusedError, OSError) as exc:
            reason = "Connection refused"
        except asyncio.TimeoutError:
            reason = f"Timed out after {body.timeout_seconds}s"
        except Exception as exc:
            reason = type(exc).__name__

        latency_ms = round((time.monotonic() - t0) * 1000, 1)
        status = "OPEN ✓" if open_result else f"CLOSED ✗"
        lines = [
            f"Port Check — {host}:{body.port}",
            "─" * 40,
            f"Status   : {status}",
            f"Latency  : {latency_ms} ms",
        ]
        if reason:
            lines.append(f"Reason   : {reason}")
        return {"stdout": "\n".join(lines), "open": open_result, "latency_ms": latency_ms}

    # ── HTTP Check ────────────────────────────────────────────────────────────

    @router.post("/http")
    async def check_http(body: HttpCheckBody, _: User = Depends(get_current_user)):
        import time
        url = body.url.strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(
                verify=False,
                follow_redirects=body.follow_redirects,
                timeout=body.timeout_seconds,
            ) as client:
                resp = await client.get(url)
        except httpx.RequestError as exc:
            return {"stdout": f"HTTP Check — {url}\n{'─'*40}\nError: {type(exc).__name__}: {exc}"}

        elapsed_ms = round((time.monotonic() - t0) * 1000)
        redirects = [str(r.url) for r in resp.history]
        lines = [
            f"HTTP Check — {resp.url}",
            "─" * 50,
            f"Status   : {resp.status_code} {resp.reason_phrase}",
            f"Time     : {elapsed_ms} ms",
        ]
        if redirects:
            lines.append(f"Redirects: {len(redirects)}  ({' → '.join(redirects)})")
        lines.append("")
        lines.append("Headers:")
        skip = {"set-cookie", "cookie"}
        for k, v in list(resp.headers.items())[:25]:
            if k.lower() not in skip:
                lines.append(f"  {k:<32} {v[:120]}")
        return {"stdout": "\n".join(lines), "status_code": resp.status_code}

    # ── SSL Certificate ───────────────────────────────────────────────────────

    @router.post("/ssl")
    async def check_ssl(body: SslCertBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)

        def _do_check() -> tuple:
            ctx = _ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE
            with _socket.create_connection((host, body.port), timeout=body.timeout_seconds) as sock:
                with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                    return ssock.getpeercert(), ssock.version(), ssock.cipher()

        try:
            cert, tls_ver, cipher_info = await asyncio.get_event_loop().run_in_executor(None, _do_check)
        except Exception as exc:
            return {"stdout": f"SSL Check — {host}:{body.port}\n{'─'*40}\nError: {exc}"}

        subject = dict(x[0] for x in cert.get("subject", []))
        issuer  = dict(x[0] for x in cert.get("issuer", []))
        sans    = [v for t, v in cert.get("subjectAltName", []) if t == "DNS"]
        not_after  = cert.get("notAfter", "")
        not_before = cert.get("notBefore", "")

        expiry_str = days_str = valid_from_str = "—"
        expired = False
        if not_after:
            try:
                exp_dt = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
                days = (exp_dt - datetime.now(timezone.utc)).days
                expired = days < 0
                days_str = f"{days} days remaining" if not expired else f"EXPIRED {abs(days)} days ago"
                expiry_str = exp_dt.strftime("%Y-%m-%d")
            except ValueError:
                expiry_str = not_after
        if not_before:
            try:
                valid_from_str = datetime.strptime(not_before, "%b %d %H:%M:%S %Y %Z").strftime("%Y-%m-%d")
            except ValueError:
                valid_from_str = not_before

        lines = [
            f"SSL Certificate — {host}:{body.port}",
            "─" * 50,
            f"Subject  : {subject.get('commonName', '—')}",
            f"Issuer   : {issuer.get('organizationName', issuer.get('commonName', '—'))}",
            f"Valid    : {valid_from_str} → {expiry_str}",
            f"Expires  : {expiry_str}  ({days_str})",
            f"TLS      : {tls_ver or '—'}",
            f"Cipher   : {cipher_info[0] if cipher_info else '—'}",
        ]
        if sans:
            san_str = ", ".join(sans[:8]) + ("…" if len(sans) > 8 else "")
            lines.append(f"SANs     : {san_str}")
        return {"stdout": "\n".join(lines), "expired": expired}

    # ── DNS Lookup (brief) ────────────────────────────────────────────────────

    @router.post("/dns")
    async def run_dns_lookup(body: DnsLookupBody, _: User = Depends(get_current_user)):
        query = _validate_host(body.query)
        record_type = body.record_type.strip().upper() or "A"
        if shutil.which("dig") is not None:
            args = ["dig", query, record_type, "+short"]
        elif shutil.which("nslookup") is not None:
            args = ["nslookup", "-type=" + record_type, query]
        else:
            raise HTTPException(status_code=400, detail="Neither dig nor nslookup found")
        result = await _run_command(args, body.timeout_seconds)
        return {"command": "dns", "record_type": record_type, **result}

    # ── Dig (full output) ─────────────────────────────────────────────────────

    @router.post("/dig")
    async def run_dig(body: DigBody, _: User = Depends(get_current_user)):
        query = _validate_host(body.query)
        record_type = body.record_type.strip().upper() or "A"
        if shutil.which("dig") is None:
            raise HTTPException(status_code=400, detail="dig command not found")
        result = await _run_command(["dig", query, record_type], body.timeout_seconds)
        return {"command": "dig", "record_type": record_type, **result}

    # ── Whois ─────────────────────────────────────────────────────────────────

    @router.post("/whois")
    async def run_whois(body: WhoisBody, _: User = Depends(get_current_user)):
        query = _validate_host(body.query)
        if shutil.which("whois") is None:
            raise HTTPException(status_code=400, detail="whois command not found")
        result = await _run_command(["whois", query], body.timeout_seconds)
        return {"command": "whois", **result}

    # ── iPerf3 ────────────────────────────────────────────────────────────────

    @router.post("/iperf3/stream")
    async def stream_iperf3(body: IperfBody, _: User = Depends(get_current_user)):
        host = _validate_host(body.host)
        if shutil.which("iperf3") is None:
            raise HTTPException(status_code=400, detail="iperf3 command not found")
        args = ["iperf3", "-c", host, "-p", str(body.port), "-t", str(body.duration)]
        if body.reverse:
            args.append("-R")
        return StreamingResponse(
            _stream_command(args, body.timeout_seconds),
            media_type="text/event-stream",
            headers=_SSE_HEADERS,
        )

    # ── Speedtest ─────────────────────────────────────────────────────────────

    @router.post("/speedtest")
    async def run_speedtest(body: SpeedtestBody, _: User = Depends(get_current_user)):
        if shutil.which("speedtest") is None:
            raise HTTPException(status_code=400, detail="speedtest command not found")
        result = await _run_command(["speedtest", "--json"], body.timeout_seconds)
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

    # ── Wake-on-LAN ───────────────────────────────────────────────────────────

    @router.post("/wol")
    async def wake_on_lan(body: WolBody, _admin=Depends(require_admin)):
        if not _MAC_RE.match(body.mac.strip()):
            raise HTTPException(status_code=400, detail="Invalid MAC address format")
        mac_clean = re.sub(r"[^0-9a-fA-F]", "", body.mac.strip())
        mac_bytes = bytes.fromhex(mac_clean)
        magic = b"\xff" * 6 + mac_bytes * 16
        broadcast = body.broadcast.strip() or "255.255.255.255"
        try:
            with _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM) as sock:
                sock.setsockopt(_socket.SOL_SOCKET, _socket.SO_BROADCAST, 1)
                sock.sendto(magic, (broadcast, 9))
        except OSError as exc:
            raise HTTPException(status_code=502, detail=f"Failed to send magic packet: {exc}")
        return {
            "stdout": f"Wake-on-LAN\n{'─'*40}\nMagic packet sent ✓\n\nMAC       : {body.mac}\nBroadcast : {broadcast}:9",
            "status": "ok",
        }

    return router
