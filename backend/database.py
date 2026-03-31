from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_PATH = os.getenv("DATABASE_PATH", "/data/uhld.db")
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def migrate_db() -> None:
    """
    Safe schema migrations for existing databases.
    Each section is independent — early completion of one section does not
    skip subsequent sections.
    """
    # ── plugin_configs table — add instance_id/instance_label ────────────────
    async with engine.begin() as conn:
        table_result = await conn.execute(text("""
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name IN ('plugin_configs', 'plugin_configs_new')
        """))
        tables = {row[0] for row in table_result.fetchall()}

        has_plugin_configs = "plugin_configs" in tables
        has_plugin_configs_new = "plugin_configs_new" in tables

        # If a previous migration dropped plugin_configs but didn't rename
        # plugin_configs_new yet, recover by completing the rename.
        if not has_plugin_configs and has_plugin_configs_new:
            await conn.execute(text("ALTER TABLE plugin_configs_new RENAME TO plugin_configs"))
        elif has_plugin_configs:
            result = await conn.execute(text("PRAGMA table_info(plugin_configs)"))
            cols = {row[1] for row in result.fetchall()}

            if "instance_id" in cols:
                # Migration already applied. Clean up stale temp table from a prior failed run.
                if has_plugin_configs_new:
                    await conn.execute(text("DROP TABLE plugin_configs_new"))
            else:
                # Recreate table with correct schema, preserving all data.
                await conn.execute(text("DROP TABLE IF EXISTS plugin_configs_new"))
                await conn.execute(text("""
                    CREATE TABLE plugin_configs_new (
                        id INTEGER NOT NULL PRIMARY KEY,
                        plugin_id VARCHAR(64) NOT NULL,
                        instance_id VARCHAR(64) NOT NULL DEFAULT 'default',
                        instance_label VARCHAR(128),
                        enabled BOOLEAN NOT NULL DEFAULT 0,
                        config_json TEXT,
                        last_health_check DATETIME,
                        health_status VARCHAR(16),
                        health_message TEXT,
                        created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                        updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                        UNIQUE (plugin_id, instance_id)
                    )
                """))
                await conn.execute(text("""
                    INSERT INTO plugin_configs_new
                        (id, plugin_id, instance_id, instance_label, enabled, config_json,
                         last_health_check, health_status, health_message, created_at, updated_at)
                    SELECT id, plugin_id, 'default', NULL, enabled, config_json,
                           last_health_check, health_status, health_message, created_at, updated_at
                    FROM plugin_configs
                """))
                await conn.execute(text("DROP TABLE plugin_configs"))
                await conn.execute(text("ALTER TABLE plugin_configs_new RENAME TO plugin_configs"))

    # ── users table — add columns added after initial release ────────────────
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(users)"))
        user_cols = {row[1] for row in result.fetchall()}
        if user_cols:  # table exists
            new_user_cols = [
                ("role",         "VARCHAR(32) NOT NULL DEFAULT 'admin'"),
                ("is_active",    "BOOLEAN NOT NULL DEFAULT 1"),
                ("totp_secret",  "TEXT"),
                ("totp_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ]
            for col, typedef in new_user_cols:
                if col not in user_cols:
                    await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {typedef}"))
            # Backfill role from is_admin for existing rows that got the new column
            if "role" not in user_cols:
                await conn.execute(text(
                    "UPDATE users SET role = CASE WHEN is_admin = 1 THEN 'admin' ELSE 'viewer' END"
                ))

    # ── assets table — add columns that were missing from initial schema ──────
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(assets)"))
        asset_cols = {row[1] for row in result.fetchall()}
        if asset_cols:  # table exists (not a fresh install)
            new_asset_cols = [
                ("asset_type",  "VARCHAR(32)  NOT NULL DEFAULT 'other'"),
                ("role",        "VARCHAR(128)"),
                ("manufacturer","VARCHAR(128)"),
                ("model",       "VARCHAR(128)"),
                ("cpu",         "VARCHAR(256)"),
                ("cpu_cores",   "INTEGER"),
                ("ram_gb",      "INTEGER"),
                ("storage",     "VARCHAR(256)"),
                ("gpu",         "VARCHAR(256)"),
                ("os",          "VARCHAR(128)"),
                ("ip_address",  "VARCHAR(64)"),
                ("notes",       "TEXT"),
                ("created_at",  "DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)"),
                ("updated_at",  "DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)"),
            ]
            for col, typedef in new_asset_cols:
                if col not in asset_cols:
                    await conn.execute(text(f"ALTER TABLE assets ADD COLUMN {col} {typedef}"))


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
