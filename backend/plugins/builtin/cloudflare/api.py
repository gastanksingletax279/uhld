from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user, require_admin
from backend.models import User
from backend.plugins.builtin.cloudflare.schema import DNSRecordBody, ZoneSettingPatchBody

if TYPE_CHECKING:
    from backend.plugins.builtin.cloudflare.plugin import CloudflarePlugin, CloudflarePluginError


def _raise_http(exc: Exception) -> None:
    from backend.plugins.builtin.cloudflare.plugin import CloudflarePluginError

    if isinstance(exc, CloudflarePluginError):
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    raise HTTPException(status_code=502, detail=str(exc))


def make_router(plugin: CloudflarePlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/zones")
    async def list_zones(_: User = Depends(get_current_user)):
        try:
            zones = await plugin.list_zones_cached()
            return {
                "zones": zones,
                "cache_updated_at": plugin._cache_updated_at,
            }
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}")
    async def get_zone(zone_id: str, _: User = Depends(get_current_user)):
        try:
            return {"zone": await plugin.get_zone(zone_id)}
        except Exception as exc:
            _raise_http(exc)

    @router.post("/zones/{zone_id}/pause")
    async def pause_zone(zone_id: str, _: User = Depends(require_admin)):
        try:
            return await plugin.set_zone_pause(zone_id=zone_id, paused=True)
        except Exception as exc:
            _raise_http(exc)

    @router.post("/zones/{zone_id}/unpause")
    async def unpause_zone(zone_id: str, _: User = Depends(require_admin)):
        try:
            return await plugin.set_zone_pause(zone_id=zone_id, paused=False)
        except Exception as exc:
            _raise_http(exc)

    @router.post("/zones/{zone_id}/purge-cache")
    async def purge_cache(zone_id: str, _: User = Depends(require_admin)):
        try:
            return await plugin.purge_zone_cache(zone_id=zone_id)
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}/dns-records")
    async def list_dns_records(
        zone_id: str,
        type: str | None = Query(default=None),
        name: str | None = Query(default=None),
        _: User = Depends(get_current_user),
    ):
        try:
            records = await plugin.list_dns_records(zone_id=zone_id, record_type=type, name=name)
            return {"records": records}
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}/dns-records/{record_id}")
    async def get_dns_record(zone_id: str, record_id: str, _: User = Depends(get_current_user)):
        try:
            return {"record": await plugin.get_dns_record(zone_id=zone_id, record_id=record_id)}
        except Exception as exc:
            _raise_http(exc)

    @router.post("/zones/{zone_id}/dns-records")
    async def create_dns_record(zone_id: str, body: DNSRecordBody, _: User = Depends(require_admin)):
        try:
            return {"record": await plugin.create_dns_record(zone_id=zone_id, payload=body.model_dump())}
        except Exception as exc:
            _raise_http(exc)

    @router.put("/zones/{zone_id}/dns-records/{record_id}")
    async def update_dns_record(
        zone_id: str,
        record_id: str,
        body: DNSRecordBody,
        _: User = Depends(require_admin),
    ):
        try:
            return {"record": await plugin.update_dns_record(zone_id=zone_id, record_id=record_id, payload=body.model_dump())}
        except Exception as exc:
            _raise_http(exc)

    @router.delete("/zones/{zone_id}/dns-records/{record_id}")
    async def delete_dns_record(zone_id: str, record_id: str, _: User = Depends(require_admin)):
        try:
            return await plugin.delete_dns_record(zone_id=zone_id, record_id=record_id)
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}/analytics")
    async def zone_analytics(
        zone_id: str,
        range: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
        _: User = Depends(get_current_user),
    ):
        try:
            return {"analytics": await plugin.get_zone_analytics(zone_id=zone_id, range_key=range)}
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}/settings")
    async def zone_settings(zone_id: str, _: User = Depends(get_current_user)):
        try:
            return {"settings": await plugin.get_zone_settings(zone_id=zone_id)}
        except Exception as exc:
            _raise_http(exc)

    @router.patch("/zones/{zone_id}/settings/{setting}")
    async def patch_zone_setting(
        zone_id: str,
        setting: str,
        body: ZoneSettingPatchBody,
        _: User = Depends(require_admin),
    ):
        try:
            return {
                "setting": await plugin.update_zone_setting(
                    zone_id=zone_id,
                    setting=setting,
                    payload=body.model_dump(),
                )
            }
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}/ssl")
    async def zone_ssl(zone_id: str, _: User = Depends(get_current_user)):
        try:
            return await plugin.get_zone_ssl(zone_id=zone_id)
        except Exception as exc:
            _raise_http(exc)

    @router.get("/zones/{zone_id}/firewall/rules")
    async def zone_firewall_rules(zone_id: str, _: User = Depends(get_current_user)):
        try:
            return await plugin.list_firewall_rules(zone_id=zone_id)
        except Exception as exc:
            _raise_http(exc)

    return router
