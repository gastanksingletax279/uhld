from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, require_admin
from backend.database import get_db
from backend.models import Notification, User

if TYPE_CHECKING:
    from backend.plugins.builtin.notifications.plugin import NotificationsPlugin


def make_router(plugin: NotificationsPlugin) -> APIRouter:
    router = APIRouter()

    # ── History ───────────────────────────────────────────────────────────────

    @router.get("/history")
    async def get_history(
        limit: int = 50,
        offset: int = 0,
        level: str | None = None,
        unread_only: bool = False,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        q = select(Notification).order_by(Notification.created_at.desc())
        count_q = select(func.count()).select_from(Notification)
        if level:
            q = q.where(Notification.level == level)
            count_q = count_q.where(Notification.level == level)
        if unread_only:
            q = q.where(Notification.read == False)  # noqa: E712
            count_q = count_q.where(Notification.read == False)  # noqa: E712
        q = q.offset(offset).limit(limit)

        result = await db.execute(q)
        items = result.scalars().all()
        total = await db.scalar(count_q) or 0

        return {
            "total": total,
            "items": [
                {
                    "id": n.id,
                    "event_type": n.event_type,
                    "plugin_id": n.plugin_id,
                    "instance_id": n.instance_id,
                    "title": n.title,
                    "message": n.message,
                    "level": n.level,
                    "channels_sent": n.channels_sent,
                    "read": n.read,
                    "created_at": n.created_at.isoformat(),
                }
                for n in items
            ],
        }

    # ── Mark read ─────────────────────────────────────────────────────────────

    class MarkReadBody(BaseModel):
        ids: list[int] | None = None  # None = mark all

    @router.post("/mark-read")
    async def mark_read(
        body: MarkReadBody,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        if body.ids is None:
            result = await db.execute(
                select(Notification).where(Notification.read == False)  # noqa: E712
            )
            for n in result.scalars().all():
                n.read = True
        else:
            result = await db.execute(
                select(Notification).where(Notification.id.in_(body.ids))
            )
            for n in result.scalars().all():
                n.read = True
        await db.commit()
        plugin._summary_cache = None
        return {"message": "Marked as read"}

    # ── Clear history ─────────────────────────────────────────────────────────

    @router.delete("/history")
    async def clear_history(
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_admin),
    ):
        result = await db.execute(select(Notification))
        for n in result.scalars().all():
            await db.delete(n)
        await db.commit()
        plugin._summary_cache = None
        return {"message": "Notification history cleared"}

    # ── Test channel ──────────────────────────────────────────────────────────

    @router.post("/test/{channel}")
    async def test_channel(
        channel: str,
        _: User = Depends(require_admin),
    ):
        if channel not in {"email", "telegram", "webhook"}:
            raise HTTPException(status_code=400, detail=f"Unknown channel: {channel!r}")
        try:
            import asyncio

            if channel == "email":
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    plugin._send_email,
                    "Test Notification",
                    "This is a test notification from UHLD.",
                    "info",
                )
            elif channel == "telegram":
                await plugin._send_telegram(
                    "Test Notification",
                    "This is a test notification from UHLD.",
                    "info",
                )
            elif channel == "webhook":
                await plugin._send_webhook(
                    "test",
                    "Test Notification",
                    "This is a test notification from UHLD.",
                    "info",
                    None,
                    None,
                )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        return {"message": f"Test {channel} notification sent successfully"}

    return router
