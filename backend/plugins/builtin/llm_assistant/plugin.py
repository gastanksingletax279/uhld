from __future__ import annotations

from fastapi import APIRouter

from backend.plugins.base import PluginBase


class LLMAssistantPlugin(PluginBase):
    plugin_id = "llm_assistant"
    display_name = "LLM Assistant"
    description = "Connect OpenAI-compatible, Ollama, or OpenWebUI endpoints for in-app chat assistance"
    version = "1.0.0"
    icon = "bot"
    category = "automation"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {
            "base_url": {
                "type": "string",
                "title": "Base URL",
                "description": "Example: http://localhost:11434 or https://api.openai.com",
            },
            "api_key": {
                "type": "string",
                "title": "API Key",
                "format": "password",
                "sensitive": True,
            },
            "model": {
                "type": "string",
                "title": "Default Model",
                "default": "gpt-4o-mini",
            },
            "system_prompt": {
                "type": "string",
                "title": "Default System Prompt",
                "default": "You are a helpful homelab assistant.",
            },
        },
        "required": ["base_url", "model"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._last_error: str | None = None
        self._chat_count = 0

    async def health_check(self) -> dict:
        base_url = str(self.get_config("base_url", "")).strip()
        model = str(self.get_config("model", "")).strip()
        if not base_url:
            return {"status": "error", "message": "Missing base_url"}
        if not model:
            return {"status": "error", "message": "Missing model"}
        return {"status": "ok", "message": "LLM assistant configured"}

    async def get_summary(self) -> dict:
        return {
            "status": "ok",
            "model": self.get_config("model", ""),
            "base_url": self.get_config("base_url", ""),
            "chat_requests": self._chat_count,
            "last_error": self._last_error,
        }

    def record_chat(self, success: bool, error: str | None = None) -> None:
        self._chat_count += 1
        self._last_error = None if success else error

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.llm_assistant.api import make_router

        return make_router(self)
