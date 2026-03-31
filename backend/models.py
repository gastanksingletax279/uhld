from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class PluginConfig(Base):
    __tablename__ = "plugin_configs"
    __table_args__ = (
        UniqueConstraint("plugin_id", "instance_id", name="uq_plugin_instance"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plugin_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    # "default" for the first/only instance; user-defined slug for additional instances
    instance_id: Mapped[str] = mapped_column(String(64), default="default", nullable=False)
    # Human-readable label shown in the UI (e.g. "Home", "Work Cluster")
    instance_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Encrypted JSON string containing plugin configuration
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_health_check: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    health_status: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "ok" | "error" | None
    health_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    role: Mapped[str | None] = mapped_column(String(128), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cpu: Mapped[str | None] = mapped_column(String(256), nullable=True)
    cpu_cores: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ram_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage: Mapped[str | None] = mapped_column(String(256), nullable=True)
    gpu: Mapped[str | None] = mapped_column(String(256), nullable=True)
    os: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
