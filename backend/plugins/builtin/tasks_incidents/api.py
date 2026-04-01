from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


# Enhanced incident schema (medium/full-blown incident system)
class IncidentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    kind: str = Field(default="incident")  # task | incident | request
    severity: str = Field(default="medium")  # critical | high | medium | low
    status: str = Field(default="new")  # new | assigned | investigating | resolved | closed
    priority: str = Field(default="medium")
    description: str | None = None
    affected_systems: list[str] = Field(default_factory=list)  # ["proxmox:vm-100", "docker:container-abc", ...]
    impact: str | None = None  # Business impact statement
    assignees: list[str] = Field(default_factory=list)  # Multiple assignees
    due_date: str | None = None


class IncidentUpdate(BaseModel):
    title: str | None = None
    severity: str | None = None
    status: str | None = None
    priority: str | None = None
    description: str | None = None
    affected_systems: list[str] | None = None
    impact: str | None = None
    assignees: list[str] | None = None
    due_date: str | None = None


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    kind: str = Field(default="comment")  # comment | status_change | assignment | note
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user, require_admin
from backend.database import get_db
from backend.models import Setting, User


class ItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    kind: str = Field(default="task")  # task | incident | request
    status: str = Field(default="open")
    priority: str = Field(default="medium")
    due_date: str | None = None
    assignee: str | None = None
    notes: str | None = None


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    kind: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None
    assignee: str | None = None
    notes: str | None = None


async def _load_items(db: AsyncSession, key: str) -> list[dict]:
    row = await db.scalar(select(Setting).where(Setting.key == key))
    if not row or not row.value:
        return []
    try:
        value = json.loads(row.value)
        if isinstance(value, list):
            return value
    except json.JSONDecodeError:
        return []
    return []


async def _save_items(db: AsyncSession, key: str, items: list[dict]) -> None:
    row = await db.scalar(select(Setting).where(Setting.key == key))
    payload = json.dumps(items)
    if row is None:
        row = Setting(key=key, value=payload)
        db.add(row)
    else:
        row.value = payload
    await db.commit()


def _new_id(items: list[dict]) -> int:
    if not items:
        return 1
    return max(int(i.get("id", 0)) for i in items) + 1


def _new_comment_id(comments: list[dict]) -> int:
    if not comments:
        return 1
    return max(int(c.get("id", 0)) for c in comments) + 1


def _generate_number(items: list[dict], kind: str) -> str:
    """Generate ServiceNow-style number like INC0001234, TSK0005678, REQ0000042"""
    prefix_map = {
        "incident": "INC",
        "task": "TSK",
        "request": "REQ",
    }
    prefix = prefix_map.get(kind, "ITM")
    
    # Count existing items of this kind to get next sequence
    same_kind = [i for i in items if i.get("kind") == kind]
    sequence = len(same_kind) + 1
    
    return f"{prefix}{sequence:07d}"


