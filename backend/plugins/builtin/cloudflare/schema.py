from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DNSRecordBody(BaseModel):
    type: str = Field(min_length=1)
    name: str = Field(min_length=1)
    content: str | None = None
    ttl: int | None = Field(default=None, ge=1)
    proxied: bool | None = None
    comment: str | None = None
    priority: int | None = None
    data: dict[str, Any] | None = None


class ZoneSettingPatchBody(BaseModel):
    value: Any | None = None
    enabled: bool | None = None
