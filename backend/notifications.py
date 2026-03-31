from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Global reference to the active NotificationsPlugin instance (or None when disabled).
_notification_plugin = None


def set_notification_plugin(plugin) -> None:
    global _notification_plugin
    _notification_plugin = plugin


def clear_notification_plugin() -> None:
    global _notification_plugin
    _notification_plugin = None


async def send_notification(
    event_type: str,
    title: str,
    message: str,
    level: str = "info",
    plugin_id: str | None = None,
    instance_id: str | None = None,
) -> None:
    """Send a notification via the active notifications plugin.

    Call this from any plugin or API handler to emit a notification.
    Safe to call even when the notifications plugin is disabled — it is a no-op.
    """
    if _notification_plugin is None:
        return
    try:
        await _notification_plugin.dispatch(
            event_type=event_type,
            title=title,
            message=message,
            level=level,
            plugin_id=plugin_id,
            instance_id=instance_id,
        )
    except Exception:
        logger.exception("Failed to dispatch notification: %s / %s", event_type, title)
