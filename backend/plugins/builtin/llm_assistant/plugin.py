from __future__ import annotations

from fastapi import APIRouter

from backend.plugins.base import PluginBase


class LLMAssistantPlugin(PluginBase):
    plugin_id = "llm_assistant"
    display_name = "LLM Assistant"
    description = "Connect OpenAI-compatible, Ollama, Anthropic Claude, or OpenWebUI endpoints for in-app chat assistance"
    version = "1.0.0"
    icon = "bot"
    category = "automation"
    poll_interval = 0

    config_schema = {
        "type": "object",
        "properties": {
            "provider": {
                "type": "string",
                "title": "Provider Type",
                "enum": ["openai", "ollama", "anthropic", "openwebui", "custom"],
                "default": "openai",
                "description": "Select your LLM provider type for proper API compatibility",
            },
            "base_url": {
                "type": "string",
                "title": "Base URL",
                "description": "OpenAI: https://api.openai.com | Ollama: http://localhost:11434 | Anthropic: https://api.anthropic.com | OpenWebUI: http://openwebui:3000",
            },
            "api_key": {
                "type": "string",
                "title": "API Key",
                "format": "password",
                "sensitive": True,
                "description": "Leave empty for local Ollama installations. Required for OpenAI, Anthropic, OpenWebUI.",
            },
            "model": {
                "type": "string",
                "title": "Default Model",
                "default": "gpt-4o-mini",
                "description": "Examples: gpt-4o-mini, claude-3-5-sonnet-20241022, llama3.2, mistral",
            },
            "system_prompt": {
                "type": "string",
                "title": "Default System Prompt",
                "default": "You are a helpful homelab assistant.",
            },
            "temperature": {
                "type": "number",
                "title": "Default Temperature",
                "default": 0.7,
                "minimum": 0.0,
                "maximum": 2.0,
                "description": "Controls randomness: 0.0 = deterministic, 2.0 = very creative",
            },
            "max_tokens": {
                "type": "integer",
                "title": "Max Tokens (optional)",
                "default": 4096,
                "minimum": 1,
                "description": "Maximum response length. Leave default for most providers.",
            },
        },
        "required": ["provider", "base_url", "model"],
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
        provider = self.get_config("provider", "openai")
        return {
            "status": "ok",
            "provider": provider,
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
