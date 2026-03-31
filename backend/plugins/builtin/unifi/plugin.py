from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class UniFiPlugin(PluginBase):
    plugin_id = "unifi"
    display_name = "UniFi"
    description = "Monitor UniFi network clients, devices, and configuration via the UniFi OS Integration API"
    version = "2.0.0"
    icon = "wifi"
    category = "network"
    poll_interval = 60

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "Host",
                "description": "Hostname or IP of your UniFi Console (UDM, UDM Pro, etc.)",
                "placeholder": "192.168.1.1",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 443,
            },
            "api_key": {
                "type": "string",
                "title": "API Key (recommended)",
                "description": "UniFi OS Integration API key. Generate in UniFi OS → Settings → Control Plane → Integrations.",
                "sensitive": True,
            },
            "username": {
                "type": "string",
                "title": "Username",
                "default": "admin",
                "description": "Used for session auth when no API key is set.",
            },
            "password": {
                "type": "string",
                "title": "Password",
                "format": "password",
                "sensitive": True,
                "description": "Used for session auth when no API key is set.",
            },
            "site": {
                "type": "string",
                "title": "Site",
                "default": "default",
                "description": "UniFi site name or internal reference (usually 'default')",
            },
            "verify_ssl": {
                "type": "boolean",
                "title": "Verify SSL",
                "default": False,
                "description": "Disable for self-signed certs",
            },
        },
        "required": ["host"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._logged_in: bool = False
        self._csrf_token: str | None = None
        self._summary_cache: dict | None = None
        self._site_id_cache: str | None = None

    # ── URL / config helpers ──────────────────────────────────────────────────

    def _base_url(self) -> str:
        host = self._config.get("host", "localhost")
        port = int(self._config.get("port", 443))
        return f"https://{host}:{port}"

    def _api_key(self) -> str | None:
        return self._config.get("api_key") or None

    def _site_ref(self) -> str:
        return self._config.get("site", "default") or "default"

    def _is_udm(self) -> bool:
        # With integration API port 443 is always UDM-style
        return bool(self._config.get("api_key") or self._config.get("unifi_os", False))

    # ── HTTP client ───────────────────────────────────────────────────────────

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            verify = bool(self._config.get("verify_ssl", False))
            self._client = httpx.AsyncClient(
                base_url=self._base_url(),
                verify=verify,
                timeout=15.0,
                follow_redirects=True,
            )
            self._logged_in = False
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._logged_in = False
        self._csrf_token = None
        self._site_id_cache = None

    # ── Integration v1 API (X-API-Key) ───────────────────────────────────────

    def _int_headers(self) -> dict[str, str]:
        key = self._api_key()
        headers = {"Accept": "application/json"}
        if key:
            headers["X-API-Key"] = key
        return headers

    async def _integration_get(self, path: str) -> httpx.Response:
        client = self._get_client()
        resp = await client.get(
            f"/proxy/network/integration{path}",
            headers=self._int_headers(),
        )
        resp.raise_for_status()
        return resp

    async def _integration_post(self, path: str, json_data: dict) -> httpx.Response:
        client = self._get_client()
        resp = await client.post(
            f"/proxy/network/integration{path}",
            json=json_data,
            headers={**self._int_headers(), "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp

    async def _integration_list(self, path: str) -> list[dict]:
        """Fetch all pages from a paginated integration v1 endpoint."""
        results: list[dict] = []
        offset = 0
        limit = 200
        while True:
            sep = "&" if "?" in path else "?"
            resp = await self._integration_get(f"{path}{sep}offset={offset}&limit={limit}")
            body = resp.json()
            page = body.get("data", [])
            results.extend(page)
            total = body.get("totalCount", len(results))
            offset += len(page)
            if offset >= total or not page:
                break
        return results

    async def _get_site_id(self) -> str:
        """Discover the site UUID via /v1/sites, matching the configured site ref."""
        if self._site_id_cache:
            return self._site_id_cache
        sites = await self._integration_list("/v1/sites")
        site_ref = self._site_ref()
        for s in sites:
            if s.get("internalReference") == site_ref or s.get("name") == site_ref:
                self._site_id_cache = s["id"]
                logger.debug("UniFi site '%s' → UUID %s", site_ref, self._site_id_cache)
                return self._site_id_cache
        if sites:
            self._site_id_cache = sites[0]["id"]
            logger.info(
                "UniFi: site '%s' not found, using first site: %s (%s)",
                site_ref, sites[0].get("name"), self._site_id_cache,
            )
            return self._site_id_cache
        raise RuntimeError("No UniFi sites found via integration API")

    # ── Session-based auth (fallback when no api_key) ─────────────────────────

    async def _login(self) -> None:
        client = self._get_client()
        username = self._config.get("username", "admin")
        password = self._config.get("password", "")
        login_path = "/api/auth/login" if self._is_udm() else "/api/login"
        resp = await client.post(login_path, json={"username": username, "password": password})
        resp.raise_for_status()
        self._logged_in = True
        if self._is_udm():
            self._csrf_token = (
                resp.headers.get("x-csrf-token")
                or client.cookies.get("csrf_token")
                or self._csrf_from_jwt(client.cookies.get("TOKEN", ""))
            )

    def _csrf_from_jwt(self, token: str) -> str | None:
        if not token:
            return None
        try:
            import base64
            import json as _json
            payload_b64 = token.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload = _json.loads(base64.b64decode(payload_b64))
            return payload.get("csrfToken")
        except Exception:
            return None

    async def _session_get(self, path: str) -> httpx.Response:
        api_path = f"/proxy/network{path}" if self._is_udm() else path

        async def _do() -> httpx.Response:
            client = self._get_client()
            if not self._logged_in:
                await self._login()
            return await client.get(api_path)

        try:
            resp = await _do()
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RemoteProtocolError) as exc:
            logger.warning("UniFi connection error, retrying: %s", exc)
            await self._close_client()
            resp = await _do()

        def _is_auth_err(r: httpx.Response) -> bool:
            if r.status_code == 401:
                return True
            if r.status_code == 200:
                try:
                    meta = r.json().get("meta", {})
                    return meta.get("rc") == "error" and "Login" in meta.get("msg", "")
                except Exception:
                    pass
            return False

        if _is_auth_err(resp):
            self._logged_in = False
            resp = await _do()

        resp.raise_for_status()
        return resp

    async def _session_post(self, path: str, json_data: dict) -> httpx.Response:
        api_path = f"/proxy/network{path}" if self._is_udm() else path

        async def _do() -> httpx.Response:
            client = self._get_client()
            if not self._logged_in:
                await self._login()
            headers = {}
            if self._is_udm() and self._csrf_token:
                headers["X-CSRF-Token"] = self._csrf_token
            return await client.post(api_path, json=json_data, headers=headers)

        resp = await _do()
        if resp.status_code in (401, 403):
            self._logged_in = False
            self._csrf_token = None
            resp = await _do()
        resp.raise_for_status()
        return resp

    # ── Data fetching ─────────────────────────────────────────────────────────

    async def _fetch_clients(self) -> list[dict]:
        if self._api_key():
            site_id = await self._get_site_id()
            raw = await self._integration_list(f"/v1/sites/{site_id}/clients")
            return [self._normalize_client_v1(c) for c in raw]
        # Session fallback
        site = self._site_ref()
        resp = await self._session_get(f"/api/s/{site}/stat/sta")
        return [self._normalize_client_session(c) for c in resp.json().get("data", [])]

    @staticmethod
    def _normalize_client_v1(c: dict) -> dict:
        client_type = c.get("type", "WIRED")
        return {
            "id": c.get("id", ""),
            "mac": c.get("macAddress", ""),
            "hostname": c.get("name", ""),
            "ip": c.get("ipAddress", ""),
            "type": client_type,
            "is_wired": client_type == "WIRED",
            "connected_at": c.get("connectedAt", ""),
            "access_type": (c.get("access") or {}).get("type", ""),
            # Not available in integration v1 list endpoint
            "essid": None,
            "rssi": None,
            "rx_bytes": 0,
            "tx_bytes": 0,
            "uptime": None,
        }

    @staticmethod
    def _normalize_client_session(c: dict) -> dict:
        is_wired = bool(c.get("is_wired", False))
        return {
            "id": c.get("mac", ""),  # use MAC as ID for session API
            "mac": c.get("mac", ""),
            "hostname": c.get("hostname") or c.get("name") or c.get("mac", ""),
            "ip": c.get("ip", ""),
            "type": "WIRED" if is_wired else "WIRELESS",
            "is_wired": is_wired,
            "connected_at": "",
            "access_type": "",
            "essid": c.get("essid"),
            "rssi": c.get("rssi"),
            "rx_bytes": int(c.get("rx_bytes", 0)),
            "tx_bytes": int(c.get("tx_bytes", 0)),
            "uptime": c.get("uptime"),
        }

    async def _fetch_devices(self) -> list[dict]:
        if self._api_key():
            site_id = await self._get_site_id()
            raw = await self._integration_list(f"/v1/sites/{site_id}/devices")
            return [self._normalize_device_v1(d) for d in raw]
        site = self._site_ref()
        resp = await self._session_get(f"/api/s/{site}/stat/device")
        return [self._normalize_device_session(d) for d in resp.json().get("data", [])]

    @staticmethod
    def _normalize_device_v1(d: dict) -> dict:
        interfaces = d.get("interfaces") or []
        features = d.get("features") or []
        return {
            "id": d.get("id", ""),
            "mac": d.get("macAddress", ""),
            "name": d.get("name", ""),
            "model": d.get("model", ""),
            "ip": d.get("ipAddress", ""),
            "state": d.get("state", "OFFLINE"),
            "firmware_version": d.get("firmwareVersion", ""),
            "firmware_updatable": bool(d.get("firmwareUpdatable", False)),
            "features": features if isinstance(features, list) else list(features.keys()) if isinstance(features, dict) else [],
            "has_ports": "ports" in interfaces,
            # Session API extras (not available)
            "type": "",
            "uptime": None,
        }

    @staticmethod
    def _normalize_device_session(d: dict) -> dict:
        return {
            "id": d.get("_id") or d.get("mac", ""),
            "mac": d.get("mac", ""),
            "name": d.get("name") or d.get("mac", ""),
            "model": d.get("model", ""),
            "ip": d.get("ip", ""),
            "state": "ONLINE" if int(d.get("state", 0)) == 1 else "OFFLINE",
            "firmware_version": d.get("version", ""),
            "firmware_updatable": bool(d.get("upgradable", False)),
            "features": [],
            "has_ports": d.get("type") == "usw",
            "type": d.get("type", ""),
            "uptime": d.get("uptime"),
        }

    async def _fetch_ports(self) -> list[dict]:
        if self._api_key():
            return await self._fetch_ports_v1()
        return await self._fetch_ports_session()

    async def _fetch_ports_v1(self) -> list[dict]:
        """Fetch switch port details via device detail endpoints (integration v1).

        The v1 API device detail does not expose port names or VLANs, so we
        supplement with legacy stat/device + networkconf calls (X-API-Key is
        accepted on all UniFi OS paths) to get port_overrides and network VLANs.
        """
        devices = await self._fetch_devices()
        site_id = await self._get_site_id()
        client = self._get_client()
        site = self._site_ref()

        # Build network_id → vlan_id and name lookup from legacy networkconf
        net_vlan: dict[str, int] = {}
        net_name: dict[str, str] = {}
        try:
            resp = await client.get(
                f"/proxy/network/api/s/{site}/rest/networkconf",
                headers=self._int_headers(),
            )
            if resp.is_success:
                for n in resp.json().get("data", []):
                    nid = n.get("_id", "")
                    net_vlan[nid] = int(n.get("vlan", 0)) if n.get("vlan_enabled") else 0
                    net_name[nid] = n.get("name", "")
        except Exception as exc:
            logger.debug("Could not fetch networkconf for VLAN lookup: %s", exc)

        # Build port-override lookup: mac → {port_idx → override dict}
        port_overrides_by_mac: dict[str, dict[int, dict]] = {}
        try:
            resp = await client.get(
                f"/proxy/network/api/s/{site}/stat/device",
                headers=self._int_headers(),
            )
            if resp.is_success:
                for dev in resp.json().get("data", []):
                    mac = (dev.get("mac") or "").lower()
                    port_overrides_by_mac[mac] = {
                        int(o.get("port_idx", 0)): o
                        for o in dev.get("port_overrides", [])
                    }
        except Exception as exc:
            logger.debug("Could not fetch port names from legacy stat/device: %s", exc)

        ports = []
        for d in devices:
            if not d.get("has_ports"):
                continue
            overrides = port_overrides_by_mac.get((d.get("mac") or "").lower(), {})
            try:
                resp = await self._integration_get(f"/v1/sites/{site_id}/devices/{d['id']}")
                detail = resp.json()
                device_name = d["name"] or d["mac"]
                ifaces = detail.get("interfaces") or {}
                port_list = ifaces.get("ports", []) if isinstance(ifaces, dict) else []
                for p in port_list:
                    poe = p.get("poe") or {}
                    idx = int(p.get("idx", 0))
                    override = overrides.get(idx, {})
                    port_name = override.get("name", "")
                    # VLAN is stored as native_networkconf_id → look up vlan_id
                    net_id = override.get("native_networkconf_id", "")
                    vlan_id = net_vlan.get(net_id, 0) if net_id else 0
                    tagged_ids = [t for t in (override.get("tagged_networkconf_ids") or []) if t != "all"]
                    tagged_vlans = sorted(
                        v for v in (net_vlan.get(tid, 0) for tid in tagged_ids) if v
                    )
                    tagged_network_names = [
                        net_name[tid] for tid in tagged_ids if net_name.get(tid)
                    ]
                    ports.append({
                        "device_id": d["id"],
                        "device_name": device_name,
                        "idx": idx,
                        "name": port_name,
                        "description": port_name,
                        "state": p.get("state", "DOWN"),
                        "connector": p.get("connector", ""),
                        "speed_mbps": int(p.get("speedMbps", 0)),
                        "max_speed_mbps": int(p.get("maxSpeedMbps", 0)),
                        "poe_enabled": bool(poe.get("enabled", False)),
                        "poe_standard": poe.get("standard", ""),
                        "poe_state": poe.get("state", ""),
                        "vlan": vlan_id,
                        "tagged_vlans": tagged_vlans,
                        "tagged_network_names": tagged_network_names,
                        "rx_bytes": 0,
                        "tx_bytes": 0,
                        "full_duplex": False,
                    })
            except Exception as exc:
                logger.debug("Failed to fetch port details for device %s: %s", d.get("id"), exc)
        return ports

    async def _fetch_ports_session(self) -> list[dict]:
        site = self._site_ref()
        devices_raw = await self._session_get(f"/api/s/{site}/stat/device")

        # Build network_id → vlan_id and name lookup
        net_vlan: dict[str, int] = {}
        net_name: dict[str, str] = {}
        try:
            nets_resp = await self._session_get(f"/api/s/{site}/rest/networkconf")
            for n in nets_resp.json().get("data", []):
                nid = n.get("_id", "")
                net_vlan[nid] = int(n.get("vlan", 0)) if n.get("vlan_enabled") else 0
                net_name[nid] = n.get("name", "")
        except Exception as exc:
            logger.debug("Could not fetch networkconf for VLAN lookup: %s", exc)

        ports = []
        for device in devices_raw.json().get("data", []):
            if device.get("type") != "usw":
                continue
            device_name = device.get("name") or device.get("mac", "")
            # port_overrides holds user-defined labels and native_networkconf_id for VLANs
            overrides = {
                int(o.get("port_idx", 0)): o
                for o in device.get("port_overrides", [])
            }
            for p in device.get("port_table", []):
                idx = int(p.get("port_idx", 0))
                override = overrides.get(idx, {})
                port_name = override.get("name", "")
                net_id = override.get("native_networkconf_id", "")
                vlan_id = net_vlan.get(net_id, 0) if net_id else 0
                tagged_ids = [t for t in (override.get("tagged_networkconf_ids") or []) if t != "all"]
                tagged_vlans = sorted(
                    v for v in (net_vlan.get(tid, 0) for tid in tagged_ids) if v
                )
                tagged_network_names = [
                    net_name[tid] for tid in tagged_ids if net_name.get(tid)
                ]
                ports.append({
                    "device_id": device.get("_id", device.get("mac", "")),
                    "device_name": device_name,
                    "idx": idx,
                    "name": port_name,
                    "description": port_name,
                    "state": "UP" if p.get("up") else "DOWN",
                    "connector": "RJ45",
                    "speed_mbps": int(p.get("speed", 0)),
                    "max_speed_mbps": int(p.get("speed", 0)),
                    "poe_enabled": bool(p.get("poe_enable", False)),
                    "poe_standard": "",
                    "poe_state": "UP" if p.get("poe_enable") else "",
                    "vlan": vlan_id,
                    "tagged_vlans": tagged_vlans,
                    "tagged_network_names": tagged_network_names,
                    "rx_bytes": int(p.get("rx_bytes", 0)),
                    "tx_bytes": int(p.get("tx_bytes", 0)),
                    "full_duplex": bool(p.get("full_duplex", False)),
                })
        return ports

    async def _fetch_networks(self) -> list[dict]:
        if self._api_key():
            site_id = await self._get_site_id()
            raw = await self._integration_list(f"/v1/sites/{site_id}/networks")
            return [self._normalize_network_v1(n) for n in raw]
        site = self._site_ref()
        resp = await self._session_get(f"/api/s/{site}/rest/networkconf")
        return [self._normalize_network_session(n) for n in resp.json().get("data", [])]

    @staticmethod
    def _normalize_network_v1(n: dict) -> dict:
        return {
            "id": n.get("id", ""),
            "name": n.get("name", ""),
            "enabled": bool(n.get("enabled", True)),
            "vlan_id": int(n.get("vlanId", 0)),
            "management": n.get("management", ""),
            "is_default": bool(n.get("default", False)),
            "purpose": "",
            "ip_subnet": "",
            "dhcpd_enabled": False,
            "dhcpd_start": "",
            "dhcpd_stop": "",
        }

    @staticmethod
    def _normalize_network_session(n: dict) -> dict:
        return {
            "id": n.get("_id", ""),
            "name": n.get("name", ""),
            "enabled": bool(n.get("enabled", True)),
            "vlan_id": int(n.get("vlan", 0)) if n.get("vlan_enabled") else 0,
            "management": n.get("purpose", ""),
            "is_default": n.get("name", "").lower() in ("default", "lan"),
            "purpose": n.get("purpose", ""),
            "ip_subnet": n.get("ip_subnet", ""),
            "dhcpd_enabled": bool(n.get("dhcpd_enabled", False)),
            "dhcpd_start": n.get("dhcpd_start", ""),
            "dhcpd_stop": n.get("dhcpd_stop", ""),
        }

    async def _fetch_wlans(self) -> list[dict]:
        """WiFi broadcasts (integration v1) or WLAN conf (session)."""
        if self._api_key():
            site_id = await self._get_site_id()
            raw = await self._integration_list(f"/v1/sites/{site_id}/wifi/broadcasts")
            return [self._normalize_wlan_v1(w) for w in raw]
        site = self._site_ref()
        resp = await self._session_get(f"/api/s/{site}/rest/wlanconf")
        return [self._normalize_wlan_session(w) for w in resp.json().get("data", [])]

    @staticmethod
    def _normalize_wlan_v1(w: dict) -> dict:
        sec = (w.get("securityConfiguration") or {}).get("type", "OPEN")
        net = (w.get("network") or {}).get("type", "")
        scheduled = bool((w.get("blackoutScheduleConfiguration") or {}).get("days"))
        return {
            "id": w.get("id", ""),
            "name": w.get("name", ""),
            "enabled": bool(w.get("enabled", True)),
            "security_type": sec,
            "network_type": net,
            "hide_name": bool(w.get("hideName", False)),
            "client_isolation": bool(w.get("clientIsolationEnabled", False)),
            "is_guest": w.get("type", "") == "GUEST",
            "scheduled": scheduled,
            "wpa_mode": "",
            "vlan": None,
            "vlan_enabled": False,
        }

    @staticmethod
    def _normalize_wlan_session(w: dict) -> dict:
        sec_raw = w.get("security", "open")
        wpa_mode = w.get("wpa_mode", "")
        # Map old security names to new style
        sec_map = {
            "open": "OPEN",
            "wpapsk": "WPA",
            "wpa2psk": "WPA3" if "3" in wpa_mode else "WPA2",
            "wpa3": "WPA3",
        }
        sec_type = sec_map.get(sec_raw, sec_raw.upper())
        return {
            "id": w.get("_id", ""),
            "name": w.get("name", ""),
            "enabled": bool(w.get("enabled", True)),
            "security_type": sec_type,
            "network_type": "GUEST" if w.get("is_guest") else "DEFAULT",
            "hide_name": bool(w.get("hide_ssid", False)),
            "client_isolation": False,
            "is_guest": bool(w.get("is_guest", False)),
            "scheduled": bool(w.get("schedule_with_duration", False)),
            "wpa_mode": wpa_mode,
            "vlan": w.get("vlan"),
            "vlan_enabled": bool(w.get("vlan_enabled", False)),
        }

    async def _fetch_firewall_rules(self) -> list[dict]:
        if not self._api_key():
            # Session fallback: legacy firewallrule endpoint
            site = self._site_ref()
            try:
                resp = await self._session_get(f"/api/s/{site}/rest/firewallrule")
                return resp.json().get("data", [])
            except Exception as exc:
                logger.debug("Legacy firewallrule endpoint failed: %s", exc)
                return []

        site_id = await self._get_site_id()
        rules: list[dict] = []

        # Build zone name map first
        zone_map: dict[str, str] = {}
        try:
            zones = await self._fetch_firewall_zones()
            zone_map = {z["_id"]: z["name"] for z in zones if z.get("_id")}
        except Exception:
            pass

        try:
            policy_list = await self._integration_list(f"/v1/sites/{site_id}/firewall/policies")
            for r in policy_list:
                rules.append(self._normalize_policy_rule(r, zone_map))
        except Exception as exc:
            logger.debug("Integration v1 firewall/policies failed: %s", exc)

        return rules

    @staticmethod
    def _normalize_policy_rule(r: dict, zone_map: dict[str, str] | None = None) -> dict:
        zm = zone_map or {}
        src = r.get("source") or {}
        dst = r.get("destination") or {}
        src_zone_id = src.get("zoneId") or src.get("zone_id", "")
        dst_zone_id = dst.get("zoneId") or dst.get("zone_id", "")
        src_zone = zm.get(src_zone_id, src_zone_id or "?")
        dst_zone = zm.get(dst_zone_id, dst_zone_id or "?")
        ruleset = f"{src_zone} → {dst_zone}" if (src_zone and dst_zone) else "POLICY"
        action_raw = r.get("action") or {}
        action = (action_raw.get("type") if isinstance(action_raw, dict) else action_raw) or "accept"
        logging_flag = r.get("loggingEnabled") if "loggingEnabled" in r else r.get("logging", False)
        return {
            "_id": r.get("id") or r.get("_id", ""),
            "name": r.get("name", ""),
            "description": r.get("description", ""),
            "ruleset": ruleset,
            "rule_index": int(r.get("index", r.get("rule_index", 0))),
            "action": str(action).lower(),
            "protocol": r.get("protocol") or "all",
            "enabled": bool(r.get("enabled", True)),
            "src_address": r.get("src_address", ""),
            "dst_address": r.get("dst_address", ""),
            "src_firewallgroup_ids": r.get("src_firewallgroup_ids", []),
            "dst_firewallgroup_ids": r.get("dst_firewallgroup_ids", []),
            "dst_port": r.get("dst_port", ""),
            "logging": bool(logging_flag),
        }

    async def _fetch_firewall_groups(self) -> list[dict]:
        if not self._api_key():
            site = self._site_ref()
            try:
                resp = await self._session_get(f"/api/s/{site}/rest/firewallgroup")
                return resp.json().get("data", [])
            except Exception:
                return []
        # Integration v1 does not have a firewall groups endpoint; return empty
        return []

    async def _fetch_firewall_zones(self) -> list[dict]:
        if not self._api_key():
            return []
        site_id = await self._get_site_id()
        raw = await self._integration_list(f"/v1/sites/{site_id}/firewall/zones")
        return [
            {
                "_id": z.get("id", ""),
                "name": z.get("name", ""),
                "zone_key": (z.get("metadata") or {}).get("origin", ""),
                "network_ids": z.get("networkIds") or z.get("network_ids", []),
                "auto": (z.get("metadata") or {}).get("origin", "") == "system",
            }
            for z in raw
        ]

    async def kick_client(self, client_id: str) -> None:
        """Reconnect a client. Uses integration v1 if api_key, otherwise legacy stamgr."""
        if self._api_key():
            site_id = await self._get_site_id()
            await self._integration_post(
                f"/v1/sites/{site_id}/clients/{client_id}/actions",
                {"action": "reconnect"},
            )
        else:
            # Legacy: kick-sta by MAC
            site = self._site_ref()
            await self._session_post(
                f"/api/s/{site}/cmd/stamgr",
                {"cmd": "kick-sta", "mac": client_id},
            )

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
            summary = await self._fetch_summary()
            if summary.get("status") == "error":
                return {"status": "error", "message": summary.get("message", "Unknown error")}
            clients = summary.get("clients_total", 0)
            devices = summary.get("devices_total", 0)
            return {"status": "ok", "message": f"{clients} client(s), {devices} device(s)"}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        return await self._fetch_summary()

    async def scheduled_poll(self) -> None:
        self._summary_cache = await self._fetch_summary()

    async def _fetch_summary(self) -> dict:
        try:
            clients = await self._fetch_clients()
            devices = await self._fetch_devices()
            clients_wifi = sum(1 for c in clients if not c.get("is_wired", True))
            clients_wired = sum(1 for c in clients if c.get("is_wired", True))
            devices_online = sum(1 for d in devices if d.get("state") == "ONLINE")
            result = {
                "status": "ok",
                "clients_total": len(clients),
                "clients_wifi": clients_wifi,
                "clients_wired": clients_wired,
                "devices_total": len(devices),
                "devices_online": devices_online,
            }
            self._summary_cache = result
            return result
        except Exception as exc:
            logger.error("UniFi fetch_summary error: %s", exc)
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.unifi.api import make_router
        return make_router(self)
