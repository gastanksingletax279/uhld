from __future__ import annotations

import asyncio
import json
import os
import shutil
import urllib.parse
import uuid
from dataclasses import dataclass, field as dc_field
from typing import TYPE_CHECKING


import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from backend.auth import get_current_user

if TYPE_CHECKING:
    from backend.plugins.builtin.hdhomerun.plugin import HDHomeRunPlugin


@dataclass
class _MultiSession:
    proc: asyncio.subprocess.Process
    video_queue: asyncio.Queue
    audio_queues: list[asyncio.Queue]
    _tasks: list[asyncio.Task]

_TIMEOUT = 10.0
_GUIDE_BASE = "https://api.hdhomerun.com/api/guide"


def _base_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


async def fetch_discover(host: str, port: int) -> dict:
    """GET /discover.json — device info."""
    url = f"{_base_url(host, port)}/discover.json"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HDHomeRun connection error: {exc}") from exc


async def fetch_lineup(host: str, port: int) -> list[dict]:
    """GET /lineup.json — channel lineup."""
    url = f"{_base_url(host, port)}/lineup.json"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HDHomeRun connection error: {exc}") from exc


async def fetch_lineup_status(host: str, port: int) -> dict:
    """GET /lineup_status.json — scan status and source info."""
    url = f"{_base_url(host, port)}/lineup_status.json"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HDHomeRun connection error: {exc}") from exc


async def fetch_guide(
    device_auth: str,
    channel: str | None = None,
    start: int | None = None,
) -> list[dict]:
    """Fetch programme guide from SiliconDust cloud API.

    Endpoint: GET https://api.hdhomerun.com/api/guide?DeviceAuth=<token>[&Channel=5.1][&Start=<unix>]

    DeviceAuth comes from /discover.json (the raw token string).
    The optional Start parameter requests guide data beginning at that Unix
    timestamp — used for progressive loading as the user scrolls forward.
    Returns a list of channel objects each with a "Guide" array of programme
    entries: StartTime/EndTime (Unix), Title, EpisodeTitle, Synopsis, ImageURL.
    Returns empty list (not an error) on any non-200 response so a cloud
    outage doesn't break the whole plugin.
    """
    params: dict[str, str] = {"DeviceAuth": device_auth}
    if channel:
        params["Channel"] = channel
    if start:
        params["Start"] = str(start)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(_GUIDE_BASE, params=params)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return data if isinstance(data, list) else []
    except (httpx.HTTPError, Exception):
        return []


async def fetch_status_json(host: str, port: int) -> list[dict]:
    """GET /status.json — all tuner statuses in one call (modern HDHomeRun API)."""
    url = f"{_base_url(host, port)}/status.json"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"HDHomeRun connection error: {exc}") from exc

    if not isinstance(data, list):
        return []

    result = []
    for item in data:
        resource = item.get("Resource", "")
        num = 0
        if isinstance(resource, str) and resource.startswith("tuner"):
            try:
                num = int(resource[5:])
            except ValueError:
                pass
        result.append({"number": num, **item})
    return result


