from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException

if TYPE_CHECKING:
    from backend.plugins.builtin.nut.plugin import NUTPlugin

logger = logging.getLogger(__name__)

# ── NUT TCP Client ─────────────────────────────────────────────────────────────


class NUTClient:
    """Async NUT protocol client using raw asyncio TCP connections."""

    def __init__(
        self,
        host: str,
        port: int = 3493,
        username: str | None = None,
        password: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._timeout = timeout
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None

    async def connect(self) -> None:
        self._reader, self._writer = await asyncio.wait_for(
            asyncio.open_connection(self._host, self._port),
            timeout=self._timeout,
        )
        # Authenticate if credentials provided
        if self._username:
            await self._send_line(f"USERNAME {self._username}")
            resp = await self._read_line()
            if not resp.startswith("OK"):
                raise ConnectionError(f"NUT USERNAME rejected: {resp}")
        if self._password:
            await self._send_line(f"PASSWORD {self._password}")
            resp = await self._read_line()
            if not resp.startswith("OK"):
                raise ConnectionError(f"NUT PASSWORD rejected: {resp}")

    async def close(self) -> None:
        if self._writer is not None:
            try:
                self._writer.write(b"LOGOUT\n")
                await self._writer.drain()
            except Exception:
                pass
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
            self._writer = None
            self._reader = None

    async def __aenter__(self) -> "NUTClient":
        await self.connect()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def _send_line(self, line: str) -> None:
        if self._writer is None:
            raise RuntimeError("NUT client not connected")
        self._writer.write((line + "\n").encode())
        await self._writer.drain()

    async def _read_line(self) -> str:
        if self._reader is None:
            raise RuntimeError("NUT client not connected")
        line = await asyncio.wait_for(self._reader.readline(), timeout=self._timeout)
        return line.decode().rstrip("\r\n")

    async def _read_block(self, end_prefix: str) -> list[str]:
        """Read lines until a line starting with end_prefix is encountered."""
        lines: list[str] = []
        while True:
            line = await self._read_line()
            if line.startswith(end_prefix):
                break
            if line.startswith("ERR "):
                raise RuntimeError(f"NUT error: {line}")
            lines.append(line)
        return lines

    async def send_command(self, cmd: str) -> list[str]:
        """Send a command and collect the response lines."""
        await self._send_line(cmd)
        first = await self._read_line()

        if first.startswith("ERR "):
            raise RuntimeError(f"NUT error: {first}")

        # Multi-line responses start with BEGIN
        if first.startswith("BEGIN "):
            # Determine the END marker from the first line
            # e.g. "BEGIN LIST UPS" → "END LIST UPS"
            end_marker = "END " + first[len("BEGIN "):]
            lines = await self._read_block(end_marker)
            return lines

        # Single-line response
        return [first]

    # ── High-level commands ───────────────────────────────────────────────────

    async def list_ups(self) -> list[tuple[str, str]]:
        """Return list of (ups_name, description) tuples."""
        lines = await self.send_command("LIST UPS")
        result: list[tuple[str, str]] = []
        for line in lines:
            # UPS <name> "<description>"
            if not line.startswith("UPS "):
                continue
            rest = line[4:]
            # Split on first space to get name, rest is quoted description
            parts = rest.split(" ", 1)
            name = parts[0]
            desc = parts[1].strip('"') if len(parts) > 1 else ""
            result.append((name, desc))
        return result

    async def list_vars(self, upsname: str) -> dict[str, str]:
        """Return all variables for a given UPS as a dict."""
        lines = await self.send_command(f"LIST VAR {upsname}")
        result: dict[str, str] = {}
        for line in lines:
            # VAR <upsname> <varname> "<value>"
            if not line.startswith("VAR "):
                continue
            rest = line[4:]
            # Split: <upsname> <varname> "<value>"
            parts = rest.split(" ", 2)
            if len(parts) < 3:
                continue
            varname = parts[1]
            value = parts[2].strip('"')
            result[varname] = value
        return result

    async def get_var(self, upsname: str, varname: str) -> str:
        """Get a single variable value."""
        lines = await self.send_command(f"GET VAR {upsname} {varname}")
        for line in lines:
            if line.startswith("VAR "):
                parts = line.split(" ", 3)
                if len(parts) >= 4:
                    return parts[3].strip('"')
        raise RuntimeError(f"VAR {varname} not found in response")

    async def login(self, upsname: str) -> None:
        """Send LOGIN <upsname> — required by some servers before INSTCMD."""
        await self._send_line(f"LOGIN {upsname}")
        resp = await self._read_line()
        if resp.startswith("ERR "):
            raise RuntimeError(f"NUT LOGIN rejected: {resp}")

    async def instcmd(self, upsname: str, cmd: str) -> str:
        """Send an instant command to a UPS.

        NUT requires USERNAME + PASSWORD (done in connect()) followed by
        LOGIN <upsname> before INSTCMD.  Some servers (e.g. Home Assistant
        NUT add-on) enforce LOGIN strictly and return ERR USERNAME-REQUIRED
        for INSTCMD without it.
        """
        await self.login(upsname)
        lines = await self.send_command(f"INSTCMD {upsname} {cmd}")
        return lines[0] if lines else "OK"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _float_or_none(val: str | None) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def build_device_dict(name: str, description: str, vars_: dict[str, str]) -> dict:
    """Convert raw NUT vars into a structured device dict."""
    return {
        "name": name,
        "description": description,
        "status": vars_.get("ups.status", ""),
        "load": _float_or_none(vars_.get("ups.load")),
        "battery_charge": _float_or_none(vars_.get("battery.charge")),
        "battery_runtime": _float_or_none(vars_.get("battery.runtime")),
        "battery_voltage": _float_or_none(vars_.get("battery.voltage")),
        "input_voltage": _float_or_none(vars_.get("input.voltage")),
        "output_voltage": _float_or_none(vars_.get("output.voltage")),
        "temperature": _float_or_none(vars_.get("ups.temperature")),
        "model": vars_.get("ups.model") or vars_.get("device.model"),
        "manufacturer": vars_.get("ups.mfr") or vars_.get("device.mfr"),
        "firmware": vars_.get("ups.firmware") or vars_.get("driver.version"),
        "vars": vars_,
    }


# ── Router factory ─────────────────────────────────────────────────────────────


def make_router(plugin: "NUTPlugin") -> APIRouter:
    router = APIRouter()

    def _client() -> NUTClient:
        host = plugin._config.get("host", "localhost")
        port = int(plugin._config.get("port", 3493))
        username = plugin._config.get("username") or None
        password = plugin._config.get("password") or None
        return NUTClient(host, port, username, password)

    @router.get("/ups")
    async def list_upses():
        """List all UPS devices with full variable sets."""
        try:
            async with _client() as client:
                upses = await client.list_ups()
                devices = []
                for name, desc in upses:
                    try:
                        vars_ = await client.list_vars(name)
                        devices.append(build_device_dict(name, desc, vars_))
                    except Exception as exc:
                        logger.warning("NUT: failed to get vars for %s: %s", name, exc)
                        devices.append({"name": name, "description": desc, "status": "error", "vars": {}})
            return {"upses": devices}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/ups/{upsname}")
    async def get_ups(upsname: str):
        """Get detail for a single UPS."""
        try:
            async with _client() as client:
                vars_ = await client.list_vars(upsname)
                # Get description from list
                upses = await client.list_ups()
                desc = next((d for n, d in upses if n == upsname), "")
            return build_device_dict(upsname, desc, vars_)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/ups/{upsname}/test")
    async def test_battery(upsname: str):
        """Trigger a battery test on the specified UPS."""
        try:
            async with _client() as client:
                result = await client.instcmd(upsname, "test.battery.start")
            return {"ok": True, "result": result}
        except Exception as exc:
            detail = str(exc)
            logger.error("NUT battery test failed for %s: %s", upsname, detail)
            raise HTTPException(status_code=502, detail=detail)

    @router.get("/history")
    async def get_history():
        """Return stored poll history for charting (up to last 1440 entries)."""
        return {"history": plugin._history}

    return router
