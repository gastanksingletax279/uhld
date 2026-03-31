from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import smtplib
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from fastapi import APIRouter

from backend.notifications import clear_notification_plugin, set_notification_plugin
from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)

_LEVEL_ORDER = {"info": 0, "warning": 1, "error": 2}


class NotificationsPlugin(PluginBase):
    plugin_id = "notifications"
    display_name = "Notifications"
    description = "Alert via email, Telegram, and webhooks when plugin health changes or errors occur"
    version = "1.0.0"
    icon = "bell"
    category = "automation"
    poll_interval = 0  # health checks are done via a separate APScheduler job

    config_schema = {
        "type": "object",
        "properties": {
            # ── Email ─────────────────────────────────────────────────────────
            "email_enabled": {
                "type": "boolean",
                "title": "Enable Email Notifications",
                "default": False,
            },
            "smtp_host": {"type": "string", "title": "SMTP Host"},
            "smtp_port": {"type": "integer", "title": "SMTP Port", "default": 587},
            "smtp_user": {"type": "string", "title": "SMTP Username"},
            "smtp_password": {
                "type": "string",
                "title": "SMTP Password",
                "format": "password",
                "sensitive": True,
            },
            "smtp_tls": {
                "type": "boolean",
                "title": "Use STARTTLS",
                "default": True,
                "description": "Upgrade connection with STARTTLS (recommended for port 587)",
            },
            "smtp_ssl": {
                "type": "boolean",
                "title": "Use SSL",
                "default": False,
                "description": "Connect with SSL from the start (use for port 465)",
            },
            "email_from": {"type": "string", "title": "From Address"},
            "email_to": {
                "type": "string",
                "title": "To Address(es)",
                "description": "Comma-separated list of recipient email addresses",
            },
            # ── Telegram ──────────────────────────────────────────────────────
            "telegram_enabled": {
                "type": "boolean",
                "title": "Enable Telegram Notifications",
                "default": False,
            },
            "telegram_bot_token": {
                "type": "string",
                "title": "Telegram Bot Token",
                "sensitive": True,
                "format": "password",
            },
            "telegram_chat_id": {
                "type": "string",
                "title": "Telegram Chat ID",
                "description": "Chat ID to send notifications to (user, group, or channel)",
            },
            # ── Webhook ───────────────────────────────────────────────────────
            "webhook_enabled": {
                "type": "boolean",
                "title": "Enable Webhook Notifications",
                "default": False,
            },
            "webhook_url": {"type": "string", "title": "Webhook URL"},
            "webhook_secret": {
                "type": "string",
                "title": "Webhook HMAC Secret",
                "description": "Signs the payload with HMAC-SHA256 and sends it in the X-Signature-256 header",
                "sensitive": True,
                "format": "password",
            },
            # ── Filters ───────────────────────────────────────────────────────
            "notify_on_error": {
                "type": "boolean",
                "title": "Notify on Plugin Errors",
                "default": True,
            },
            "notify_on_health_change": {
                "type": "boolean",
                "title": "Notify on Health State Changes",
                "default": True,
                "description": "Alert when a plugin transitions from healthy to degraded or vice versa",
            },
            "min_level": {
                "type": "string",
                "title": "Minimum Notification Level",
                "enum": ["info", "warning", "error"],
                "default": "warning",
                "description": "Notifications below this level are silently dropped",
            },
            # ── Auto health checks ────────────────────────────────────────────
            "health_check_interval": {
                "type": "integer",
                "title": "Auto Health Check Interval (minutes)",
                "default": 5,
                "description": "Periodically check all plugin health and alert on changes. Set to 0 to disable.",
            },
        },
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        # Previous health statuses for change detection: "{plugin_id}:{instance_id}" -> "ok"|"error"
        self._last_health: dict[str, str] = {}
        self._summary_cache: dict | None = None

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        set_notification_plugin(self)
        interval_min = int(config.get("health_check_interval", 5))
        if interval_min > 0:
            from backend.scheduler import add_plugin_job

            add_plugin_job(
                "notifications:health_check",
                self._run_health_checks,
                interval_min * 60,
            )
        logger.info("Notifications plugin enabled")

    async def on_disable(self) -> None:
        clear_notification_plugin()
        from backend.scheduler import remove_plugin_job

        remove_plugin_job("notifications:health_check")
        logger.info("Notifications plugin disabled")

    async def health_check(self) -> dict:
        issues = []
        if self._config.get("email_enabled") and not self._config.get("smtp_host"):
            issues.append("Email enabled but SMTP host not configured")
        if self._config.get("telegram_enabled") and not self._config.get("telegram_bot_token"):
            issues.append("Telegram enabled but bot token not configured")
        if self._config.get("webhook_enabled") and not self._config.get("webhook_url"):
            issues.append("Webhook enabled but URL not configured")
        if issues:
            return {"status": "error", "message": "; ".join(issues)}
        channels = [
            ch
            for ch, key in [
                ("email", "email_enabled"),
                ("telegram", "telegram_enabled"),
                ("webhook", "webhook_enabled"),
            ]
            if self._config.get(key)
        ]
        return {
            "status": "ok",
            "message": f"Ready — {len(channels)} channel(s) active"
            + (f": {', '.join(channels)}" if channels else ""),
        }

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        try:
            from sqlalchemy import func, select

            from backend.database import AsyncSessionLocal
            from backend.models import Notification

            async with AsyncSessionLocal() as db:
                total = await db.scalar(select(func.count()).select_from(Notification)) or 0
                unread = (
                    await db.scalar(
                        select(func.count())
                        .select_from(Notification)
                        .where(Notification.read == False)  # noqa: E712
                    )
                    or 0
                )
                recent_result = await db.execute(
                    select(Notification)
                    .order_by(Notification.created_at.desc())
                    .limit(3)
                )
                recent = [
                    {
                        "id": n.id,
                        "title": n.title,
                        "level": n.level,
                        "read": n.read,
                        "created_at": n.created_at.isoformat(),
                    }
                    for n in recent_result.scalars().all()
                ]

            channels = [
                ch
                for ch, key in [
                    ("email", "email_enabled"),
                    ("telegram", "telegram_enabled"),
                    ("webhook", "webhook_enabled"),
                ]
                if self._config.get(key)
            ]
            self._summary_cache = {
                "status": "ok",
                "total": total,
                "unread": unread,
                "recent": recent,
                "channels": channels,
            }
            return self._summary_cache
        except Exception as exc:
            logger.error("Notifications get_summary error: %s", exc)
            return {"status": "error", "message": str(exc)}

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.notifications.api import make_router

        return make_router(self)

    # ── Public dispatch API used by backend/notifications.py ──────────────────

    async def dispatch(
        self,
        event_type: str,
        title: str,
        message: str,
        level: str = "info",
        plugin_id: str | None = None,
        instance_id: str | None = None,
    ) -> None:
        """Route a notification to all enabled channels and persist it."""
        # Apply minimum-level filter
        min_level = self._config.get("min_level", "warning")
        if _LEVEL_ORDER.get(level, 0) < _LEVEL_ORDER.get(min_level, 0):
            return

        # Apply event-type filters
        if event_type.startswith("health.") and not self._config.get(
            "notify_on_health_change", True
        ):
            return
        if event_type.startswith("plugin.error") and not self._config.get(
            "notify_on_error", True
        ):
            return

        channels_sent: list[str] = []

        if self._config.get("email_enabled"):
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None, self._send_email, title, message, level
                )
                channels_sent.append("email")
            except Exception as exc:
                logger.warning("Email notification failed: %s", exc)

        if self._config.get("telegram_enabled"):
            try:
                await self._send_telegram(title, message, level)
                channels_sent.append("telegram")
            except Exception as exc:
                logger.warning("Telegram notification failed: %s", exc)

        if self._config.get("webhook_enabled"):
            try:
                await self._send_webhook(
                    event_type, title, message, level, plugin_id, instance_id
                )
                channels_sent.append("webhook")
            except Exception as exc:
                logger.warning("Webhook notification failed: %s", exc)

        # Persist regardless of channel delivery outcome
        try:
            from backend.database import AsyncSessionLocal
            from backend.models import Notification

            async with AsyncSessionLocal() as db:
                notif = Notification(
                    event_type=event_type,
                    plugin_id=plugin_id,
                    instance_id=instance_id,
                    title=title,
                    message=message,
                    level=level,
                    channels_sent=json.dumps(channels_sent),
                )
                db.add(notif)
                await db.commit()
        except Exception as exc:
            logger.error("Failed to persist notification: %s", exc)

        self._summary_cache = None  # invalidate widget cache

    # ── Channel senders ───────────────────────────────────────────────────────

    def _send_email(self, title: str, body: str, level: str) -> None:
        """Synchronous SMTP send — run via asyncio.run_in_executor."""
        host = self._config.get("smtp_host", "")
        port = int(self._config.get("smtp_port", 587))
        user = self._config.get("smtp_user", "")
        password = self._config.get("smtp_password", "")
        use_tls = bool(self._config.get("smtp_tls", True))
        use_ssl = bool(self._config.get("smtp_ssl", False))
        from_addr = self._config.get("email_from") or user
        to_addrs = [
            a.strip()
            for a in self._config.get("email_to", "").split(",")
            if a.strip()
        ]

        if not host:
            raise ValueError("SMTP host not configured")
        if not to_addrs:
            raise ValueError("No recipient email addresses configured")

        color = {"error": "#e74c3c", "warning": "#f39c12"}.get(level, "#3498db")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[UHLD] [{level.upper()}] {title}"
        msg["From"] = from_addr
        msg["To"] = ", ".join(to_addrs)
        msg.attach(MIMEText(f"[{level.upper()}] {title}\n\n{body}", "plain"))
        msg.attach(
            MIMEText(
                f'<h3 style="color:{color}">[{level.upper()}] {title}</h3>'
                f"<p>{body}</p>"
                f'<hr/><p style="font-size:11px;color:#888">Sent by UHLD</p>',
                "html",
            )
        )

        if use_ssl:
            with smtplib.SMTP_SSL(host, port) as server:
                if user and password:
                    server.login(user, password)
                server.sendmail(from_addr, to_addrs, msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                if use_tls:
                    server.starttls()
                if user and password:
                    server.login(user, password)
                server.sendmail(from_addr, to_addrs, msg.as_string())

    async def _send_telegram(self, title: str, body: str, level: str) -> None:
        token = self._config.get("telegram_bot_token", "")
        chat_id = self._config.get("telegram_chat_id", "")
        if not token or not chat_id:
            raise ValueError("Telegram bot token or chat ID not configured")

        emoji = {"error": "\U0001f534", "warning": "\U0001f7e1"}.get(level, "\U0001f535")
        text = f"{emoji} *[{level.upper()}] {title}*\n\n{body}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            )
            resp.raise_for_status()

    async def _send_webhook(
        self,
        event_type: str,
        title: str,
        body: str,
        level: str,
        plugin_id: str | None,
        instance_id: str | None,
    ) -> None:
        url = self._config.get("webhook_url", "")
        secret = self._config.get("webhook_secret", "")
        if not url:
            raise ValueError("Webhook URL not configured")

        payload = {
            "event_type": event_type,
            "title": title,
            "message": body,
            "level": level,
            "plugin_id": plugin_id,
            "instance_id": instance_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        payload_bytes = json.dumps(payload).encode()
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if secret:
            sig = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
            headers["X-Signature-256"] = f"sha256={sig}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, content=payload_bytes, headers=headers)
            resp.raise_for_status()

    # ── Periodic health checker ────────────────────────────────────────────────

    async def _run_health_checks(self) -> None:
        """Check health of all enabled plugins and notify on status change."""
        from sqlalchemy import select

        from backend.database import AsyncSessionLocal
        from backend.models import PluginConfig
        from backend.plugins import registry

        for key, instance in list(registry.get_all_instances().items()):
            if instance is self:
                continue  # skip self

            plugin_id, inst_id = key.split(":", 1)
            try:
                result = await instance.health_check()
                new_status = result.get("status", "error")
                prev_status = self._last_health.get(key)

                # Persist health status to DB
                async with AsyncSessionLocal() as db:
                    db_result = await db.execute(
                        select(PluginConfig).where(
                            PluginConfig.plugin_id == plugin_id,
                            PluginConfig.instance_id == inst_id,
                        )
                    )
                    cfg = db_result.scalar_one_or_none()
                    if cfg:
                        cfg.health_status = new_status
                        cfg.health_message = result.get("message", "")
                        cfg.last_health_check = datetime.now(UTC)
                        await db.commit()

                label = plugin_id + (f"/{inst_id}" if inst_id != "default" else "")

                # Notify on first-time error or status change
                if prev_status is not None and prev_status != new_status:
                    if new_status == "error":
                        await self.dispatch(
                            event_type="health.degraded",
                            title=f"{label} health degraded",
                            message=result.get("message", "Plugin health check failed"),
                            level="error",
                            plugin_id=plugin_id,
                            instance_id=inst_id,
                        )
                    else:
                        await self.dispatch(
                            event_type="health.recovered",
                            title=f"{label} recovered",
                            message=result.get("message", "Plugin health restored"),
                            level="info",
                            plugin_id=plugin_id,
                            instance_id=inst_id,
                        )
                elif prev_status is None and new_status == "error":
                    await self.dispatch(
                        event_type="health.degraded",
                        title=f"{label} health degraded",
                        message=result.get("message", "Plugin health check failed"),
                        level="error",
                        plugin_id=plugin_id,
                        instance_id=inst_id,
                    )

                self._last_health[key] = new_status
            except Exception as exc:
                logger.error("Health check error for %s: %s", key, exc)
