from __future__ import annotations

from abc import ABC, abstractmethod

from fastapi import APIRouter


class PluginBase(ABC):
    """Abstract base class that all UHLD plugins must implement."""

    # --- Metadata (set as class attributes in each subclass) ---
    plugin_id: str = ""
    display_name: str = ""
    description: str = ""
    version: str = "1.0.0"
    icon: str = "puzzle"  # lucide icon name
    category: str = "other"  # virtualization | monitoring | media | network | storage | automation | arr | security
    # Polling interval in seconds (0 = no polling)
    poll_interval: int = 60

    # JSON Schema describing the configuration fields this plugin requires.
    # Fields with "sensitive": true are encrypted at rest and masked in API responses.
    config_schema: dict = {
        "type": "object",
        "properties": {},
        "required": [],
    }

    def __init__(self, config: dict | None = None) -> None:
        self._config: dict = config or {}

    # --- Required interface ---

    @abstractmethod
    async def health_check(self) -> dict:
        """Return {"status": "ok"|"error", "message": str}"""

    @abstractmethod
    async def get_summary(self) -> dict:
        """Return compact data for the dashboard widget card.

        Must always return at minimum: {"status": "ok"|"error", ...}
        """

    @abstractmethod
    def get_router(self) -> APIRouter:
        """Return a FastAPI APIRouter with all plugin-specific routes."""

    # --- Optional lifecycle hooks ---

    async def on_enable(self, config: dict) -> None:
        """Called when the plugin is enabled. Validate config and init connections."""
        self._config = config

    async def on_disable(self) -> None:
        """Called when the plugin is disabled. Clean up any open connections."""

    async def scheduled_poll(self) -> None:
        """Called on the poll_interval schedule to refresh cached data."""

    # --- Helpers ---

    def get_config(self, key: str, default=None):
        return self._config.get(key, default)
