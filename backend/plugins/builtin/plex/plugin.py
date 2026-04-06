from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter

from backend.plugins.base import PluginBase

logger = logging.getLogger(__name__)


class PlexPlugin(PluginBase):
    plugin_id = "plex"
    display_name = "Plex Media Server"
    description = "Monitor and manage your Plex Media Server libraries, sessions, and users"
    version = "1.0.0"
    icon = "film"
    category = "media"
    poll_interval = 30  # Poll every 30 seconds for active sessions

    config_schema = {
        "type": "object",
        "properties": {
            "host": {
                "type": "string",
                "title": "Plex Host",
                "description": "Hostname or IP address of your Plex Media Server",
                "placeholder": "192.168.1.100",
            },
            "port": {
                "type": "integer",
                "title": "Port",
                "default": 32400,
                "description": "Port number (default: 32400)",
            },
            "token": {
                "type": "string",
                "title": "Plex Token (X-Plex-Token)",
                "description": (
                    "Your Plex authentication token. To obtain this token:\n"
                    "1. Sign into app.plex.tv in a browser\n"
                    "2. Open any media item\n"
                    "3. Click the three-dot menu → 'Get Info' → 'View XML'\n"
                    "4. Copy the X-Plex-Token value from the URL\n\n"
                    "Alternatively, find it in ~/.config/plex/Preferences.xml on your server.\n"
                    "The token must belong to the Plex account that owns the server (admin-level access required)."
                ),
                "format": "password",
                "sensitive": True,
            },
            "verify_ssl": {
                "type": "boolean",
                "title": "Verify SSL",
                "default": False,
                "description": "Enable SSL certificate verification (disable for self-signed certificates)",
            },
            "open_in_dashboard": {
                "type": "boolean",
                "title": "Open Video in Dashboard",
                "default": False,
                "description": "Play media directly in the dashboard in an overlay player. When disabled, media opens in a new browser tab via the Plex web player.",
            },
        },
        "required": ["host", "token"],
    }

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(config)
        self._client: httpx.AsyncClient | None = None
        self._summary_cache: dict | None = None
        self._sessions_cache: list | None = None
        self._libraries_cache: list | None = None
        self._health_cache: dict | None = None
        self._library_poll_counter = 0  # Poll libraries less frequently

    # ── Client management ─────────────────────────────────────────────────────

    def _make_client(self) -> httpx.AsyncClient:
        host = self._config["host"].strip()
        port = int(self._config.get("port", 32400))
        verify_ssl = bool(self._config.get("verify_ssl", False))
        
        # Ensure host has protocol
        if not host.startswith(("http://", "https://")):
            host = f"http://{host}"
        
        base_url = f"{host}:{port}"
        
        return httpx.AsyncClient(
            base_url=base_url,
            verify=verify_ssl,
            timeout=30.0,
            follow_redirects=True,
        )

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = self._make_client()
        return self._client

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _make_image_url(self, path: str | None) -> str | None:
        """Return Plex image path as-is for frontend to proxy"""
        if not path:
            return None
        # Don't transform absolute URLs
        if path.startswith("http://") or path.startswith("https://"):
            return path
        # Return path as-is - frontend will use image-proxy endpoint
        return path

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "X-Plex-Token": self._config["token"],
            "X-Plex-Client-Identifier": "uhld-plex-plugin",
        }

    async def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        """Make an authenticated request to Plex API"""
        client = self._get_client()
        headers = {**self._headers(), **kwargs.pop("headers", {})}
        
        try:
            resp = await client.request(method, path, headers=headers, **kwargs)
            resp.raise_for_status()
            
            # Some endpoints return empty responses (e.g., refresh, scan)
            if resp.status_code == 204 or not resp.content:
                return {}
            
            try:
                data = resp.json()
            except ValueError:
                # Response is not JSON (empty or malformed)
                return {}
            
            # Plex wraps everything in MediaContainer
            if "MediaContainer" in data:
                return data["MediaContainer"]
            return data
        except httpx.HTTPStatusError as exc:
            logger.error(f"Plex API error {exc.response.status_code}: {exc.response.text}")
            raise
        except Exception as exc:
            logger.error(f"Plex request failed: {exc}")
            raise

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def on_enable(self, config: dict) -> None:
        await super().on_enable(config)
        await self._close_client()
        self._summary_cache = None
        self._sessions_cache = None
        self._libraries_cache = None
        self._health_cache = None
        self._library_poll_counter = 0

    async def on_disable(self) -> None:
        await self._close_client()
        self._summary_cache = None
        self._sessions_cache = None
        self._libraries_cache = None
        self._health_cache = None

    # ── PluginBase contract ───────────────────────────────────────────────────

    async def health_check(self) -> dict:
        try:
            data = await self._request("GET", "/")
            version = data.get("version", "unknown")
            platform = data.get("platform", "unknown")
            friendly_name = data.get("friendlyName", "Plex Media Server")
            
            return {
                "status": "ok",
                "message": f"{friendly_name} — {version} on {platform}",
            }
        except Exception as exc:
            await self._close_client()
            return {"status": "error", "message": str(exc)}

    async def get_summary(self) -> dict:
        if self._summary_cache is not None:
            return self._summary_cache
        
        try:
            # Fetch server info and sessions in parallel
            server_info, sessions = await asyncio.gather(
                self._request("GET", "/"),
                self._request("GET", "/status/sessions"),
                return_exceptions=True,
            )
            
            if isinstance(server_info, Exception):
                raise server_info
            if isinstance(sessions, Exception):
                # Sessions might fail, use empty list
                sessions = {"Metadata": []}
            
            # Get active sessions
            session_list = sessions.get("Metadata", []) if isinstance(sessions, dict) else []
            active_streams = len(session_list)
            active_transcodes = sum(
                1 for s in session_list
                if s.get("TranscodeSession", {}).get("videoDecision") == "transcode"
            )
            
            # Get library count from server info
            libraries = await self._get_libraries()
            library_count = len(libraries)
            total_items = sum(
                int(lib.get("count", 0)) for lib in libraries
            )
            
            self._summary_cache = {
                "status": "ok",
                "server_online": True,
                "version": server_info.get("version", ""),
                "active_streams": active_streams,
                "active_transcodes": active_transcodes,
                "library_count": library_count,
                "total_items": total_items,
            }
            
            return self._summary_cache
            
        except Exception as exc:
            logger.error(f"Failed to fetch Plex summary: {exc}")
            await self._close_client()
            return {
                "status": "error",
                "message": str(exc),
                "server_online": False,
            }

    async def scheduled_poll(self) -> None:
        """Poll active sessions every 30s, libraries every 5min"""
        try:
            # Always poll sessions (real-time monitoring)
            # Invalidate cache and fetch fresh - this will trigger transformation
            self._sessions_cache = None
            await self._get_sessions()
            
            # Also fetch health metrics
            server_info = await self._request("GET", "/")
            self._health_cache = {
                "version": server_info.get("version", ""),
                "platform": server_info.get("platform", ""),
                "friendly_name": server_info.get("friendlyName", ""),
                "transcoder_active_sessions": server_info.get("transcoderActiveVideoSessions", 0),
            }
            
            # Poll libraries every 10 cycles (every 5 minutes with 30s interval)
            self._library_poll_counter += 1
            if self._library_poll_counter >= 10:
                # Invalidate cache and fetch fresh - this will trigger transformation
                self._libraries_cache = None
                await self._get_libraries()
                self._library_poll_counter = 0
            
            # Invalidate summary cache to force refresh
            self._summary_cache = None
            
        except Exception as exc:
            logger.error(f"Plex polling failed: {exc}")
            await self._close_client()

    def get_router(self) -> APIRouter:
        from backend.plugins.builtin.plex.api import make_router
        return make_router(self)

    # ── Internal API helpers ──────────────────────────────────────────────────

    async def _get_server_status(self) -> dict:
        """Get server version, platform, online state"""
        data = await self._request("GET", "/")
        return {
            "version": data.get("version", ""),
            "platform": data.get("platform", ""),
            "friendly_name": data.get("friendlyName", ""),
            "machine_identifier": data.get("machineIdentifier", ""),
            "updated_at": data.get("updatedAt", 0),
            "my_plex": data.get("myPlex", False),
            "my_plex_username": data.get("myPlexUsername", ""),
            "open_in_dashboard": bool(self._config.get("open_in_dashboard", False)),
        }

    async def _get_health(self) -> dict:
        """Get server health metrics"""
        if self._health_cache:
            return self._health_cache
        
        data = await self._request("GET", "/")
        health = {
            "version": data.get("version", ""),
            "platform": data.get("platform", ""),
            "friendly_name": data.get("friendlyName", ""),
            "transcoder_active_sessions": data.get("transcoderActiveVideoSessions", 0),
            "platform_version": data.get("platformVersion", ""),
            "allow_camera_upload": data.get("allowCameraUpload", False),
            "allow_sync": data.get("allowSync", False),
        }
        self._health_cache = health
        return health

    async def _get_sessions(self) -> list:
        """Get currently active sessions/streams"""
        if self._sessions_cache is not None:
            return self._sessions_cache
        
        data = await self._request("GET", "/status/sessions")
        sessions = data.get("Metadata", [])
        
        # Transform image URLs to full URLs
        transformed_sessions = []
        for session in sessions:
            transformed_session = {**session}  # Copy all fields
            if "thumb" in session:
                transformed_session["thumb"] = self._make_image_url(session["thumb"])
            if "art" in session:
                transformed_session["art"] = self._make_image_url(session["art"])
            if "grandparentThumb" in session:
                transformed_session["grandparentThumb"] = self._make_image_url(session["grandparentThumb"])
            # Also transform user thumb if present
            if "User" in session and isinstance(session["User"], dict) and "thumb" in session["User"]:
                transformed_session["User"] = {**session["User"]}
                transformed_session["User"]["thumb"] = self._make_image_url(session["User"]["thumb"])
            transformed_sessions.append(transformed_session)
        
        self._sessions_cache = transformed_sessions
        return transformed_sessions

    async def _terminate_session(self, session_id: str, reason: str = "") -> dict:
        """Terminate an active stream"""
        params = {"sessionId": session_id}
        if reason:
            params["reason"] = reason
        
        await self._request("GET", "/status/sessions/terminate", params=params)
        self._sessions_cache = None  # Invalidate cache
        return {"status": "ok", "message": f"Session {session_id} terminated"}

    async def _session_command(self, session_id: str, command: str, offset: int | None = None) -> dict:
        """Send playback command to a session (pause/resume/stop/seek)"""
        params = {"type": "playback"}
        
        path_map = {
            "pause": "/player/playback/pause",
            "resume": "/player/playback/play",
            "stop": "/player/playback/stop",
            "seek": "/player/playback/seekTo",
        }
        
        if command not in path_map:
            raise ValueError(f"Invalid command: {command}")
        
        path = path_map[command]
        if command == "seek" and offset is not None:
            params["offset"] = str(offset)
        
        # Find session's player address
        sessions = await self._get_sessions()
        session = next((s for s in sessions if s.get("Session", {}).get("id") == session_id), None)
        if not session:
            raise ValueError(f"Session not found: {session_id}")
        
        player = session.get("Player", {})
        address = player.get("address", "")
        port = player.get("port", 32400)
        
        if not address:
            raise ValueError("Cannot determine player address")
        
        # Send command directly to player
        player_client = httpx.AsyncClient(
            base_url=f"http://{address}:{port}",
            timeout=10.0,
        )
        
        try:
            await player_client.get(path, params={**params, "commandID": "1"})
            return {"status": "ok", "message": f"Command '{command}' sent to session {session_id}"}
        finally:
            await player_client.aclose()

    async def _get_libraries(self) -> list:
        """List all libraries"""
        if self._libraries_cache is not None:
            return self._libraries_cache
        
        data = await self._request("GET", "/library/sections")
        libraries = data.get("Directory", [])
        
        # Transform libraries and fetch accurate counts
        transformed = []
        for lib in libraries:
            # Extract library ID from key field
            lib_key = lib.get("key", "")
            lib_id = lib_key.strip("/").split("/")[-1] if lib_key else None
            
            count = 0
            if lib_id:
                try:
                    # Fetch actual count from the library's all endpoint
                    # Try with Container-Size header first (for pagination info)
                    lib_data = await self._request(
                        "GET",
                        f"/library/sections/{lib_id}/all",
                        headers={"X-Plex-Container-Size": "0"}
                    )
                    # Check for both totalSize (pagination) and size (full count)
                    count = int(lib_data.get("totalSize", lib_data.get("size", 0)))
                    logger.info(f"Library {lib.get('title')} ({lib_id}): size={lib_data.get('size')}, totalSize={lib_data.get('totalSize')}, count={count}, all_fields={list(lib_data.keys())}")
                except Exception as exc:
                    logger.warning(f"Failed to get count for library {lib_id} ({lib.get('title')}): {exc}")
                    count = 0
            
            # Normalize the library object
            transformed_lib = {
                "key": lib.get("key", ""),
                "id": lib_id,
                "title": lib.get("title", ""),
                "type": lib.get("type", ""),
                "count": count,
                "scannedAt": lib.get("scannedAt"),
                "updatedAt": lib.get("updatedAt"),
                "uuid": lib.get("uuid", ""),
                "thumb": self._make_image_url(lib.get("thumb")),
                "art": self._make_image_url(lib.get("art")),
            }
            transformed.append(transformed_lib)
        
        self._libraries_cache = transformed
        return transformed

    async def _scan_library(self, library_id: str) -> dict:
        """Trigger a library scan"""
        await self._request("GET", f"/library/sections/{library_id}/refresh")
        return {"status": "ok", "message": f"Library {library_id} scan triggered"}

    async def _refresh_library(self, library_id: str) -> dict:
        """Force metadata refresh for entire library"""
        await self._request("GET", f"/library/sections/{library_id}/refresh?force=1")
        return {"status": "ok", "message": f"Library {library_id} metadata refresh triggered"}

    async def _empty_library_trash(self, library_id: str) -> dict:
        """Empty library trash"""
        await self._request("PUT", f"/library/sections/{library_id}/emptyTrash")
        return {"status": "ok", "message": f"Library {library_id} trash emptied"}

    async def _get_library_items(
        self,
        library_id: str,
        start: int = 0,
        size: int = 50,
        sort: str = "addedAt:desc",
    ) -> dict:
        """Get paginated list of media items from a library"""
        params = {
            "X-Plex-Container-Start": str(start),
            "X-Plex-Container-Size": str(size),
            "sort": sort,
        }
        
        data = await self._request("GET", f"/library/sections/{library_id}/all", params=params)
        items = data.get("Metadata", [])
        
        # Transform image URLs to full URLs
        transformed_items = []
        for item in items:
            transformed_item = {**item}  # Copy all fields
            if "thumb" in item:
                transformed_item["thumb"] = self._make_image_url(item["thumb"])
            if "art" in item:
                transformed_item["art"] = self._make_image_url(item["art"])
            if "grandparentThumb" in item:
                transformed_item["grandparentThumb"] = self._make_image_url(item["grandparentThumb"])
            transformed_items.append(transformed_item)
        
        return {
            "items": transformed_items,
            "total": int(data.get("totalSize", 0)),
            "offset": int(data.get("offset", 0)),
            "size": int(data.get("size", 0)),
        }

    async def _get_item_detail(self, rating_key: str) -> dict:
        """Get full details for a specific media item"""
        data = await self._request("GET", f"/library/metadata/{rating_key}")
        items = data.get("Metadata", [])
        if not items:
            raise ValueError(f"Item not found: {rating_key}")
        
        item = items[0]
        # Transform image URLs
        if "thumb" in item:
            item["thumb"] = self._make_image_url(item["thumb"])
        if "art" in item:
            item["art"] = self._make_image_url(item["art"])
        if "grandparentThumb" in item:
            item["grandparentThumb"] = self._make_image_url(item["grandparentThumb"])
        
        return item

    async def _get_show_seasons(self, rating_key: str) -> list:
        """Get all seasons for a TV show"""
        data = await self._request("GET", f"/library/metadata/{rating_key}/children")
        seasons = data.get("Metadata", [])
        
        # Transform image URLs
        transformed = []
        for season in seasons:
            transformed_season = {**season}
            if "thumb" in season:
                transformed_season["thumb"] = self._make_image_url(season["thumb"])
            if "art" in season:
                transformed_season["art"] = self._make_image_url(season["art"])
            transformed.append(transformed_season)
        
        return transformed

    async def _get_season_episodes(self, rating_key: str) -> list:
        """Get all episodes for a season"""
        data = await self._request("GET", f"/library/metadata/{rating_key}/children")
        episodes = data.get("Metadata", [])
        
        # Transform image URLs
        transformed = []
        for episode in episodes:
            transformed_ep = {**episode}
            if "thumb" in episode:
                transformed_ep["thumb"] = self._make_image_url(episode["thumb"])
            if "art" in episode:
                transformed_ep["art"] = self._make_image_url(episode["art"])
            if "grandparentThumb" in episode:
                transformed_ep["grandparentThumb"] = self._make_image_url(episode["grandparentThumb"])
            transformed.append(transformed_ep)
        
        return transformed

    async def _play_item(self, rating_key: str) -> dict:
        """Get playback info for an item"""
        # Get item metadata to find media info
        item = await self._get_item_detail(rating_key)
        
        # Extract media parts (actual video files)
        media_list = item.get("Media", [])
        if not media_list:
            raise ValueError("No media found for this item")
        
        media = media_list[0]
        parts = media.get("Part", [])
        if not parts:
            raise ValueError("No playable parts found")
        
        part = parts[0]
        part_key = part.get("key", "")
        
        # Construct direct play URL
        host = self._config["host"].strip()
        port = int(self._config.get("port", 32400))
        if not host.startswith(("http://", "https://")):
            host = f"http://{host}"
        
        base_url = f"{host}:{port}"
        play_url = f"{base_url}{part_key}?X-Plex-Token={self._config['token']}"
        
        return {
            "status": "ok",
            "play_url": play_url,
            "duration": item.get("duration", 0),
            "title": item.get("title", ""),
            "type": item.get("type", ""),
            "container": part.get("container", ""),
            "size": part.get("size", 0),
            "video_codec": media.get("videoCodec", ""),
            "audio_codec": media.get("audioCodec", ""),
            "resolution": media.get("videoResolution", ""),
        }

    async def _refresh_item_metadata(self, rating_key: str) -> dict:
        """Refresh metadata for a single item"""
        await self._request("PUT", f"/library/metadata/{rating_key}/refresh")
        return {"status": "ok", "message": f"Metadata refresh triggered for item {rating_key}"}

    async def _delete_item(self, rating_key: str) -> dict:
        """Delete a media item and its files"""
        await self._request("DELETE", f"/library/metadata/{rating_key}")
        return {"status": "ok", "message": f"Item {rating_key} deleted"}

    async def _get_users(self) -> list:
        """List managed users and home users"""
        try:
            data = await self._request("GET", "/accounts")
            accounts = data.get("Account", [])
            if not accounts and "User" in data:
                # Some Plex versions return users under User.
                accounts = data.get("User", [])
            
            transformed_accounts: list[dict[str, Any]] = []
            for account in accounts:
                transformed_account = {
                    **account,
                    "id": account.get("id") or account.get("accountID") or account.get("uuid") or account.get("title") or account.get("username") or "unknown",
                    "title": account.get("title") or account.get("username") or account.get("name") or account.get("email") or "Unknown User",
                    "email": account.get("email") or account.get("username") or "",
                    "home": bool(account.get("home") or account.get("homeUser") or account.get("isHomeUser")),
                    "restricted": bool(account.get("restricted") or account.get("isManaged") or account.get("restrictedProfile")),
                }
                if account.get("thumb"):
                    transformed_account["thumb"] = self._make_image_url(account["thumb"])
                transformed_accounts.append(transformed_account)
            
            return transformed_accounts
        except Exception:
            # Endpoint might not be available on all Plex versions
            return []

    async def _get_recently_added(self, limit: int = 20) -> list:
        """Get recently added items across all libraries"""
        try:
            data = await self._request("GET", f"/library/recentlyAdded?X-Plex-Container-Size={limit}")
            items = data.get("Metadata", [])
            
            # Transform image URLs
            transformed = []
            for item in items:
                transformed_item = {**item}
                if "thumb" in item:
                    transformed_item["thumb"] = self._make_image_url(item["thumb"])
                if "art" in item:
                    transformed_item["art"] = self._make_image_url(item["art"])
                if "grandparentThumb" in item:
                    transformed_item["grandparentThumb"] = self._make_image_url(item["grandparentThumb"])
                transformed.append(transformed_item)
            
            return transformed
        except Exception as exc:
            logger.error(f"Failed to fetch recently added: {exc}")
            return []

    async def _get_on_deck(self, limit: int = 20) -> list:
        """Get on deck (in progress / continue watching) items"""
        try:
            data = await self._request("GET", f"/library/onDeck?X-Plex-Container-Size={limit}")
            items = data.get("Metadata", [])
            
            # Transform image URLs
            transformed = []
            for item in items:
                transformed_item = {**item}
                if "thumb" in item:
                    transformed_item["thumb"] = self._make_image_url(item["thumb"])
                if "art" in item:
                    transformed_item["art"] = self._make_image_url(item["art"])
                if "grandparentThumb" in item:
                    transformed_item["grandparentThumb"] = self._make_image_url(item["grandparentThumb"])
                transformed.append(transformed_item)
            
            return transformed
        except Exception as exc:
            logger.error(f"Failed to fetch on deck: {exc}")
            return []

    async def _check_updates(self) -> dict:
        """Check if Plex Media Server update is available"""
        try:
            data = await self._request("GET", "/updater/status")
            return {
                "update_available": bool(data.get("canInstall", False)),
                "version": data.get("version", ""),
                "download_url": data.get("downloadURL", ""),
                "release_notes": data.get("fixed", ""),
            }
        except Exception as exc:
            return {
                "update_available": False,
                "error": str(exc),
            }

    async def _proxy_image(self, path: str) -> tuple[bytes, str]:
        """Fetch image from Plex and return content + mimetype"""
        client = self._get_client()
        headers = self._headers()
        
        try:
            resp = await client.get(path, headers=headers)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "image/jpeg")
            return resp.content, content_type
        except Exception as exc:
            logger.error(f"Failed to proxy Plex image {path}: {exc}")
            raise
