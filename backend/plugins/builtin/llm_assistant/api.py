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


def _build_headers(api_key: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
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
        api_key = plugin.get_config("api_key")
        headers = _build_headers(api_key)

        data = await _request_json("GET", f"{base_url}/v1/models", headers)
        return {"models": data.get("data", [])}

    @router.post("/chat")
    async def chat(body: ChatBody, _: User = Depends(get_current_user)):
        base_url = str(plugin.get_config("base_url", "")).rstrip("/")
        if not base_url:
            raise HTTPException(status_code=400, detail="Plugin base_url is not configured")

        model = (body.model or str(plugin.get_config("model", "")).strip())
        if not model:
            raise HTTPException(status_code=400, detail="No model configured")

        api_key = plugin.get_config("api_key")
        headers = _build_headers(api_key)

        messages = [m.model_dump() for m in body.messages]
        system_prompt = str(plugin.get_config("system_prompt", "")).strip()
        if system_prompt and not any(m["role"] == "system" for m in messages):
            messages.insert(0, {"role": "system", "content": system_prompt})

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
        }
        if body.temperature is not None:
            payload["temperature"] = body.temperature

        try:
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

    return router
