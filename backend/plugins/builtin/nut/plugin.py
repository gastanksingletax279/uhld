from __future__ import annotations

import logging
import time

from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class NUTPlugin(PluginBase):
    plugin_id = "nut"
    display_name = "NUT UPS Server"
    description = "Monitor UPS devices via Network UPS Tools (NUT) server"
    version = "1.0.0"
    icon = "zap"
    category = "power"
    poll_interval = 30

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "NUT Server Host",
                "description": "Hostname or IP of your NUT server",
                "placeholder": "192.168.1.10",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 3493,
            },
            "username": {
                "type": "string",
                "title": "Username (optional)",
            },
            "password": {
                "type": "string",
                "title": "Password (optional)",
                "sensitive": True,
            },
        },
        "required": ["host"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._summary_cache: dict | None = None
        self._history: list[dict] = []
        # Previous NUT status flags per UPS name for transition detection
        self._prev_ups_flags: dict[str, set[str]] = {}

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        self._summary_cache = None
        self._history = []
        self._prev_ups_flags = {}

    async def on_disable(self) -> None:
        self._summary_cache = None
        self._history = []
        self._prev_ups_flags = {}

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        from backend.plugins.builtin.nut.api import NUTClient

        host = self._config.get("host", "localhost")
        port = int(self._config.get("port", 3493))
        username = self._config.get("username") or None
        password = self._config.get("password") or None

        try:
            async with NUTClient(host, port, username, password) as client:
                upses = await client.list_ups()
            count = len(upses)
            return {
                "status": "ok",
                "message": f"Connected — {count} UPS device{'s' if count != 1 else ''} found",
            }
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        result = await self._fetch_summary()
        self._summary_cache = result

        # Append to history (keep last 1440 entries ≈ 12h at 30s intervals)
        snapshot: dict = {"ts": time.time(), "upses": {}}
        for device in result.get("devices", []):
            name = device.get("name", "")
            snapshot["upses"][name] = {
                "battery_charge": device.get("battery_charge"),
                "load": device.get("load"),
                "status": device.get("status", ""),
            }
        self._history.append(snapshot)
        if len(self._history) > 1440:
            self._history = self._history[-1440:]

        logger.debug("NUT summary cache refreshed — %d UPS(es)", result.get("total", 0))

        await self._check_power_transitions(result.get("devices", []))

    async def _fetch_summary(self) -> dict:
        from backend.plugins.builtin.nut.api import NUTClient, build_device_dict

        host = self._config.get("host", "localhost")
        port = int(self._config.get("port", 3493))
        username = self._config.get("username") or None
        password = self._config.get("password") or None

        try:
            async with NUTClient(host, port, username, password) as client:
                upses = await client.list_ups()
                devices = []
                for name, desc in upses:
                    try:
                        vars_ = await client.list_vars(name)
                        devices.append(build_device_dict(name, desc, vars_))
                    except Exception as exc:
                        logger.warning("NUT: failed to fetch vars for %s: %s", name, exc)
                        devices.append({"name": name, "description": desc, "status": "error", "vars": {}})

            total = len(devices)
            online = sum(1 for d in devices if "OL" in d.get("status", "") and "OB" not in d.get("status", ""))
            on_battery = sum(1 for d in devices if "OB" in d.get("status", ""))
            low_battery = sum(1 for d in devices if "LB" in d.get("status", ""))

            result = {
                "status": "ok",
                "total": total,
                "online": online,
                "on_battery": on_battery,
                "low_battery": low_battery,
                "devices": devices,
            }
            self._summary_cache = result
            return result
        except Exception as exc:
            logger.error("NUT fetch_summary error: %s", exc)
            return {"status": "error", "message": str(exc), "total": 0, "online": 0, "on_battery": 0, "low_battery": 0, "devices": []}

    async def _check_power_transitions(self, devices: list[dict]) -> None:
        """Detect OB/LB/OL status transitions and fire notifications."""
        from backend.notifications import send_notification

        for device in devices:
            name = device.get("name", "unknown")
            raw_status = device.get("status", "")
            # NUT status is space-separated flags, e.g. "OB LB" or "OL CHRG"
            current_flags = set(raw_status.split())
            prev_flags = self._prev_ups_flags.get(name)

            if prev_flags is not None:
                battery_charge = device.get("battery_charge")
                charge_str = (
                    f" (battery: {battery_charge:.0f}%)" if battery_charge is not None else ""
                )

                went_on_battery = "OB" in current_flags and "OB" not in prev_flags
                went_low_battery = "LB" in current_flags and "LB" not in prev_flags
                back_on_mains = "OL" in current_flags and "OB" in prev_flags and "OB" not in current_flags

                if went_on_battery:
                    logger.warning("NUT: %s switched to battery power", name)
                    await send_notification(
                        event_type="nut.on_battery",
                        title=f"UPS {name}: switched to battery",
                        message=f"UPS '{name}' is now running on battery power{charge_str}.",
                        level="warning",
                        plugin_id=self.plugin_id,
                        instance_id=None,
                    )

                if went_low_battery:
                    logger.warning("NUT: %s battery is low", name)
                    await send_notification(
                        event_type="nut.low_battery",
                        title=f"UPS {name}: low battery",
                        message=f"UPS '{name}' battery level is low{charge_str}. Shutdown may be imminent.",
                        level="error",
                        plugin_id=self.plugin_id,
                        instance_id=None,
                    )

                if back_on_mains:
                    logger.info("NUT: %s restored to mains power", name)
                    await send_notification(
                        event_type="nut.back_on_mains",
                        title=f"UPS {name}: power restored",
                        message=f"UPS '{name}' is back on mains power{charge_str}.",
                        level="info",
                        plugin_id=self.plugin_id,
                        instance_id=None,
                    )

            self._prev_ups_flags[name] = current_flags

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.nut.api import make_router
        return make_router(self)