def make_router(plugin: HDHomeRunPlugin) -> APIRouter:
    router = APIRouter()

    @router.get("/discover")
    async def discover(_user=Depends(get_current_user)):
        """Return device discovery info plus server-side capability flags."""
        host = plugin.get_config("host")
        port = int(plugin.get_config("port", 80))
        data = await fetch_discover(host, port)
        data["streaming_enabled"] = bool(plugin.get_config("enable_streaming", False))
        data["mute_by_default"] = bool(plugin.get_config("mute_by_default", False))
        return data

    @router.get("/lineup")
    async def lineup(_user=Depends(get_current_user)):
        host = plugin.get_config("host")
        port = int(plugin.get_config("port", 80))
        channels = await fetch_lineup(host, port)
        return {"channels": channels, "count": len(channels)}

    @router.get("/lineup_status")
    async def lineup_status(_user=Depends(get_current_user)):
        host = plugin.get_config("host")
        port = int(plugin.get_config("port", 80))
        return await fetch_lineup_status(host, port)

    @router.get("/tuners")
    async def tuners(_user=Depends(get_current_user)):
        host = plugin.get_config("host")
        port = int(plugin.get_config("port", 80))
        tuner_statuses = await fetch_status_json(host, port)
        return {"tuners": tuner_statuses}

    @router.get("/guide")
    async def guide(
        channel: str | None = None,
        start: int | None = None,
        _user=Depends(get_current_user),
    ):
        """Return programme guide from SiliconDust cloud.

        Optional ?channel=5.1 to fetch a single channel.
        Optional ?start=<unix> to request guide data beginning at that timestamp
        (used for progressive loading as the user scrolls forward in the EPG).
        Requires DeviceAuth from /discover.json — if the device doesn't expose
        it (older firmware) returns an empty list rather than an error.
        """
        host = plugin.get_config("host")
        port = int(plugin.get_config("port", 80))
        try:
            info = await fetch_discover(host, port)
        except Exception:
            return {"guide": [], "unavailable": True, "reason": "Could not reach device"}
        device_auth = info.get("DeviceAuth", "")
        if not device_auth:
            return {"guide": [], "unavailable": True, "reason": "DeviceAuth not available (older firmware?)"}
        entries = await fetch_guide(device_auth, channel, start)
        return {"guide": entries}

    @router.websocket("/stream/ws")
    async def stream_ws(websocket: WebSocket, url: str):
        """Stream a channel as fragmented MP4 over WebSocket.

        The client connects with ?url=<channel_url>. Authentication is via the
        session cookie sent on the WebSocket upgrade request.

        ffmpeg transcodes MPEG-2/AC-3 → H.264 baseline + AAC and outputs
        fragmented MP4 (-movflags frag_keyframe+empty_moov+default_base_moof).
        The frontend feeds binary chunks directly into MSE SourceBuffer — no
        per-segment HTTP polling, just one persistent binary WebSocket stream.

        Codec string for MSE: 'video/mp4; codecs="avc1.42001E,mp4a.40.2"'
          avc1.42001E = H.264 baseline profile, level 3.0
          mp4a.40.2   = AAC-LC
        """
        # Authenticate via cookie — WebSocket upgrades carry cookies automatically.
        try:
            from backend.auth import decode_token
            token = websocket.cookies.get("access_token")
            if not token:
                await websocket.close(code=4401, reason="Unauthorized")
                return
            decode_token(token)
        except Exception:
            await websocket.close(code=4401, reason="Unauthorized")
            return

        if not plugin.get_config("enable_streaming", False):
            await websocket.close(code=4403, reason="Streaming disabled")
            return

        host = plugin.get_config("host")
        parsed = urllib.parse.urlparse(url)
        if parsed.hostname != host:
            await websocket.close(code=4400, reason="Invalid stream URL")
            return

        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            await websocket.close(code=4503, reason="ffmpeg not available")
            return

        await websocket.accept()

        cmd = [
            ffmpeg_path,
            "-fflags", "+nobuffer+discardcorrupt",
            "-i", url,
            # H.264 baseline 3.0 — universally supported by all browsers via MSE
            "-vcodec", "libx264",
            "-profile:v", "baseline",
            "-level:v", "3.0",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            # Keyframe every 2s — keeps fragment boundaries small for low latency
            "-force_key_frames", "expr:gte(t,n_forced*2)",
            "-sc_threshold", "0",
            # AAC-LC stereo 48kHz — standard broadcast audio
            "-acodec", "aac",
            "-b:a", "128k",
            "-ar", "48000",
            "-ac", "2",
            # Fragmented MP4 output to stdout:
            # - empty_moov: write empty moov box at start so MSE can initialise
            #   without waiting for the full file (required for streaming)
            # - frag_keyframe: start a new fragment at each IDR keyframe
            # - default_base_moof: use default-base-is-moof flag for MSE compat
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        try:
            assert proc.stdout is not None
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    break
                try:
                    await websocket.send_bytes(chunk)
                except (WebSocketDisconnect, RuntimeError):
                    break
        finally:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()

    @router.websocket("/stream/audio")
    async def stream_audio(websocket: WebSocket, url: str):
        """Stream audio-only (no video) as fragmented MP4 over WebSocket.

        The client connects with ?url=<channel_url>. Used by the multi-view
        player to provide per-channel audio switching without restarting the
        combined video stream.

        ffmpeg transcodes the source audio → AAC-LC and outputs fragmented MP4.
        Codec string for MSE: 'audio/mp4; codecs="mp4a.40.2"'
          mp4a.40.2 = AAC-LC
        """
        try:
            from backend.auth import decode_token
            token = websocket.cookies.get("access_token")
            if not token:
                await websocket.close(code=4401, reason="Unauthorized")
                return
            decode_token(token)
        except Exception:
            await websocket.close(code=4401, reason="Unauthorized")
            return

        if not plugin.get_config("enable_streaming", False):
            await websocket.close(code=4403, reason="Streaming disabled")
            return

        host = plugin.get_config("host")
        parsed = urllib.parse.urlparse(url)
        if parsed.hostname != host:
            await websocket.close(code=4400, reason="Invalid stream URL")
            return

        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            await websocket.close(code=4503, reason="ffmpeg not available")
            return

        await websocket.accept()

        cmd = [
            ffmpeg_path,
            "-fflags", "+nobuffer+discardcorrupt",
            "-i", url,
            # No video — audio only
            "-vn",
            # AAC-LC stereo 48kHz
            "-acodec", "aac",
            "-b:a", "128k",
            "-ar", "48000",
            "-ac", "2",
            # Fragmented MP4 output to stdout
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        try:
            assert proc.stdout is not None
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    break
                try:
                    await websocket.send_bytes(chunk)
                except (WebSocketDisconnect, RuntimeError):
                    break
        finally:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()

    # Module-level session store (shared across all WebSocket connections to this
    # router instance).  Keyed by UUID session_id string.
    _sessions: dict[str, _MultiSession] = {}

    @router.websocket("/stream/multi/video")
    async def stream_multi_video(websocket: WebSocket):
        """Stream 2–4 channels combined in a grid (video-only) over WebSocket.

        Query params: url=<url1>&url=<url2>[&url=<url3>][&url=<url4>]
        All URLs must point to the configured HDHomeRun host.

        One ffmpeg process handles ALL input connections so only one set of
        tuner slots is consumed.  Audio streams are made available to the
        companion /stream/multi/audio endpoint via OS pipes.

        After accepting the WebSocket the server sends one text frame:
          {"session_id": "<uuid>"}
        The client must relay this to /stream/multi/audio to select audio.

        ffmpeg composites each stream with the xstack filter:
          2 channels → side-by-side  1280×360
          3 channels → 2×2 grid      1280×720  (third centred on bottom row)
          4 channels → 2×2 grid      1280×720

        Each panel is normalised to 640×360, 30 fps.
        Video output has no audio (-an); audio comes from the audio endpoint.
        Output: H.264 baseline level 4.0 fragmented MP4.
        """
        try:
            from backend.auth import decode_token
            token = websocket.cookies.get("access_token")
            if not token:
                await websocket.close(code=4401, reason="Unauthorized")
                return
            decode_token(token)
        except Exception:
            await websocket.close(code=4401, reason="Unauthorized")
            return

        if not plugin.get_config("enable_streaming", False):
            await websocket.close(code=4403, reason="Streaming disabled")
            return

        qs = urllib.parse.parse_qs(websocket.url.query)
        urls: list[str] = qs.get("url", [])
        if not (2 <= len(urls) <= 4):
            await websocket.close(code=4400, reason="Provide 2–4 channel URLs")
            return

        host = plugin.get_config("host")
        for u in urls:
            parsed = urllib.parse.urlparse(u)
            if parsed.hostname != host:
                await websocket.close(code=4400, reason="Invalid stream URL")
                return

        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            await websocket.close(code=4503, reason="ffmpeg not available")
            return

        n = len(urls)

        # Create one OS pipe per audio stream so ffmpeg can write each
        # channel's audio to a separate fd without extra network connections.
        audio_read_fds: list[int] = []
        audio_write_fds: list[int] = []
        for _ in range(n):
            r, w = os.pipe()
            audio_read_fds.append(r)
            audio_write_fds.append(w)

        cmd = [ffmpeg_path]
        for u in urls:
            cmd += ["-fflags", "+nobuffer+discardcorrupt", "-i", u]

        # Normalise each stream: 30 fps, reset PTS, scale to 640×360
        scale_parts = [
            f"[{i}:v]fps=30,setpts=PTS-STARTPTS,scale=640:360,setsar=1[v{i}]"
            for i in range(n)
        ]

        if n == 2:
            stack = "[v0][v1]xstack=inputs=2:layout=0_0|640_0:fill=black[v]"
        elif n == 3:
            # Third panel centred on bottom row; fill=black covers the gaps
            stack = "[v0][v1][v2]xstack=inputs=3:layout=0_0|640_0|320_360:fill=black[v]"
        else:
            stack = "[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|640_0|0_360|640_360:fill=black[v]"

        filter_complex = ";".join(scale_parts + [stack])

        # Video output: combined grid, no audio
        cmd += [
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-vcodec", "libx264",
            "-profile:v", "baseline",
            # level 4.0 required: combined output is 1280×360 or 1280×720,
            # both exceed the macroblock budget of level 3.0
            "-level:v", "4.0",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-force_key_frames", "expr:gte(t,n_forced*2)",
            "-sc_threshold", "0",
            "-an",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1",
        ]

        # Audio outputs: one per input, each written to its OS pipe fd.
        # Use the actual fd number (not 3+i) because pass_fds preserves fd
        # numbers in the child process rather than remapping them.
        # Use a:0 (first audio track only) — some channels have multiple audio
        # tracks (e.g. English + Spanish) and fMP4 with >1 audio track is
        # rejected by MSE.
        for i, write_fd in enumerate(audio_write_fds):
            cmd += [
                "-map", f"{i}:a:0",
                "-acodec", "aac",
                "-b:a", "128k",
                "-ar", "48000",
                "-ac", "2",
                "-vn",
                "-f", "mp4",
                # frag_every_frame: fragment on every audio frame (frag_keyframe
                # is meaningless for audio-only — no keyframes exist in AAC)
                "-movflags", "frag_every_frame+empty_moov+default_base_moof",
                f"pipe:{write_fd}",
            ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            pass_fds=tuple(audio_write_fds),
        )
        # Close write ends in parent — ffmpeg owns them now
        for w in audio_write_fds:
            os.close(w)

        video_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        audio_queues: list[asyncio.Queue[bytes | None]] = [asyncio.Queue() for _ in range(n)]

        async def _pipe_fd_to_queue(fd: int, q: asyncio.Queue) -> None:
            loop = asyncio.get_event_loop()
            try:
                while True:
                    data = await loop.run_in_executor(None, os.read, fd, 65536)
                    if not data:
                        await q.put(None)
                        break
                    # Drop oldest chunk if queue is too large (no active consumer).
                    # This prevents unbounded memory growth and stale-data bursts
                    # when a new consumer connects after a gap.
                    if q.qsize() > 10:
                        try:
                            q.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    await q.put(data)
            except OSError:
                await q.put(None)
            finally:
                try:
                    os.close(fd)
                except OSError:
                    pass

        async def _stdout_to_queue() -> None:
            assert proc.stdout is not None
            try:
                while True:
                    chunk = await proc.stdout.read(65536)
                    if not chunk:
                        await video_queue.put(None)
                        break
                    await video_queue.put(chunk)
            except Exception:
                await video_queue.put(None)

        async def _stderr_drain() -> None:
            # Drain stderr so ffmpeg doesn't block on a full pipe
            assert proc.stderr is not None
            try:
                while True:
                    line = await proc.stderr.readline()
                    if not line:
                        break
            except Exception:
                pass

        tasks: list[asyncio.Task] = [
            asyncio.create_task(_stdout_to_queue()),
            asyncio.create_task(_stderr_drain()),
        ]
        for i, fd in enumerate(audio_read_fds):
            tasks.append(asyncio.create_task(_pipe_fd_to_queue(fd, audio_queues[i])))

        session_id = str(uuid.uuid4())
        session = _MultiSession(
            proc=proc,
            video_queue=video_queue,
            audio_queues=audio_queues,
            _tasks=tasks,
        )

        await websocket.accept()
        await websocket.send_text(json.dumps({"session_id": session_id}))
        _sessions[session_id] = session

        try:
            while True:
                chunk = await video_queue.get()
                if chunk is None:
                    break
                try:
                    await websocket.send_bytes(chunk)
                except (WebSocketDisconnect, RuntimeError):
                    break
        finally:
            _sessions.pop(session_id, None)
            for t in tasks:
                t.cancel()
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()

    @router.websocket("/stream/multi/audio")
    async def stream_multi_audio(websocket: WebSocket):
        """Stream one audio channel from an active multi-stream session.

        Query params:
          session_id=<uuid>   — returned by /stream/multi/video on connect
          audio=<index>       — 0-based index of the channel whose audio to play

        Audio switching is handled client-side: close this WebSocket and open a
        new one with a different audio index.  The video stream and ffmpeg
        process continue unaffected.
        """
        try:
            from backend.auth import decode_token
            token = websocket.cookies.get("access_token")
            if not token:
                await websocket.close(code=4401, reason="Unauthorized")
                return
            decode_token(token)
        except Exception:
            await websocket.close(code=4401, reason="Unauthorized")
            return

        qs = urllib.parse.parse_qs(websocket.url.query)
        session_id = qs.get("session_id", [""])[0]
        try:
            audio_idx = int(qs.get("audio", ["0"])[0])
        except (ValueError, IndexError):
            audio_idx = 0

        session = _sessions.get(session_id)
        if session is None:
            await websocket.close(code=4404, reason="Session not found")
            return

        if audio_idx < 0 or audio_idx >= len(session.audio_queues):
            await websocket.close(code=4400, reason="Invalid audio index")
            return

        await websocket.accept()

        q = session.audio_queues[audio_idx]

        # Drain any backlogged chunks accumulated while no consumer was connected.
        # Sending stale audio to MSE causes it to reject appends (timestamps in
        # the past relative to what the SourceBuffer has already seen).
        while not q.empty():
            item = q.get_nowait()
            if item is None:
                # Put the sentinel back so the pipe reader's EOF is not lost
                await q.put(None)
                break

        try:
            while True:
                chunk = await q.get()
                if chunk is None:
                    break
                try:
                    await websocket.send_bytes(chunk)
                except (WebSocketDisconnect, RuntimeError):
                    break
        finally:
            pass  # Session cleanup is owned by the video WebSocket

    @router.post("/lineup/scan")
    async def lineup_scan(_user=Depends(get_current_user)):
        host = plugin.get_config("host")
        port = int(plugin.get_config("port", 80))
        url = f"{_base_url(host, port)}/lineup.post?action=scan"
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(url)
                resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"HDHomeRun connection error: {exc}") from exc
        return {"ok": True}

    return router
