from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import get_current_user
from backend.models import User

if TYPE_CHECKING:
    from backend.plugins.builtin.llm_assistant.plugin import LLMAssistantPlugin


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatBody(BaseModel):
    messages: list[ChatMessage]
    model: str | None = None
    temperature: float | None = Field(default=0.2, ge=0.0, le=2.0)


def _build_headers(api_key: str | None, provider: str = "openai") -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        if provider == "anthropic":
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = "2023-06-01"
        else:
            headers["Authorization"] = f"Bearer {api_key}"
    return headers


async def _request_json(
    method: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout, verify=False) as client:
        resp = await client.request(method, url, headers=headers, json=payload)
    if resp.status_code >= 400:
        detail = resp.text[:1000]
        raise HTTPException(status_code=502, detail=f"Upstream LLM request failed: {detail}")
    try:
        return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upstream returned non-JSON response: {exc}")


def make_router(plugin: LLMAssistantPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/models")
    async def list_models(_: User = Depends(get_current_user)):
        base_url = str(plugin.get_config("base_url", "")).rstrip("/")
        if not base_url:
            raise HTTPException(status_code=400, detail="Plugin base_url is not configured")
        
        provider = str(plugin.get_config("provider", "openai")).lower()
        api_key = plugin.get_config("api_key")
        headers = _build_headers(api_key, provider)

        try:
            # Different providers use different endpoints for model listing
            if provider == "ollama":
                data = await _request_json("GET", f"{base_url}/api/tags", headers)
                models = data.get("models", [])
                # Ollama returns {models: [{name: "..."}]}
                return {"models": [{"id": m.get("name", m.get("model", ""))} for m in models]}
            elif provider == "anthropic":
                # Anthropic doesn't have a models endpoint, return known models
                return {
                    "models": [
                        {"id": "claude-3-5-sonnet-20241022"},
                        {"id": "claude-3-5-haiku-20241022"},
                        {"id": "claude-3-opus-20240229"},
                        {"id": "claude-3-sonnet-20240229"},
                        {"id": "claude-3-haiku-20240307"},
                    ]
                }
            else:
                # OpenAI-compatible (openai, openwebui, custom)
                data = await _request_json("GET", f"{base_url}/v1/models", headers)
                models = data.get("data", [])
                # Ensure consistent format
                return {"models": [{"id": m.get("id", m.get("model", ""))} for m in models]}
        except HTTPException:
            # If models endpoint fails, return empty list (not critical)
            return {"models": []}

    @router.post("/chat")
    async def chat(body: ChatBody, _: User = Depends(get_current_user)):
        base_url = str(plugin.get_config("base_url", "")).rstrip("/")
        if not base_url:
            raise HTTPException(status_code=400, detail="Plugin base_url is not configured")

        model = (body.model or str(plugin.get_config("model", "")).strip())
        if not model:
            raise HTTPException(status_code=400, detail="No model configured")

        provider = str(plugin.get_config("provider", "openai")).lower()
        api_key = plugin.get_config("api_key")
        headers = _build_headers(api_key, provider)

        messages = [m.model_dump() for m in body.messages]
        system_prompt = str(plugin.get_config("system_prompt", "")).strip()
        
        # Handle system prompt based on provider
        if provider == "anthropic":
            # Claude requires system prompt separate from messages
            user_messages = [m for m in messages if m["role"] != "system"]
            # Extract system prompt if in messages
            system_from_messages = next((m["content"] for m in messages if m["role"] == "system"), None)
            final_system = system_from_messages or system_prompt
            messages = user_messages
        else:
            # OpenAI-compatible providers use system role in messages
            if system_prompt and not any(m["role"] == "system" for m in messages):
                messages.insert(0, {"role": "system", "content": system_prompt})

        temperature = body.temperature if body.temperature is not None else float(plugin.get_config("temperature", 0.7))
        max_tokens = int(plugin.get_config("max_tokens", 4096))

        try:
            # Build request based on provider
            if provider == "ollama":
                # Ollama uses /api/chat endpoint
                payload: dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "stream": False,
                }
                if temperature is not None:
                    payload["options"] = {"temperature": temperature}
                
                data = await _request_json("POST", f"{base_url}/api/chat", headers, payload=payload)
                reply = data.get("message", {}).get("content", "")
                
            elif provider == "anthropic":
                # Anthropic uses /v1/messages endpoint
                payload = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                }
                if final_system:
                    payload["system"] = final_system
                if temperature is not None:
                    payload["temperature"] = temperature
                
                data = await _request_json("POST", f"{base_url}/v1/messages", headers, payload=payload)
                content = data.get("content", [])
                reply = content[0].get("text", "") if content else ""
                
            else:
                # OpenAI-compatible (openai, openwebui, custom)
                payload = {
                    "model": model,
                    "messages": messages,
                }
                if temperature is not None:
                    payload["temperature"] = temperature
                if max_tokens:
                    payload["max_tokens"] = max_tokens
                
                data = await _request_json("POST", f"{base_url}/v1/chat/completions", headers, payload=payload)
                choices = data.get("choices") or []
                reply = ""
                if choices and isinstance(choices, list):
                    first = choices[0] or {}
                    msg = first.get("message") or {}
                    reply = str(msg.get("content", ""))
            
            plugin.record_chat(success=True)
            return {"reply": reply, "raw": data}
            
        except HTTPException as exc:
            plugin.record_chat(success=False, error=str(exc.detail))
            raise
        except Exception as exc:
            error_msg = str(exc)
            plugin.record_chat(success=False, error=error_msg)
            raise HTTPException(status_code=502, detail=f"LLM request failed: {error_msg}")

    return router
