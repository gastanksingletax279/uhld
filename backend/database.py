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
    Recreates plugin_configs table to add instance_id/instance_label and
    replace the single-column unique constraint with a composite one.
    Only runs when the instance_id column is absent.
    """
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(plugin_configs)"))
        cols = {row[1] for row in result.fetchall()}

        if "instance_id" not in cols:
            # Recreate table with correct schema, preserving all data
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


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