def _enhance_incident(item: dict) -> dict:
    """Ensure incident has all expected fields with defaults"""
    return {
        "id": item.get("id"),
        "number": item.get("number", ""),
        "title": item.get("title", ""),
        "kind": item.get("kind", "incident"),
        "severity": item.get("severity", "medium"),
        "status": item.get("status", "new"),
        "priority": item.get("priority", "medium"),
        "description": item.get("description", ""),
        "affected_systems": item.get("affected_systems", []),
        "impact": item.get("impact", ""),
        "assignees": item.get("assignees", []),
        "due_date": item.get("due_date"),
        "comments": item.get("comments", []),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


def make_router(plugin) -> APIRouter:
    router = APIRouter()

    @router.get("/items")
    async def list_items(
        kind: str | None = None,
        status: str | None = None,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        items = await _load_items(db, plugin.storage_key())
        if kind:
            items = [i for i in items if i.get("kind") == kind]
        if status:
            items = [i for i in items if i.get("status") == status]
        return {"items": items}
    @router.post("/items")
    async def create_incident(
        body: IncidentCreate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ):
        items = await _load_items(db, plugin.storage_key())
        now = datetime.now(UTC).isoformat()
        item = {
            "id": _new_id(items),
            "number": _generate_number(items, body.kind),
            "title": body.title,
            "kind": body.kind,
            "severity": body.severity,
            "status": body.status,
            "priority": body.priority,
            "description": body.description or "",
            "affected_systems": body.affected_systems,
            "impact": body.impact or "",
            "assignees": body.assignees,
            "due_date": body.due_date,
            "comments": [
                {
                    "id": 1,
                    "author": user.username,
                    "kind": "creation",
                    "text": f"{body.kind.capitalize()} created",
                    "timestamp": now,
                }
            ],
            "created_at": now,
            "updated_at": now,
        }
        items.append(item)
        await _save_items(db, plugin.storage_key(), items)
        return {"item": _enhance_incident(item)}

    @router.get("/items/{item_id}")
    async def get_incident(
        item_id: int,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(get_current_user),
    ):
        items = await _load_items(db, plugin.storage_key())
        item = next((i for i in items if int(i.get("id", 0)) == item_id), None)
        if not item:
            raise HTTPException(status_code=404, detail="Incident not found")
        return {"item": _enhance_incident(item)}

    @router.put("/items/{item_id}")
    async def update_incident(
        item_id: int,
        body: IncidentUpdate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ):
        items = await _load_items(db, plugin.storage_key())
        idx = next((i for i, it in enumerate(items) if int(it.get("id", 0)) == item_id), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="Incident not found")

        item = items[idx]
        now = datetime.now(UTC).isoformat()
        comments: list[dict] = item.get("comments", [])

        # Track status changes
        if body.status and body.status != item.get("status"):
            comment_id = _new_comment_id(comments)
            comments.append({
                "id": comment_id,
                "author": user.username,
                "kind": "status_change",
                "text": f"Status changed from {item.get('status')} to {body.status}",
                "timestamp": now,
            })

        # Track assignee changes
        if body.assignees and body.assignees != item.get("assignees", []):
            comment_id = _new_comment_id(comments)
            comments.append({
                "id": comment_id,
                "author": user.username,
                "kind": "assignment",
                "text": f"Assigned to: {', '.join(body.assignees)}",
                "timestamp": now,
            })

        patch = {k: v for k, v in body.model_dump().items() if v is not None}
        items[idx] = {
            **item,
            **patch,
            "comments": comments,
            "updated_at": now,
        }
        await _save_items(db, plugin.storage_key(), items)
        return {"item": _enhance_incident(items[idx])}

    @router.post("/items/{item_id}/comments")
    async def add_comment(
        item_id: int,
        body: CommentCreate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ):
        items = await _load_items(db, plugin.storage_key())
        idx = next((i for i, it in enumerate(items) if int(it.get("id", 0)) == item_id), -1)
        if idx < 0:
            raise HTTPException(status_code=404, detail="Incident not found")

        item = items[idx]
        comments: list[dict] = item.get("comments", [])
        now = datetime.now(UTC).isoformat()

        comment = {
            "id": _new_comment_id(comments),
            "author": user.username,
            "kind": body.kind,
            "text": body.text,
            "timestamp": now,
        }
        comments.append(comment)
        items[idx]["comments"] = comments
        items[idx]["updated_at"] = now
        await _save_items(db, plugin.storage_key(), items)
        return {"comment": comment}

    @router.delete("/items/{item_id}")
    async def delete_incident(
        item_id: int,
        db: AsyncSession = Depends(get_db),
        _: User = Depends(require_admin),
    ):
        items = await _load_items(db, plugin.storage_key())
        next_items = [it for it in items if int(it.get("id", 0)) != item_id]
        if len(next_items) == len(items):
            raise HTTPException(status_code=404, detail="Incident not found")
        await _save_items(db, plugin.storage_key(), next_items)
        return {"message": "Deleted"}


    @router.get("/summary")
    async def summary(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
        items = await _load_items(db, plugin.storage_key())
        by_kind: dict[str, int] = {}
        by_status: dict[str, int] = {}
        for item in items:
            kind = str(item.get("kind", "task"))
            stat = str(item.get("status", "open"))
            by_kind[kind] = by_kind.get(kind, 0) + 1
            by_status[stat] = by_status.get(stat, 0) + 1
        return {"total": len(items), "by_kind": by_kind, "by_status": by_status}
        # Count critical incidents
        critical_count = sum(1 for i in items if i.get("severity") == "critical" and i.get("status") != "closed")
        open_count = sum(1 for i in items if i.get("status") in ["new", "assigned", "investigating"])
        return {
            "total": len(items),
            "by_kind": by_kind,
            "by_status": by_status,
            "critical_open": critical_count,
            "open_count": open_count,
        }

    return router
