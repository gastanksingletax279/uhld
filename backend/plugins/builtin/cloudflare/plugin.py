from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
from typing import Any

from cloudflare import APIStatusError, Cloudflare, PermissionDeniedError, RateLimitError
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class CloudflarePluginError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class CloudflarePlugin(PluginBase):
    plugin_id = "cloudflare"
    display_name = "Cloudflare"
    description = "Manage Cloudflare zones, DNS records, analytics, and security settings"
    version = "1.0.0"
    icon = "cloud"
    category = "network"
    poll_interval = 300

    config_schema = {
        "type": "object",
        "properties": {
            "api_token": {
                "type": "string",
                "title": "API Token",
                "format": "password",
                "sensitive": True,
                "description": (
                    "Create a scoped API token at https://dash.cloudflare.com/profile/api-tokens. "
                    "Click Create Token and start from the Edit zone DNS template (or create custom). "
                    "Recommended permissions: Zone->Zone Read, Zone->DNS Edit, Zone->Zone Settings Read, "
                    "Zone->Cache Purge (optional), Account->Account Analytics Read (optional). "
                    "Scope token to specific zones or All zones as needed. Never use the Global API Key."
                ),
            },
            "account_id": {
                "type": "string",
                "title": "Account ID",
                "description": "Found in the right sidebar of any zone overview page in the Cloudflare dashboard",
            },
        },
        "required": ["api_token", "account_id"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: Cloudflare | None = None
        self._zone_cache: list[dict[str, Any]] = []
        self._analytics_cache: dict[str, dict[str, Any]] = {}
        self._summary_cache: dict[str, Any] | None = None
        self._cache_updated_at: str | None = None

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        self._client = None
        self._zone_cache = []
        self._analytics_cache = {}
        self._summary_cache = None
        self._cache_updated_at = None
        try:
            await self.scheduled_poll()
        except Exception as exc:
            logger.warning("Cloudflare initial poll failed: %s", exc)

    async def on_disable(self) -> None:
        self._client = None
        self._zone_cache = []
        self._analytics_cache = {}
        self._summary_cache = None
        self._cache_updated_at = None

    def _get_client(self) -> Cloudflare:
        if self._client is None:
            token = str(self.get_config("api_token", "")).strip()
            if not token:
                raise CloudflarePluginError(400, "Missing API token")
            self._client = Cloudflare(api_token=token)
        return self._client

    def _serialize(self, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, list):
            return [self._serialize(v) for v in value]
        if isinstance(value, dict):
            return {k: self._serialize(v) for k, v in value.items()}
        if hasattr(value, "model_dump"):
            return self._serialize(value.model_dump())
        if hasattr(value, "to_dict"):
            return self._serialize(value.to_dict())
        if hasattr(value, "dict"):
            return self._serialize(value.dict())
        return str(value)

    def _extract_api_errors(self, body: Any) -> str | None:
        if not isinstance(body, dict):
            return None
        errors = body.get("errors")
        if not isinstance(errors, list) or not errors:
            return None
        parts: list[str] = []
        for err in errors:
            if not isinstance(err, dict):
                continue
            code = err.get("code")
            msg = err.get("message")
            if code is not None and msg:
                parts.append(f"[{code}] {msg}")
            elif msg:
                parts.append(str(msg))
        return "; ".join(parts) if parts else None

    def _map_exception(self, exc: Exception, fallback: str) -> CloudflarePluginError:
        if isinstance(exc, CloudflarePluginError):
            return exc

        if isinstance(exc, PermissionDeniedError):
            return CloudflarePluginError(
                403,
                "Cloudflare permission denied. Verify API token scopes: Zone Read, DNS Edit, Zone Settings Read, and optional Cache Purge/Account Analytics.",
            )

        if isinstance(exc, RateLimitError):
            retry_after = None
            if getattr(exc, "response", None) is not None:
                retry_after = exc.response.headers.get("retry-after")
            if retry_after:
                logger.warning("Cloudflare rate limited, retry-after=%s", retry_after)
            return CloudflarePluginError(429, "Cloudflare rate limit reached. Please retry in a moment.")

        if isinstance(exc, APIStatusError):
            status_code = exc.response.status_code
            api_message = self._extract_api_errors(getattr(exc, "body", None))
            if status_code == 403:
                detail = (
                    api_message
                    or "Permission denied by Cloudflare API. Your token is missing required permissions for this action."
                )
                return CloudflarePluginError(403, detail)
            if status_code == 429:
                retry_after = exc.response.headers.get("retry-after")
                if retry_after:
                    logger.warning("Cloudflare rate limited, retry-after=%s", retry_after)
                return CloudflarePluginError(429, "Cloudflare rate limit reached. Please retry in a moment.")
            return CloudflarePluginError(status_code, api_message or fallback)

        return CloudflarePluginError(502, f"{fallback}: {exc}")

    def _iterate_page(self, page: Any) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        current = page
        while current is not None:
            for item in current:
                data = self._serialize(item)
                if isinstance(data, dict):
                    items.append(data)
            if not hasattr(current, "has_next_page") or not current.has_next_page():
                break
            current = current.get_next_page()
        return items

    def _normalize_zone(self, zone: dict[str, Any]) -> dict[str, Any]:
        plan_name = "unknown"
        plan = zone.get("plan")
        if isinstance(plan, dict):
            plan_name = str(plan.get("name") or plan.get("legacy_id") or "unknown")

        status = str(zone.get("status") or "unknown")
        paused = bool(zone.get("paused", False))
        if paused and status == "active":
            status = "paused"

        return {
            "id": str(zone.get("id") or ""),
            "name": str(zone.get("name") or ""),
            "status": status,
            "plan": plan_name,
            "nameservers": zone.get("name_servers") or [],
            "paused": paused,
            "modified_on": zone.get("modified_on"),
        }

    async def health_check(self) -> dict:
        try:
            zones = await self._list_zones_live()
            return {
                "status": "ok",
                "message": f"Connected to Cloudflare ({len(zones)} zone(s))",
            }
        except Exception as exc:
            mapped = self._map_exception(exc, "Cloudflare health check failed")
            return {"status": "error", "message": mapped.detail}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache

        zones = self._zone_cache
        if not zones:
            return {
                "status": "ok",
                "zone_count": 0,
                "active_zones": 0,
                "paused_zones": 0,
                "total_requests_24h": 0,
                "total_threats_24h": 0,
                "attention_zones": [],
                "cache_updated_at": self._cache_updated_at,
            }

        return self._compute_summary(zones, self._analytics_cache)

    async def scheduled_poll(self) -> None:
        try:
            zones = await self._list_zones_live()
            analytics_by_zone: dict[str, dict[str, Any]] = {}
            for zone in zones:
                zone_id = str(zone.get("id") or "")
                if not zone_id:
                    continue
                try:
                    analytics_by_zone[zone_id] = await self.get_zone_analytics(zone_id=zone_id, range_key="24h")
                except Exception as exc:
                    logger.warning("Cloudflare analytics poll failed for zone %s: %s", zone_id, exc)
                    analytics_by_zone[zone_id] = {
                        "requests": 0,
                        "bandwidth": 0,
                        "threats": 0,
                        "page_views": 0,
                        "cached_requests": 0,
                        "uncached_requests": 0,
                        "range": "24h",
                    }

            self._zone_cache = zones
            self._analytics_cache = analytics_by_zone
            self._summary_cache = self._compute_summary(zones, analytics_by_zone)
            self._cache_updated_at = datetime.now(UTC).isoformat()
            self._summary_cache["cache_updated_at"] = self._cache_updated_at
        except Exception as exc:
            mapped = self._map_exception(exc, "Cloudflare background poll failed")
            self._summary_cache = {"status": "error", "message": mapped.detail}
            logger.error("%s", mapped.detail)

    def _compute_summary(self, zones: list[dict[str, Any]], analytics_by_zone: dict[str, dict[str, Any]]) -> dict[str, Any]:
        zone_count = len(zones)
        active_zones = sum(1 for zone in zones if str(zone.get("status")) == "active")
        paused_zones = sum(1 for zone in zones if bool(zone.get("paused")) or str(zone.get("status")) == "paused")

        total_requests = 0
        total_threats = 0
        for zone in zones:
            zid = str(zone.get("id") or "")
            metrics = analytics_by_zone.get(zid) or {}
            total_requests += int(metrics.get("requests") or 0)
            total_threats += int(metrics.get("threats") or 0)

        attention = [
            {
                "id": zone.get("id"),
                "name": zone.get("name"),
                "status": zone.get("status"),
                "paused": zone.get("paused", False),
            }
            for zone in zones
            if str(zone.get("status")) != "active" or bool(zone.get("paused"))
        ]

        return {
            "status": "ok",
            "zone_count": zone_count,
            "active_zones": active_zones,
            "paused_zones": paused_zones,
            "total_requests_24h": total_requests,
            "total_threats_24h": total_threats,
            "attention_zones": attention,
            "cache_updated_at": self._cache_updated_at,
        }

    async def _list_zones_live(self) -> list[dict[str, Any]]:
        client = self._get_client()
        try:
            zones_page = client.zones.list(page=1, per_page=50)
            zones = [self._normalize_zone(zone) for zone in self._iterate_page(zones_page)]
            return zones
        except Exception as exc:
            raise self._map_exception(exc, "Failed to list zones")

    async def list_zones_cached(self) -> list[dict[str, Any]]:
        if self._zone_cache:
            return self._zone_cache
        await self.scheduled_poll()
        return self._zone_cache

    async def get_zone(self, zone_id: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            zone = client.zones.get(zone_id=zone_id)
            data = self._serialize(zone)
            if not isinstance(data, dict):
                raise CloudflarePluginError(502, "Unexpected zone payload")
            normalized = self._normalize_zone(data)
            normalized["raw"] = data
            return normalized
        except Exception as exc:
            raise self._map_exception(exc, "Failed to fetch zone detail")

    async def set_zone_pause(self, zone_id: str, paused: bool) -> dict[str, Any]:
        client = self._get_client()
        try:
            result = client.zones.edit(zone_id=zone_id, paused=paused)
            self._summary_cache = None
            data = self._serialize(result)
            return {"status": "ok", "zone": data}
        except Exception as exc:
            raise self._map_exception(exc, "Failed to update zone paused state")

    async def purge_zone_cache(self, zone_id: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            result = client.cache.purge(zone_id=zone_id, purge_everything=True)
            data = self._serialize(result)
            return {"status": "ok", "result": data}
        except Exception as exc:
            raise self._map_exception(exc, "Failed to purge zone cache")

    async def list_dns_records(self, zone_id: str, record_type: str | None = None, name: str | None = None) -> list[dict[str, Any]]:
        client = self._get_client()
        try:
            kwargs: dict[str, Any] = {"zone_id": zone_id, "page": 1, "per_page": 100}
            if record_type:
                kwargs["type"] = record_type.upper()
            if name:
                kwargs["name"] = name
            page = client.dns.records.list(**kwargs)
            records = self._iterate_page(page)
            result: list[dict[str, Any]] = []
            for record in records:
                result.append(
                    {
                        "id": str(record.get("id") or ""),
                        "type": record.get("type"),
                        "name": record.get("name"),
                        "content": record.get("content"),
                        "ttl": record.get("ttl"),
                        "proxied": record.get("proxied"),
                        "created_on": record.get("created_on"),
                        "modified_on": record.get("modified_on"),
                        "priority": record.get("priority"),
                        "comment": record.get("comment"),
                        "data": record.get("data"),
                    }
                )
            return result
        except Exception as exc:
            raise self._map_exception(exc, "Failed to list DNS records")

    async def get_dns_record(self, zone_id: str, record_id: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            record = client.dns.records.get(record_id, zone_id=zone_id)
            data = self._serialize(record)
            if not isinstance(data, dict):
                raise CloudflarePluginError(502, "Unexpected DNS record payload")
            return data
        except Exception as exc:
            raise self._map_exception(exc, "Failed to fetch DNS record")

    def _dns_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        body: dict[str, Any] = {
            "name": str(payload.get("name") or ""),
            "type": str(payload.get("type") or "").upper(),
        }

        if payload.get("content") is not None:
            body["content"] = str(payload.get("content"))
        if payload.get("ttl") is not None:
            body["ttl"] = int(payload.get("ttl"))
        if payload.get("proxied") is not None:
            body["proxied"] = bool(payload.get("proxied"))
        if payload.get("comment") is not None:
            body["comment"] = str(payload.get("comment"))
        if payload.get("priority") is not None:
            body["priority"] = int(payload.get("priority"))
        if isinstance(payload.get("data"), dict):
            body["data"] = payload.get("data")

        return body

    async def create_dns_record(self, zone_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        client = self._get_client()
        try:
            body = self._dns_payload(payload)
            record = client.dns.records.create(zone_id=zone_id, **body)
            data = self._serialize(record)
            return data if isinstance(data, dict) else {"status": "ok"}
        except Exception as exc:
            raise self._map_exception(exc, "Failed to create DNS record")

    async def update_dns_record(self, zone_id: str, record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        client = self._get_client()
        try:
            body = self._dns_payload(payload)
            record = client.dns.records.update(record_id, zone_id=zone_id, **body)
            data = self._serialize(record)
            return data if isinstance(data, dict) else {"status": "ok"}
        except Exception as exc:
            raise self._map_exception(exc, "Failed to update DNS record")

    async def delete_dns_record(self, zone_id: str, record_id: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            result = client.dns.records.delete(record_id, zone_id=zone_id)
            return {"status": "ok", "result": self._serialize(result)}
        except Exception as exc:
            raise self._map_exception(exc, "Failed to delete DNS record")

    def _analytics_window(self, range_key: str) -> tuple[str, str]:
        now = datetime.now(UTC)
        if range_key == "7d":
            since = now - timedelta(days=7)
        elif range_key == "30d":
            since = now - timedelta(days=30)
        else:
            since = now - timedelta(days=1)
        return since.isoformat(), now.isoformat()

    async def get_zone_analytics(self, zone_id: str, range_key: str = "24h") -> dict[str, Any]:
        client = self._get_client()
        since, until = self._analytics_window(range_key)
        try:
            report = client.dns.analytics.reports.get(
                zone_id=zone_id,
                since=since,
                until=until,
                metrics="queryCount,uncachedCount,staleCount,responseTime99,queryCountByResponseCode",
            )
            data = self._serialize(report)
            totals = ((data or {}).get("totals") if isinstance(data, dict) else None) or {}
            requests_total = int(totals.get("queryCount") or 0)
            uncached = int(totals.get("uncachedCount") or 0)
            threats = int(totals.get("queryCountByResponseCode", {}).get("REFUSED") or 0)

            bytimes = client.dns.analytics.reports.bytimes(
                zone_id=zone_id,
                since=since,
                until=until,
                metrics="queryCount,uncachedCount",
                time_delta="hour" if range_key == "24h" else "day",
            )
            bytimes_data = self._serialize(bytimes)
            series: list[dict[str, Any]] = []
            rows = ((bytimes_data or {}).get("data") if isinstance(bytimes_data, dict) else None) or []
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    dimensions = row.get("dimensions") or {}
                    metrics = row.get("metrics") or {}
                    queries = int(metrics.get("queryCount") or 0)
                    uncached_queries = int(metrics.get("uncachedCount") or 0)
                    series.append(
                        {
                            "label": str(dimensions.get("datetime") or dimensions.get("date") or ""),
                            "requests": queries,
                            "cached": max(queries - uncached_queries, 0),
                            "uncached": max(uncached_queries, 0),
                        }
                    )

            dashboard = client.get(
                f"/zones/{zone_id}/analytics/dashboard?since={since}&until={until}",
                cast_to=dict,
            )
            dashboard_result = dashboard.get("result") if isinstance(dashboard, dict) else {}

            page_views = int((dashboard_result or {}).get("totals", {}).get("pageviews", {}).get("all", 0) or 0)
            bandwidth = int((dashboard_result or {}).get("totals", {}).get("bandwidth", {}).get("all", 0) or 0)
            cached = requests_total - uncached

            return {
                "range": range_key,
                "requests": requests_total,
                "bandwidth": bandwidth,
                "threats": threats,
                "page_views": page_views,
                "cached_requests": max(cached, 0),
                "uncached_requests": max(uncached, 0),
                "series": series,
                "raw": {
                    "dns": data,
                    "bytimes": bytimes_data,
                    "dashboard": dashboard_result,
                },
            }
        except Exception as exc:
            mapped = self._map_exception(exc, "Failed to fetch zone analytics")
            if mapped.status_code == 403:
                # DNS Analytics requires a separate token permission. Degrade gracefully
                # instead of polluting logs on every poll cycle.
                logger.debug("Cloudflare DNS analytics unavailable for zone %s (token missing DNS Analytics Read permission)", zone_id)
                return {
                    "range": range_key,
                    "requests": 0,
                    "bandwidth": 0,
                    "threats": 0,
                    "page_views": 0,
                    "cached_requests": 0,
                    "uncached_requests": 0,
                    "series": [],
                    "analytics_unavailable": True,
                }
            raise mapped

    async def get_zone_settings(self, zone_id: str) -> dict[str, Any]:
        client = self._get_client()
        setting_keys = [
            "ssl",
            "always_use_https",
            "strict_transport_security",
            "security_level",
            "cache_level",
            "development_mode",
            "minify",
            "brotli",
            "http2",
            "http3",
        ]

        result: dict[str, Any] = {}
        for key in setting_keys:
            try:
                setting = client.zones.settings.get(key, zone_id=zone_id)
                result[key] = self._serialize(setting)
            except Exception as exc:
                mapped = self._map_exception(exc, f"Failed to fetch setting: {key}")
                if mapped.status_code == 403:
                    result[key] = {"error": mapped.detail}
                else:
                    raise mapped
        return result

    async def update_zone_setting(self, zone_id: str, setting: str, payload: dict[str, Any]) -> dict[str, Any]:
        client = self._get_client()
        try:
            kwargs: dict[str, Any] = {"zone_id": zone_id}
            if "enabled" in payload and payload.get("enabled") is not None:
                kwargs["enabled"] = bool(payload.get("enabled"))
            if "value" in payload:
                kwargs["value"] = payload.get("value")
            updated = client.zones.settings.edit(setting, **kwargs)
            return self._serialize(updated)
        except Exception as exc:
            raise self._map_exception(exc, "Failed to update zone setting")

    async def get_zone_ssl(self, zone_id: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            ssl_mode = client.zones.settings.get("ssl", zone_id=zone_id)
            universal = client.ssl.universal.settings.get(zone_id=zone_id)
            certs = client.ssl.certificate_packs.list(zone_id=zone_id, status="all")
            return {
                "ssl_mode": self._serialize(ssl_mode),
                "universal_ssl": self._serialize(universal),
                "edge_certificates": self._iterate_page(certs),
            }
        except Exception as exc:
            raise self._map_exception(exc, "Failed to fetch SSL/TLS data")

    async def list_firewall_rules(self, zone_id: str) -> dict[str, Any]:
        client = self._get_client()
        try:
            rules_page = client.firewall.rules.list(zone_id=zone_id, page=1, per_page=100)
            return {"rules": self._iterate_page(rules_page), "upgrade_required": False}
        except Exception as exc:
            mapped = self._map_exception(exc, "Failed to fetch firewall rules")
            if mapped.status_code == 403:
                return {
                    "rules": [],
                    "upgrade_required": True,
                    "message": "Firewall/WAF rule listing requires additional Cloudflare plan/features or token permissions.",
                }
            raise mapped

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.cloudflare.api import make_router

        return make_router(self)
