from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.plugins.builtin.plex.plugin import PlexPlugin


class SessionCommandRequest(BaseModel):
    command: str  # pause, resume, stop
    offset: int | None = None  # for seek command (ms)


def make_router(plugin: PlexPlugin) -> APIRouter:
    router = APIRouter()

    # ── Server & Health ───────────────────────────────────────────────────────

    @router.get("/status")
    async def get_status():
        """Get server version, platform, online state"""
        try:
            return await plugin._get_server_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/health")
    async def get_health():
        """Get server health metrics (CPU, memory, transcoder status)"""
        try:
            return await plugin._get_health()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Sessions (Active Streams) ─────────────────────────────────────────────

    @router.get("/sessions")
    async def get_sessions():
        """Get currently active streams with user, media, progress, stream type"""
        try:
            sessions = await plugin._get_sessions()
            return {"sessions": sessions}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/sessions/{session_id}")
    async def terminate_session(
        session_id: str,
        reason: str = Query(default="Terminated by UHLD")
    ):
        """Terminate an active stream"""
        try:
            return await plugin._terminate_session(session_id, reason)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/sessions/{session_id}/pause")
    async def pause_session(session_id: str):
        """Pause playback for a session"""
        try:
            return await plugin._session_command(session_id, "pause")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/sessions/{session_id}/resume")
    async def resume_session(session_id: str):
        """Resume playback for a session"""
        try:
            return await plugin._session_command(session_id, "resume")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/sessions/{session_id}/stop")
    async def stop_session(session_id: str):
        """Stop playback for a session"""
        try:
            return await plugin._session_command(session_id, "stop")
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/sessions/{session_id}/seek")
    async def seek_session(session_id: str, offset: int = Query(..., description="Position in milliseconds")):
        """Seek to position in a session"""
        try:
            return await plugin._session_command(session_id, "seek", offset)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Libraries ─────────────────────────────────────────────────────────────

    @router.get("/libraries")
    async def get_libraries():
        """List all libraries with name, type, item count, last scanned"""
        try:
            libraries = await plugin._get_libraries()
            return {"libraries": libraries}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/libraries/{library_id}/scan")
    async def scan_library(library_id: str):
        """Trigger a library scan"""
        try:
            return await plugin._scan_library(library_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/libraries/{library_id}/refresh")
    async def refresh_library(library_id: str):
        """Force metadata refresh for the entire library"""
        try:
            return await plugin._refresh_library(library_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/libraries/{library_id}/empty-trash")
    async def empty_library_trash(library_id: str):
        """Empty library trash"""
        try:
            return await plugin._empty_library_trash(library_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Media Items ───────────────────────────────────────────────────────────

    @router.get("/libraries/{library_id}/items")
    async def get_library_items(
        library_id: str,
        start: int = Query(default=0, ge=0),
        size: int = Query(default=50, ge=1, le=500),
        sort: str = Query(default="addedAt:desc"),
    ):
        """Get paginated list of media items with title, year, rating, file info"""
        try:
            return await plugin._get_library_items(library_id, start, size, sort)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/items/{rating_key}")
    async def get_item_detail(rating_key: str):
        """Get full item detail (metadata, file paths, streams, posters)"""
        try:
            return await plugin._get_item_detail(rating_key)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/items/{rating_key}/refresh")
    async def refresh_item_metadata(rating_key: str):
        """Refresh metadata for a single item"""
        try:
            return await plugin._refresh_item_metadata(rating_key)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.delete("/items/{rating_key}")
    async def delete_item(rating_key: str):
        """Delete media item and its files"""
        try:
            return await plugin._delete_item(rating_key)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.post("/items/{rating_key}/play")
    async def play_item(rating_key: str):
        """Get playback URL and info for an item"""
        try:
            return await plugin._play_item(rating_key)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── TV Shows (Seasons & Episodes) ────────────────────────────────────────

    @router.get("/shows/{rating_key}/seasons")
    async def get_show_seasons(rating_key: str):
        """Get all seasons for a TV show"""
        try:
            seasons = await plugin._get_show_seasons(rating_key)
            return {"seasons": seasons}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/seasons/{rating_key}/episodes")
    async def get_season_episodes(rating_key: str):
        """Get all episodes for a season"""
        try:
            episodes = await plugin._get_season_episodes(rating_key)
            return {"episodes": episodes}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Users ─────────────────────────────────────────────────────────────────

    @router.get("/users")
    async def get_users():
        """List managed users and home users with access"""
        try:
            users = await plugin._get_users()
            return {"users": users}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Dashboard Widgets ─────────────────────────────────────────────────────

    @router.get("/recently-added")
    async def get_recently_added(limit: int = Query(default=20, ge=1, le=50)):
        """Get recently added items across all libraries"""
        try:
            items = await plugin._get_recently_added(limit)
            return {"items": items}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    @router.get("/on-deck")
    async def get_on_deck(limit: int = Query(default=20, ge=1, le=50)):
        """Get on deck (continue watching) items"""
        try:
            items = await plugin._get_on_deck(limit)
            return {"items": items}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Updates ───────────────────────────────────────────────────────────────

    @router.get("/updates")
    async def check_updates():
        """Check if a Plex Media Server update is available"""
        try:
            return await plugin._check_updates()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # ── Image Proxy ───────────────────────────────────────────────────────────

    @router.get("/image-proxy")
    async def proxy_image(path: str = Query(..., description="Plex image path")):
        """Proxy images from Plex server to avoid CORS issues"""
        try:
            content, content_type = await plugin._proxy_image(path)
            return Response(content=content, media_type=content_type)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    return router
