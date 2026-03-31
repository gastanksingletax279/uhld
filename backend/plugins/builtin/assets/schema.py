from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AssetCreate(BaseModel):
    name: str
    asset_type: str = "other"
    role: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    cpu: str | None = None
    cpu_cores: int | None = None
    ram_gb: int | None = None
    storage: str | None = None
    gpu: str | None = None
    os: str | None = None
    ip_address: str | None = None
    notes: str | None = None


class AssetUpdate(AssetCreate):
    pass


class AssetOut(AssetCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
