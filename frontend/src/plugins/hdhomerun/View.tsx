import { useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  HDHomeRunChannel,
  HDHomeRunDevice,
  HDHomeRunGuideChannel,
  HDHomeRunLineupStatus,
  HDHomeRunProgram,
  HDHomeRunTunerStatus,
} from '../../api/client'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Clipboard,
  ClipboardCheck,
  Expand,
  Headphones,
  LayoutGrid,
  Loader2,
  PictureInPicture2,
  Play,
  Radio,
  RefreshCw,
  Scan,
  Search,
  Star,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

/** Find the programme currently airing on a channel guide entry. */
function currentProgram(guideChannel: HDHomeRunGuideChannel | undefined): HDHomeRunProgram | undefined {
  if (!guideChannel) return undefined
  const now = Math.floor(Date.now() / 1000)
  return guideChannel.Guide.find(p => p.StartTime <= now && p.EndTime > now)
}

/** Format a Unix timestamp as HH:MM. */
function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Progress through current programme (0–100). */
function programProgress(prog: HDHomeRunProgram): number {
  const now = Math.floor(Date.now() / 1000)
  const total = prog.EndTime - prog.StartTime
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, ((now - prog.StartTime) / total) * 100))
}

/** A tuner is idle when it has no VctNumber, no TargetIP, and no NetworkRate. */
function isIdle(tuner: HDHomeRunTunerStatus): boolean {
  if (tuner.VctNumber) return false      // tuned to a channel
  if (tuner.TargetIP) return false       // a client is receiving the stream
  if (tuner.NetworkRate && tuner.NetworkRate > 0) return false  // data flowing
  return true
}

function SignalMini({ value, label }: { value?: number; label: string }) {
  const pct = value ?? 0
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex flex-col items-center gap-0.5 w-9">
      <div className="text-[9px] text-muted uppercase">{label}</div>
      <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] font-mono text-gray-400">{pct}%</div>
    </div>
  )
}

function TunerRow({
  tuner,
  channels,
  guideMap,
}: {
  tuner: HDHomeRunTunerStatus
  channels: HDHomeRunChannel[]
  guideMap: Map<string, HDHomeRunGuideChannel>
}) {
  const idle = isIdle(tuner)
  const ch = tuner.VctNumber
    ? channels.find((c) => c.GuideNumber === tuner.VctNumber)
    : null
  const rateMbps =
    tuner.NetworkRate && tuner.NetworkRate > 0
      ? `${(tuner.NetworkRate / 1_000_000).toFixed(1)} Mbps`
      : null
  const guideCh = tuner.VctNumber ? guideMap.get(tuner.VctNumber) : undefined
  const prog = currentProgram(guideCh)
  const progress = prog ? programProgress(prog) : 0

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-surface-3 last:border-0">
      {/* Tuner badge */}
      <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
        <Radio className={`w-3.5 h-3.5 flex-shrink-0 ${idle ? 'text-muted' : 'text-green-400'}`} />
        <span className={`text-sm font-medium ${idle ? 'text-muted' : 'text-gray-100'}`}>
          Tuner {tuner.number}
        </span>
      </div>

      {/* Channel + programme info */}
      <div className="flex-1 min-w-0">
        {idle ? (
          <span className="text-xs text-muted italic">Idle</span>
        ) : (
          <>
            <div className="text-sm font-medium text-gray-100 truncate">
              {ch?.GuideName ?? tuner.VctName ?? tuner.VctNumber ?? 'Active'}
            </div>
            {prog ? (
              <div className="mt-0.5 space-y-0.5">
                <div className="text-xs text-gray-300 truncate font-medium">{prog.Title}{prog.EpisodeTitle ? ` — ${prog.EpisodeTitle}` : ''}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-[10px] text-muted flex-shrink-0">{fmtTime(prog.StartTime)}–{fmtTime(prog.EndTime)}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
                {tuner.VctNumber && <span>Ch {tuner.VctNumber}</span>}
                {tuner.TargetIP && <span>→ {tuner.TargetIP}</span>}
                {rateMbps && <span>{rateMbps}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Signal bars — only when active */}
      <div className="flex gap-2 flex-shrink-0 w-[116px]">
        {!idle && (
          <>
            <SignalMini value={tuner.SignalStrengthPercent} label="Sig" />
            <SignalMini value={tuner.SignalQualityPercent} label="SNQ" />
            <SignalMini value={tuner.SymbolQualityPercent} label="SYM" />
          </>
        )}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy stream URL"
      className="p-1 rounded hover:bg-surface-3 text-muted hover:text-gray-100 transition-colors"
    >
      {copied ? (
        <ClipboardCheck className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Clipboard className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

// ── Shared overlay hooks ─────────────────────────────────────────────────────

/**
 * Makes a modal card draggable by its header.
 * Directly mutates the card's style.transform so React re-renders aren't
 * triggered on every mousemove event.
 */
function useDraggable() {
  const cardRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, x: 0, y: 0 })

  function onDragStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    // Don't hijack clicks on interactive children
    if ((e.target as HTMLElement).closest('button,input,a,video')) return
    drag.current = { ...drag.current, active: true, startX: e.clientX, startY: e.clientY, baseX: drag.current.x, baseY: drag.current.y }
    document.body.style.cursor = 'grabbing'
    e.preventDefault()
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!drag.current.active || !cardRef.current) return
      drag.current.x = drag.current.baseX + (e.clientX - drag.current.startX)
      drag.current.y = drag.current.baseY + (e.clientY - drag.current.startY)
      cardRef.current.style.transform = `translate(calc(-50% + ${drag.current.x}px), calc(-50% + ${drag.current.y}px))`
    }
    function onMouseUp() { drag.current.active = false; document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return { cardRef, onDragStart }
}

/** Native browser Picture-in-Picture for a <video> ref. */
function usePiP(videoRef: React.RefObject<HTMLVideoElement>) {
  const [isPiP, setIsPiP] = useState(false)
  const supported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnter = () => setIsPiP(true)
    const onLeave = () => setIsPiP(false)
    v.addEventListener('enterpictureinpicture', onEnter)
    v.addEventListener('leavepictureinpicture', onLeave)
    return () => { v.removeEventListener('enterpictureinpicture', onEnter); v.removeEventListener('leavepictureinpicture', onLeave) }
  }, [videoRef])

  async function togglePiP() {
    if (!videoRef.current) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await videoRef.current.requestPictureInPicture()
    } catch { /* not supported or denied */ }
  }

  return { isPiP, supported, togglePiP }
}

interface VideoOverlayProps {
  channel: HDHomeRunChannel
  hdhr: ReturnType<typeof api.hdhomerun>
  guideMap: Map<string, HDHomeRunGuideChannel>
  muteByDefault?: boolean
  onClose: () => void
}

// Fragmented MP4 codec string matching ffmpeg output:
//   avc1.42001E = H.264 baseline profile, level 3.0
//   mp4a.40.2   = AAC-LC
const FMPEG_MIME = 'video/mp4; codecs="avc1.42001E,mp4a.40.2"'

// Multi-stream uses level 4.0 (required for 1280×360 / 1280×720 combined output)
//   avc1.420028 = H.264 baseline profile, level 4.0 — video-only (no audio track)
const MULTI_VIDEO_MIME = 'video/mp4; codecs="avc1.420028"'
// Audio-only fMP4 streams (AAC-LC)
const MULTI_AUDIO_MIME = 'audio/mp4; codecs="mp4a.40.2"'

function VideoOverlay({ channel, hdhr, guideMap, muteByDefault = false, onClose }: VideoOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sbRef = useRef<SourceBuffer | null>(null)
  const [status, setStatus] = useState<'starting' | 'playing' | 'error'>('starting')
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [signal, setSignal] = useState<HDHomeRunTunerStatus | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<{
    resolution: string; fps: number; bitrate: string;
    decoded: number; dropped: number; buffered: string;
  } | null>(null)
  const bytesRef = useRef(0)
  const lastBytesRef = useRef(0)
  const lastBytesTimeRef = useRef(Date.now())
  const lastFramesRef = useRef(0)
  const { cardRef, onDragStart } = useDraggable()
  const { isPiP, supported: pipSupported, togglePiP } = usePiP(videoRef)

  // Poll tuner signal every 5 s while the overlay is open
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await hdhr.tuners()
        if (cancelled) return
        const match = res.tuners.find(t => t.VctNumber === channel.GuideNumber)
        setSignal(match ?? null)
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.GuideNumber])

  // Sample playback stats every second (only computed when overlay is visible)
  useEffect(() => {
    if (!showStats) return
    const id = setInterval(() => {
      const el = videoRef.current
      if (!el) return
      const now = Date.now()
      const elapsed = (now - lastBytesTimeRef.current) / 1000
      const bytes = bytesRef.current - lastBytesRef.current
      lastBytesRef.current = bytesRef.current
      lastBytesTimeRef.current = now
      const kbps = elapsed > 0 ? (bytes * 8) / elapsed / 1000 : 0
      const bitrateStr = kbps >= 1000 ? `${(kbps / 1000).toFixed(2)} Mbps` : `${kbps.toFixed(0)} Kbps`

      const quality = el.getVideoPlaybackQuality?.()
      const totalFrames = quality?.totalVideoFrames ?? 0
      const fps = elapsed > 0 ? Math.round((totalFrames - lastFramesRef.current) / elapsed) : 0
      lastFramesRef.current = totalFrames

      const buffered = el.buffered.length > 0
        ? `${(el.buffered.end(el.buffered.length - 1) - el.currentTime).toFixed(1)}s`
        : '0s'

      setStats({
        resolution: el.videoWidth && el.videoHeight ? `${el.videoWidth}×${el.videoHeight}` : '—',
        fps,
        bitrate: bitrateStr,
        decoded: totalFrames,
        dropped: quality?.droppedVideoFrames ?? 0,
        buffered,
      })
    }, 1000)
    return () => clearInterval(id)
  }, [showStats])

  function jumpToLive() {
    const el = videoRef.current
    const sb = sbRef.current
    if (!el || !sb || sb.updating) return
    // Clear the entire buffer so the next incoming chunk becomes the new start,
    // then resume playback from there.
    try {
      if (sb.buffered.length > 0) {
        sb.remove(sb.buffered.start(0), sb.buffered.end(sb.buffered.length - 1))
      }
    } catch { /* ignore */ }
    el.play().catch(() => {})
  }

  useEffect(() => {
    if (!channel.URL) {
      setStatus('error')
      setPlayerError('No stream URL for this channel.')
      return
    }

    const el = videoRef.current
    if (!el) return

    if (!MediaSource.isTypeSupported(FMPEG_MIME)) {
      setStatus('error')
      setPlayerError('Your browser does not support fMP4 playback. Try Chrome or Firefox.')
      return
    }

    const ms = new MediaSource()
    const objectUrl = URL.createObjectURL(ms)
    el.src = objectUrl

    let ws: WebSocket | null = null
    let sb: SourceBuffer | null = null
    let closed = false
    let paused = false
    // Queue for chunks that arrive while SourceBuffer is still updating
    const queue: ArrayBuffer[] = []

    function flushQueue() {
      if (!sb || sb.updating || queue.length === 0 || paused) return
      const next = queue.shift()!
      try {
        sb.appendBuffer(next)
      } catch {
        // SourceBuffer full — drop oldest data and retry
        if (sb.buffered.length > 0) {
          const start = sb.buffered.start(0)
          const end = sb.buffered.end(0)
          if (end - start > 10) {
            try { sb.remove(start, start + 5) } catch { /* ignore */ }
          }
        }
      }
    }

    // While paused: discard incoming WS data so the buffer doesn't grow ahead
    // of the playhead and trigger an auto-seek to the live edge.
    const onPause = () => {
      paused = true
      queue.length = 0
      setIsPaused(true)
    }
    const onPlay = () => {
      paused = false
      setIsPaused(false)
      flushQueue()
    }
    el.addEventListener('pause', onPause)
    el.addEventListener('play', onPlay)

    ms.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(objectUrl)
      try {
        sb = ms.addSourceBuffer(FMPEG_MIME)
      } catch (e) {
        setStatus('error')
        setPlayerError(`MSE init failed: ${e}`)
        return
      }
      sb.mode = 'sequence'
      sb.addEventListener('updateend', flushQueue)
      sbRef.current = sb

      ws = hdhr.openStreamSocket(channel.URL!)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        // Nothing needed — ffmpeg starts streaming immediately
      }

      ws.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
        if (closed || !sb || paused) return
        bytesRef.current += evt.data.byteLength
        queue.push(evt.data)
        flushQueue()
        // Start playback as soon as we have some buffered data
        if (status !== 'playing' && el.readyState >= 2) {
          el.play().catch(() => {})
          setStatus('playing')
        }
      }

      ws.onerror = () => {
        if (!closed) {
          setStatus('error')
          setPlayerError('WebSocket error — stream disconnected.')
        }
      }

      ws.onclose = (evt) => {
        if (!closed && evt.code === 4403) {
          setStatus('error')
          setPlayerError('Live streaming is disabled. Enable it in the HDHomeRun plugin settings.')
        } else if (!closed && evt.code !== 1000) {
          setStatus('error')
          setPlayerError(`Stream closed (${evt.code}).`)
        }
      }
    })

    el.addEventListener('canplay', () => {
      if (status !== 'playing') {
        el.play().catch(() => {})
        setStatus('playing')
      }
    }, { once: true })

    return () => {
      closed = true
      sbRef.current = null
      el.removeEventListener('pause', onPause)
      el.removeEventListener('play', onPlay)
      ws?.close()
      ws = null
      try { ms.endOfStream() } catch { /* may already be closed */ }
      el.removeAttribute('src')
      el.load()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.URL])

  const guideCh = guideMap.get(channel.GuideNumber)
  const prog = currentProgram(guideCh)
  const progress = prog ? programProgress(prog) : 0
  const logoUrl = guideCh?.ImageURL ?? prog?.ImageURL

  // While PiP is active, hide the modal but keep <video> in the DOM so the
  // visibility:hidden keeps the <video> in the same DOM position (no remount),
  // so MediaSource + WebSocket stay alive while PiP is active.
  // pointer-events:none prevents backdrop clicks while hidden.
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70"
      style={{ visibility: isPiP ? 'hidden' : 'visible', pointerEvents: isPiP ? 'none' : 'auto' }}
      onClick={onClose}
    >
      {/* Draggable card — click on backdrop closes, click on card does not */}
      <div
        ref={cardRef}
        className="card p-4 space-y-3 absolute overflow-auto"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80vw', maxWidth: '900px', minWidth: '380px', minHeight: '180px',
          resize: 'both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — drag handle (double-click excluded from interactive children) */}
        <div
          className="flex items-start justify-between gap-3 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onDragStart}
        >
          {/* Channel logo */}
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              className="w-10 h-10 rounded object-contain bg-surface-3 flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-100">{channel.GuideName}</span>
              <span className="text-xs text-muted">Ch {channel.GuideNumber}</span>
              {isPiP && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold">
                  Playing in PiP
                </span>
              )}
            </div>
            {prog && (
              <div className="mt-1 space-y-1">
                <div className="text-xs text-gray-200 font-medium truncate">
                  {prog.Title}
                  {prog.EpisodeTitle && <span className="text-muted font-normal"> — {prog.EpisodeTitle}</span>}
                </div>
                {prog.Synopsis && (
                  <div className="text-xs text-muted line-clamp-2">{prog.Synopsis}</div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-[10px] text-muted flex-shrink-0 tabular-nums">
                    {fmtTime(prog.StartTime)} – {fmtTime(prog.EndTime)}
                  </span>
                </div>
              </div>
            )}
          </div>
          {/* Signal levels for the active tuner */}
          {signal && (
            <div className="flex items-end gap-2 flex-shrink-0 px-2">
              <SignalMini value={signal.SignalStrengthPercent} label="SS" />
              <SignalMini value={signal.SignalQualityPercent} label="SNQ" />
              <SignalMini value={signal.SymbolQualityPercent} label="SEQ" />
            </div>
          )}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowStats(s => !s)}
              title={showStats ? 'Hide stats' : 'Stats for nerds'}
              className={`p-1 rounded hover:bg-surface-3 transition-colors ${showStats ? 'text-accent' : 'text-muted hover:text-gray-100'}`}
            >
              <Activity className="w-4 h-4" />
            </button>
            {pipSupported && (
              <button
                onClick={togglePiP}
                title={isPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                className={`p-1 rounded hover:bg-surface-3 transition-colors ${isPiP ? 'text-accent' : 'text-muted hover:text-gray-100'}`}
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close player"
              className="p-1 rounded hover:bg-surface-3 text-muted hover:text-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {status === 'error' ? (
          <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {playerError}
          </div>
        ) : (
          <div className="relative">
            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black rounded z-10">
                <div className="flex flex-col items-center gap-2 text-muted text-sm">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Starting stream…
                </div>
              </div>
            )}
            {isPaused && (
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={jumpToLive}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                  title="Discard buffered video and jump back to the live stream"
                >
                  <Radio className="w-3 h-3" />
                  LIVE
                </button>
              </div>
            )}
            {/* Stats for nerds overlay */}
            {showStats && stats && (
              <div className="absolute bottom-2 left-2 z-10 rounded bg-black/80 text-[11px] font-mono text-green-400 px-3 py-2 space-y-0.5 pointer-events-none">
                <div className="text-[10px] text-green-500/70 font-sans font-semibold mb-1 tracking-wide">STREAM STATS</div>
                <div className="flex gap-3">
                  <span className="text-gray-400">Resolution</span><span>{stats.resolution}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400">FPS</span><span>{stats.fps}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400">Bitrate</span><span>{stats.bitrate}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400">Buffer</span><span>{stats.buffered}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400">Decoded</span><span>{stats.decoded.toLocaleString()} frames</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400">Dropped</span>
                  <span className={stats.dropped > 0 ? 'text-yellow-400' : ''}>{stats.dropped.toLocaleString()} frames</span>
                </div>
                {signal && (
                  <>
                    <div className="border-t border-green-900/60 my-1" />
                    <div className="flex gap-3"><span className="text-gray-400">Signal</span><span>{signal.SignalStrengthPercent ?? '—'}%</span></div>
                    <div className="flex gap-3"><span className="text-gray-400">SNQ</span><span>{signal.SignalQualityPercent ?? '—'}%</span></div>
                    <div className="flex gap-3"><span className="text-gray-400">SEQ</span><span>{signal.SymbolQualityPercent ?? '—'}%</span></div>
                    {signal.NetworkRate && <div className="flex gap-3"><span className="text-gray-400">Net rate</span><span>{(signal.NetworkRate / 1_000_000).toFixed(1)} Mbps</span></div>}
                  </>
                )}
              </div>
            )}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              controls
              muted={muteByDefault}
              className="w-full rounded bg-black"
              style={{ minHeight: '240px' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function fmtDuration(startUnix: number, endUnix: number): string {
  const mins = Math.round((endUnix - startUnix) / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Guide (EPG) tab ──────────────────────────────────────────────────────────

const PX_PER_MIN = 5      // 300px/hour
const ROW_H = 58          // px per channel row
const CH_COL_W = 132      // px for the sticky channel name column
const HEADER_H = 32       // px for the time header row
const SLOT_MINS = 30      // time label every 30 minutes

interface ProgramDetailState {
  prog: HDHomeRunProgram
  channelName: string
  logoUrl?: string
}

function fmtSlotTime(unix: number): string {
  const d = new Date(unix * 1000)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}:00${ampm}` : `${h12}:${m.toString().padStart(2, '0')}`
}

function GuideTab({
  guideData,
  channels,
  hdhr,
  onPlayChannel,
}: {
  guideData: HDHomeRunGuideChannel[]
  channels: HDHomeRunChannel[]
  hdhr: ReturnType<typeof api.hdhomerun>
  onPlayChannel: (ch: HDHomeRunChannel) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<ProgramDetailState | null>(null)
  // Local copy so we can append data from progressive loads
  const [localGuide, setLocalGuide] = useState<HDHomeRunGuideChannel[]>(guideData)
  const [loadingMore, setLoadingMore] = useState(false)
  const fetchedUntil = useRef(0)

  // Sync when parent loads initial data
  useEffect(() => {
    if (guideData.length > 0) {
      setLocalGuide(guideData)
      fetchedUntil.current = 0  // reset so we can try fetching more from new baseline
    }
  }, [guideData])

  const now = Math.floor(Date.now() / 1000)
  // Window: round back to previous hour, extend dynamically based on loaded data
  const windowStart = Math.floor(now / 3600) * 3600 - 3600

  const maxEndTime = useMemo(() => {
    let max = now + 4 * 3600
    localGuide.forEach(ch => ch.Guide.forEach(p => { if (p.EndTime > max) max = p.EndTime }))
    return max
  }, [localGuide, now])

  const windowEnd = maxEndTime + 1800  // 30-min buffer past last known show
  const totalMins = (windowEnd - windowStart) / 60

  // Slot tick marks every 30 minutes
  const slots: number[] = []
  for (let t = windowStart; t < windowEnd; t += SLOT_MINS * 60) slots.push(t)

  // Scroll to "now" on first data load
  useEffect(() => {
    if (scrollRef.current && localGuide.length > 0) {
      const nowX = ((now - windowStart) / 60) * PX_PER_MIN
      scrollRef.current.scrollLeft = Math.max(0, nowX - 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localGuide.length > 0])

  async function loadMore() {
    if (loadingMore) return
    const startTime = maxEndTime - 1800  // 30-min overlap to avoid gaps
    if (fetchedUntil.current >= startTime) return
    fetchedUntil.current = startTime
    setLoadingMore(true)
    try {
      const res = await hdhr.guide(undefined, startTime)
      if (res.guide && res.guide.length > 0) {
        setLocalGuide(prev => {
          const next = prev.map(ch => ({ ...ch, Guide: [...ch.Guide] }))
          res.guide.forEach(newCh => {
            const existing = next.find(c => c.GuideNumber === newCh.GuideNumber)
            if (existing) {
              const existingStarts = new Set(existing.Guide.map(p => p.StartTime))
              const fresh = newCh.Guide.filter(p => !existingStarts.has(p.StartTime))
              existing.Guide.push(...fresh)
            }
          })
          return next
        })
      }
    } catch { /* silently ignore */ }
    finally { setLoadingMore(false) }
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const distFromRight = el.scrollWidth - el.scrollLeft - el.clientWidth
    if (distFromRight < 1200 && !loadingMore) loadMore()
  }

  // ── Drag-to-scroll ──────────────────────────────────────────────────────────
  const drag = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false })

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false }
    document.body.style.cursor = 'grabbing'
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag.current.active || !scrollRef.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true
    scrollRef.current.scrollLeft = drag.current.scrollLeft - dx
    scrollRef.current.scrollTop = drag.current.scrollTop - dy
  }

  function stopDrag() {
    drag.current.active = false
    document.body.style.cursor = ''
  }

  // Swallow the click that fires after a drag ends so programme detail doesn't open
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.stopPropagation()
      drag.current.moved = false
    }
  }

  // Sort channels by guide number (numeric)
  const sorted = useMemo(() => [...localGuide].sort((a, b) => {
    const an = parseFloat(a.GuideNumber)
    const bn = parseFloat(b.GuideNumber)
    return isNaN(an) || isNaN(bn) ? a.GuideNumber.localeCompare(b.GuideNumber) : an - bn
  }), [localGuide])

  const nowLineX = CH_COL_W + ((now - windowStart) / 60) * PX_PER_MIN

  if (localGuide.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        Guide data not available. The device may not have a DeviceAuth token (older firmware).
      </div>
    )
  }

  return (
    <div className="relative">
      {loadingMore && (
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5 text-xs text-muted bg-surface-2 border border-surface-3 rounded px-2 py-1 shadow">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading more…
        </div>
      )}
      <div
        ref={scrollRef}
        className="overflow-auto rounded border border-surface-3 select-none"
        style={{ maxHeight: 'calc(100vh - 230px)', cursor: 'grab' }}
        onScroll={onScroll}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onClickCapture={onClickCapture}
      >
        {/* Full-width inner container */}
        <div style={{ minWidth: `${CH_COL_W + totalMins * PX_PER_MIN}px`, position: 'relative' }}>

          {/* ── Time header ── */}
          <div
            className="flex sticky top-0 z-20 bg-surface-1 border-b border-surface-3"
            style={{ height: HEADER_H }}
          >
            {/* Corner */}
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-surface-1 border-r border-surface-3"
              style={{ width: CH_COL_W }}
            />
            {/* Slot labels */}
            <div className="relative" style={{ flex: 1 }}>
              {slots.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 flex items-center border-r border-surface-3/40"
                  style={{
                    left: ((t - windowStart) / 60) * PX_PER_MIN,
                    width: SLOT_MINS * PX_PER_MIN,
                    height: HEADER_H,
                  }}
                >
                  <span className="text-[10px] text-muted pl-1.5 select-none tabular-nums">
                    {fmtSlotTime(t)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── "Now" vertical line (spans all rows) ── */}
          <div
            className="absolute z-10 pointer-events-none"
            style={{ left: nowLineX, top: 0, bottom: 0, width: 2, background: 'rgba(239,68,68,0.7)' }}
          />

          {/* ── Channel rows ── */}
          {sorted.map((guideCh) => {
            const ch = channels.find((c) => c.GuideNumber === guideCh.GuideNumber)
            const logoUrl = guideCh.ImageURL
            const progs = guideCh.Guide.filter(
              (p) => p.EndTime > windowStart && p.StartTime < windowEnd
            )

            return (
              <div
                key={guideCh.GuideNumber}
                className="flex border-b border-surface-3 last:border-0"
                style={{ height: ROW_H }}
              >
                {/* Channel cell — sticky left */}
                <div
                  className={`flex-shrink-0 sticky left-0 z-10 bg-surface-1 border-r border-surface-3 flex items-center gap-2 px-2 ${
                    ch ? 'cursor-pointer hover:bg-surface-2' : ''
                  } transition-colors`}
                  style={{ width: CH_COL_W }}
                  onClick={() => ch && onPlayChannel(ch)}
                  title={ch ? `Watch ${guideCh.GuideName} live` : undefined}
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt=""
                      className="w-9 h-9 object-contain flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <Tv className="w-5 h-5 text-muted flex-shrink-0" />
                  )}
                  <span className="text-xs text-gray-300 font-medium leading-tight truncate">
                    {guideCh.GuideName}
                  </span>
                </div>

                {/* Programme blocks */}
                <div className="relative overflow-hidden" style={{ flex: 1 }}>
                  {progs.map((prog, i) => {
                    const left = Math.max(0, ((prog.StartTime - windowStart) / 60) * PX_PER_MIN)
                    const right = Math.min(totalMins * PX_PER_MIN, ((prog.EndTime - windowStart) / 60) * PX_PER_MIN)
                    const width = right - left
                    if (width < 4) return null

                    const isNow = prog.StartTime <= now && prog.EndTime > now
                    const isNew = prog.Filter?.includes('New')

                    return (
                      <button
                        key={i}
                        className={`absolute inset-y-0 text-left overflow-hidden border-r border-surface-3 px-1.5 py-1 transition-colors ${
                          isNow
                            ? 'bg-blue-950/60 hover:bg-blue-900/60 ring-1 ring-inset ring-blue-600/40'
                            : 'bg-surface-2 hover:bg-surface-3'
                        }`}
                        style={{ left, width: Math.max(width - 1, 1) }}
                        onClick={() => {
                          if (isNow && ch) {
                            onPlayChannel(ch)
                          } else {
                            setDetail({ prog, channelName: guideCh.GuideName, logoUrl })
                          }
                        }}
                        title={isNow && ch ? `Watch ${guideCh.GuideName} live` : `${prog.Title}${prog.EpisodeTitle ? ` — ${prog.EpisodeTitle}` : ''}`}
                      >
                        <div className="flex items-start gap-1 min-w-0">
                          <span className="text-xs font-medium text-gray-100 leading-tight truncate">
                            {prog.Title}
                          </span>
                          {isNew && width > 80 && (
                            <span className="text-[9px] px-1 rounded bg-green-800 text-green-300 font-bold flex-shrink-0 leading-tight mt-px">
                              NEW
                            </span>
                          )}
                        </div>
                        {prog.EpisodeTitle && width > 100 && (
                          <div className="text-[10px] text-muted truncate leading-tight mt-0.5">
                            {prog.EpisodeTitle}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Programme detail modal */}
      {detail && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 bg-black/60"
          onClick={() => setDetail(null)}
        >
          <div
            className="card p-5 w-[90vw] max-w-md space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {(detail.prog.ImageURL ?? detail.logoUrl) && (
                <img
                  src={detail.prog.ImageURL ?? detail.logoUrl}
                  alt=""
                  className="w-16 h-16 rounded object-cover flex-shrink-0 bg-surface-3"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-100 leading-snug">{detail.prog.Title}</div>
                {detail.prog.EpisodeTitle && (
                  <div className="text-xs text-gray-300 mt-0.5">{detail.prog.EpisodeTitle}</div>
                )}
                <div className="text-xs text-muted mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>{detail.channelName}</span>
                  <span>·</span>
                  <span className="tabular-nums">{fmtTime(detail.prog.StartTime)} – {fmtTime(detail.prog.EndTime)}</span>
                  <span>·</span>
                  <span>{fmtDuration(detail.prog.StartTime, detail.prog.EndTime)}</span>
                  {detail.prog.Filter?.includes('New') && (
                    <span className="px-1 rounded bg-green-800 text-green-300 text-[10px] font-bold">NEW</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="p-1 rounded hover:bg-surface-3 text-muted hover:text-gray-100 flex-shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {detail.prog.Synopsis && (
              <p className="text-xs text-muted leading-relaxed">{detail.prog.Synopsis}</p>
            )}
            {detail.prog.OriginalAirdate && (
              <div className="text-xs text-muted">
                Originally aired: {new Date(detail.prog.OriginalAirdate * 1000).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Multi-channel overlay ────────────────────────────────────────────────────

// Grid position labels for the header — ordering matches ffmpeg xstack layout
const GRID_LABELS = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right']

interface MultiVideoOverlayProps {
  channels: HDHomeRunChannel[]   // 2–4, ordered by grid position
  hdhr: ReturnType<typeof api.hdhomerun>
  guideMap: Map<string, HDHomeRunGuideChannel>
  muteByDefault?: boolean
  onClose: () => void
}

function MultiVideoOverlay({ channels, hdhr, guideMap, muteByDefault = false, onClose }: MultiVideoOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const urls = channels.map(ch => ch.URL).filter(Boolean) as string[]
  // One audio element per channel — stored as a ref array (not state, no re-renders)
  const audioEls = useRef<HTMLAudioElement[]>([])
  // Per-channel SourceBuffer and incoming-data queue
  const audioSbRefs = useRef<(SourceBuffer | null)[]>(urls.map(() => null))
  const audioQueueRefs = useRef<ArrayBuffer[][]>(urls.map(() => []))
  const [status, setStatus] = useState<'starting' | 'playing' | 'error'>('starting')
  const [playerError, setPlayerError] = useState<string | null>(null)
  // sessionId is delivered by the video WS as a text frame before binary data
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [audioIndex, setAudioIndex] = useState(0)
  const [audioAll, setAudioAll] = useState(false)
  const [audioMuted, setAudioMuted] = useState(muteByDefault)
  // Ref so async callbacks always see the current mute state
  const audioMutedRef = useRef(muteByDefault)
  const [tuners, setTuners] = useState<HDHomeRunTunerStatus[]>([])
  const { cardRef, onDragStart } = useDraggable()
  const { isPiP, supported: pipSupported, togglePiP } = usePiP(videoRef)

  // Poll tuner signal every 5 s
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await hdhr.tuners()
        if (!cancelled) setTuners(res.tuners)
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Video stream (grid, no audio) — never restarts when audioIndex changes ─
  useEffect(() => {
    setStatus('starting')
    setPlayerError(null)
    setSessionId(null)
    if (urls.length < 2) {
      setStatus('error')
      setPlayerError('At least 2 channels with stream URLs are required.')
      return
    }

    const el = videoRef.current
    if (!el) return

    if (!MediaSource.isTypeSupported(MULTI_VIDEO_MIME)) {
      setStatus('error')
      setPlayerError('Your browser does not support this codec. Try Chrome or Firefox.')
      return
    }

    const ms = new MediaSource()
    const objectUrl = URL.createObjectURL(ms)
    el.src = objectUrl

    let ws: WebSocket | null = null
    let sb: SourceBuffer | null = null
    let closed = false
    const queue: ArrayBuffer[] = []

    function flushQueue() {
      if (!sb || sb.updating || queue.length === 0) return
      const next = queue.shift()!
      try {
        sb.appendBuffer(next)
      } catch {
        if (sb.buffered.length > 0) {
          const start = sb.buffered.start(0)
          const end = sb.buffered.end(0)
          if (end - start > 10) {
            try { sb.remove(start, start + 5) } catch { /* ignore */ }
          }
        }
      }
    }

    ms.addEventListener('sourceopen', () => {
      URL.revokeObjectURL(objectUrl)
      try {
        sb = ms.addSourceBuffer(MULTI_VIDEO_MIME)
      } catch (e) {
        setStatus('error')
        setPlayerError(`MSE init failed: ${e}`)
        return
      }
      sb.mode = 'sequence'
      sb.addEventListener('updateend', flushQueue)

      ws = hdhr.openMultiVideoSocket(urls)
      ws.binaryType = 'arraybuffer'

      ws.onmessage = (evt: MessageEvent<ArrayBuffer | string>) => {
        if (closed) return
        // First message from server is a text frame carrying the session_id
        if (typeof evt.data === 'string') {
          try {
            const msg = JSON.parse(evt.data) as { session_id?: string }
            if (msg.session_id) setSessionId(msg.session_id)
          } catch { /* ignore */ }
          return
        }
        if (!sb) return
        queue.push(evt.data)
        flushQueue()
        if (status !== 'playing' && el.readyState >= 2) {
          el.play().catch(() => {})
          setStatus('playing')
        }
      }

      ws.onerror = () => {
        if (!closed) { setStatus('error'); setPlayerError('WebSocket error — stream disconnected.') }
      }

      ws.onclose = (evt) => {
        if (!closed && evt.code === 4403) {
          setStatus('error')
          setPlayerError('Live streaming is disabled. Enable it in the HDHomeRun plugin settings.')
        } else if (!closed && evt.code !== 1000) {
          setStatus('error')
          setPlayerError(`Stream closed (${evt.code}).`)
        }
      }
    })

    el.addEventListener('canplay', () => {
      if (status !== 'playing') { el.play().catch(() => {}); setStatus('playing') }
    }, { once: true })

    return () => {
      closed = true
      ws?.close()
      ws = null
      try { ms.endOfStream() } catch { /* ignore */ }
      el.removeAttribute('src')
      el.load()
    }
  // audioIndex intentionally excluded — changing audio must NOT restart the video stream
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join(',')])

  // ── Audio MSE pipelines + WebSockets — all N channels set up once when sessionId arrives.
  // WS connections stay open for the lifetime of the session; switching channels only
  // mutes/unmutes elements (no SourceBuffer surgery, no WS reconnect = no race conditions).
  useEffect(() => {
    if (!sessionId) return
    if (!MediaSource.isTypeSupported(MULTI_AUDIO_MIME)) return

    const els = audioEls.current
    const cleanups: (() => void)[] = []

    els.forEach((el, i) => {
      const ms = new MediaSource()
      const objectUrl = URL.createObjectURL(ms)
      el.src = objectUrl
      let wsClosed = false

      function flushQueue() {
        const sb = audioSbRefs.current[i]
        if (!sb || sb.updating || audioQueueRefs.current[i].length === 0) return
        const next = audioQueueRefs.current[i].shift()!
        try { sb.appendBuffer(next) } catch { /* live stream — dropping is fine */ }
      }

      ms.addEventListener('sourceopen', () => {
        URL.revokeObjectURL(objectUrl)
        let sb: SourceBuffer
        try { sb = ms.addSourceBuffer(MULTI_AUDIO_MIME) } catch { return }
        sb.mode = 'sequence'
        sb.addEventListener('updateend', flushQueue)
        audioSbRefs.current[i] = sb

        // Muted autoplay is always allowed regardless of gesture window.
        // Capture the muted state set by the mute-sync effect (which runs before sourceopen),
        // force muted for the play() call, then restore the intended state afterwards.
        const intendedMuted = el.muted
        el.muted = true
        el.play().then(() => { el.muted = intendedMuted }).catch(() => {})

        // Open the WS for this channel — kept open for the full session lifetime.
        const ws = hdhr.openMultiAudioSocket(sessionId, i)
        ws.binaryType = 'arraybuffer'

        ws.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
          if (wsClosed) return
          audioQueueRefs.current[i].push(evt.data)
          flushQueue()
        }
        ws.onerror = () => { /* silent */ }
        ws.onclose = () => { /* ended or cleaned up */ }

        cleanups.push(() => {
          wsClosed = true
          ws.close()
        })
      })

      cleanups.push(() => {
        audioSbRefs.current[i] = null
        audioQueueRefs.current[i] = []
        try { ms.endOfStream() } catch { /* ignore */ }
        el.removeAttribute('src')
        el.load()
      })
    })

    return () => cleanups.forEach(fn => fn())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Mute sync — runs whenever the active channel or mute state changes.
  // Never touches WS or SourceBuffers; only adjusts .muted on each audio element.
  useEffect(() => {
    const activeIndices = audioAll ? urls.map((_, i) => i) : [audioIndex]
    audioEls.current.forEach((el, i) => {
      el.muted = activeIndices.includes(i) ? audioMutedRef.current : true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioIndex, audioAll])

  // While PiP is active, hide the modal but keep <video> + <audio> in the DOM.
  // When the browser PiP window is closed or expanded back, isPiP goes false
  // and the full modal reappears.
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70"
      style={{ visibility: isPiP ? 'hidden' : 'visible', pointerEvents: isPiP ? 'none' : 'auto' }}
      onClick={onClose}
    >
      {/* One hidden audio element per channel — positioned off-screen so the browser plays them */}
      {urls.map((_, i) => (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          key={i}
          ref={el => { if (el) audioEls.current[i] = el }}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        />
      ))}

      <div
        ref={cardRef}
        className="card p-4 space-y-3 absolute overflow-auto"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '92vw', maxWidth: '1100px', minWidth: '400px', minHeight: '180px',
          resize: 'both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — drag handle */}
        <div
          className="flex items-start justify-between gap-3 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onDragStart}
        >
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-100">
                Multi-Channel View · {channels.length} streams
              </span>
              {isPiP && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold">
                  Playing in PiP
                </span>
              )}
            </div>
            {/* Channel list with audio selector buttons */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {channels.map((ch, idx) => {
                const guideCh = guideMap.get(ch.GuideNumber)
                const prog = currentProgram(guideCh)
                const sig = tuners.find(t => t.VctNumber === ch.GuideNumber)
                return (
                  <div key={ch.GuideNumber} className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-muted flex-shrink-0 w-4 tabular-nums font-mono">{idx + 1}</span>
                    {guideCh?.ImageURL && (
                      <img src={guideCh.ImageURL} alt="" className="w-4 h-4 object-contain flex-shrink-0"
                           onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-gray-200 truncate block">{ch.GuideName}</span>
                      {prog && <span className="text-[10px] text-muted truncate block">{prog.Title}</span>}
                    </div>
                    {/* Signal bars for this channel's tuner */}
                    {sig && (
                      <div className="flex items-end gap-1 flex-shrink-0">
                        <SignalMini value={sig.SignalStrengthPercent} label="SS" />
                        <SignalMini value={sig.SignalQualityPercent} label="SNQ" />
                        <SignalMini value={sig.SymbolQualityPercent} label="SEQ" />
                      </div>
                    )}
                            {/* Audio source toggle */}
                    <button
                      onClick={() => { setAudioAll(false); setAudioIndex(idx) }}
                      title={
                        audioAll ? `Listen to ${ch.GuideName} only` :
                        audioIndex === idx ? 'Listening to this channel' : `Switch audio to ${ch.GuideName}`
                      }
                      className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                        !audioAll && audioIndex === idx ? 'text-accent' : 'text-muted hover:text-gray-300'
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
            {/* Listen to all channels simultaneously */}
            <button
              onClick={() => setAudioAll(prev => !prev)}
              title={audioAll ? 'Stop listening to all channels' : 'Listen to all channels at once'}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                audioAll
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-surface-3 text-muted hover:text-gray-300 hover:border-gray-500'
              }`}
            >
              <Headphones className="w-3 h-3" />
              All
            </button>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Mute toggle — controls all active audio elements */}
            <button
              onClick={() => {
                const next = !audioMuted
                audioMutedRef.current = next
                setAudioMuted(next)
                audioEls.current.forEach((el, i) => {
                  const isActive = audioAll || i === audioIndex
                  if (isActive) el.muted = next
                })
              }}
              title={audioMuted ? 'Unmute audio' : 'Mute audio'}
              className={`p-1 rounded hover:bg-surface-3 transition-colors ${audioMuted ? 'text-muted' : 'text-gray-100'}`}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => videoRef.current?.requestFullscreen?.()}
              title="Fullscreen"
              className="p-1 rounded hover:bg-surface-3 text-muted hover:text-gray-100 transition-colors"
            >
              <Expand className="w-4 h-4" />
            </button>
            {pipSupported && (
              <button
                onClick={togglePiP}
                title={isPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                className={`p-1 rounded hover:bg-surface-3 transition-colors ${isPiP ? 'text-accent' : 'text-muted hover:text-gray-100'}`}
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close player"
              className="p-1 rounded hover:bg-surface-3 text-muted hover:text-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video — always muted; audio comes from the separate <audio> element */}
        {status === 'error' ? (
          <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {playerError}
          </div>
        ) : (
          <div className="relative">
            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black rounded z-10">
                <div className="flex flex-col items-center gap-2 text-muted text-sm">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Connecting {channels.length} streams…
                </div>
              </div>
            )}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              className="w-full rounded bg-black"
              style={{ minHeight: '240px' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────

export function HDHomeRunView({ instanceId = 'default' }: { instanceId?: string }) {
  const hdhr = api.hdhomerun(instanceId)

  // Shared data — loaded together on mount
  const [tuners, setTuners] = useState<HDHomeRunTunerStatus[]>([])
  const [channels, setChannels] = useState<HDHomeRunChannel[]>([])
  const [lineupStatus, setLineupStatus] = useState<HDHomeRunLineupStatus | null>(null)
  const [device, setDevice] = useState<HDHomeRunDevice | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Channels-specific state
  const [channelSearch, setChannelSearch] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

  // Inline video player state: null = no player open
  const [activeChannel, setActiveChannel] = useState<HDHomeRunChannel | null>(null)

  // Multi-channel selection
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedForMulti, setSelectedForMulti] = useState<HDHomeRunChannel[]>([])
  const [activeMultiChannels, setActiveMultiChannels] = useState<HDHomeRunChannel[] | null>(null)

  function toggleMultiSelect(ch: HDHomeRunChannel) {
    setSelectedForMulti(prev => {
      const idx = prev.findIndex(c => c.GuideNumber === ch.GuideNumber)
      if (idx !== -1) return prev.filter((_, i) => i !== idx)
      if (prev.length >= 4) return prev  // cap at 4
      return [...prev, ch]
    })
  }

  function exitMultiSelect() {
    setMultiSelectMode(false)
    setSelectedForMulti([])
  }

  // Guide data: keyed by GuideNumber for O(1) lookup in tuner rows and video overlay
  const [guideMap, setGuideMap] = useState<Map<string, HDHomeRunGuideChannel>>(new Map())
  // Raw guide array for the EPG tab
  const [guideChannels, setGuideChannels] = useState<HDHomeRunGuideChannel[]>([])

  const [activeTab, setActiveTab] = useState<'overview' | 'guide'>('overview')

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [tunersRes, lineupRes, statusRes, discoverRes] = await Promise.all([
        hdhr.tuners(),
        hdhr.lineup(),
        hdhr.lineupStatus(),
        hdhr.discover(),
      ])
      setTuners(tunersRes.tuners)
      setChannels(lineupRes.channels)
      setLineupStatus(statusRes)
      setDevice(discoverRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load HDHomeRun data')
    } finally {
      setLoading(false)
    }
    // Fetch guide in the background — non-blocking, fails silently
    try {
      const res = await hdhr.guide()
      if (res.guide.length > 0) {
        const m = new Map<string, HDHomeRunGuideChannel>()
        res.guide.forEach(ch => m.set(ch.GuideNumber, ch))
        setGuideMap(m)
        setGuideChannels(res.guide)
      }
    } catch { /* guide unavailable — silently ignore */ }
  }

  async function refreshTuners() {
    try {
      const res = await hdhr.tuners()
      setTuners(res.tuners)
    } catch {
      // silently ignore refresh errors
    }
  }

  async function startScan() {
    setScanLoading(true)
    setScanMessage(null)
    try {
      await hdhr.scan()
      setScanMessage('Channel scan started. This may take several minutes.')
      const status = await hdhr.lineupStatus()
      setLineupStatus(status)
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Failed to start scan')
    } finally {
      setScanLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // Auto-refresh tuner status every 10s
    const interval = setInterval(() => refreshTuners(), 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredChannels = channels.filter((ch) => {
    const q = channelSearch.toLowerCase()
    return ch.GuideNumber.toLowerCase().includes(q) || ch.GuideName.toLowerCase().includes(q)
  })

  const activeCount = tuners.filter((t) => !isIdle(t)).length
  const hdCount = channels.filter((ch) => ch.HD === 1).length

  function handlePlayChannel(ch: HDHomeRunChannel) {
    // Toggle: clicking Play on the already-playing channel closes the player
    setActiveChannel((prev) => (prev?.GuideNumber === ch.GuideNumber ? null : ch))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tv className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold">HDHomeRun</h1>
          {device?.FriendlyName && (
            <span className="text-sm text-muted">— {device.FriendlyName}</span>
          )}
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-3 -mb-1">
        {([ ['overview', Tv, 'Overview'], ['guide', Calendar, 'Guide'] ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === id
                ? 'border-accent text-gray-100'
                : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && tuners.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      )}

      {/* Guide tab */}
      {activeTab === 'guide' && (
        <GuideTab
          guideData={guideChannels}
          channels={channels}
          hdhr={hdhr}
          onPlayChannel={setActiveChannel}
        />
      )}

      {!loading && activeTab === 'overview' && (
        /* ── Main horizontal split: left = tuners+channels, right = device panel ── */
        <div className="flex gap-4 items-start">

          {/* ── Left column (~65%) ── */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Tuner status section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Tuners
                  <span className="ml-2 normal-case font-normal">
                    {activeCount > 0 ? (
                      <span className="text-green-400">{activeCount} active</span>
                    ) : (
                      <span>all idle</span>
                    )}
                  </span>
                </h2>
              </div>
              {tuners.length === 0 ? (
                <div className="text-muted text-sm text-center py-4">No tuner data available.</div>
              ) : (
                <div className="card divide-y divide-surface-3 overflow-hidden p-0">
                  {tuners.map((tuner) => (
                    <TunerRow key={tuner.number} tuner={tuner} channels={channels} guideMap={guideMap} />
                  ))}
                </div>
              )}
            </div>

            {/* Channel lineup section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Channels
                  <span className="ml-2 normal-case font-normal text-muted">
                    {channels.length > 0 && (
                      <>
                        <span className="text-gray-100">{channels.length}</span> total ·{' '}
                        <span className="text-blue-400">{hdCount}</span> HD
                      </>
                    )}
                  </span>
                </h2>

                <div className="flex items-center gap-2">
                  {lineupStatus?.ScanInProgress === 1 && (
                    <span className="text-xs text-yellow-400 flex items-center gap-1 animate-pulse">
                      <Scan className="w-3.5 h-3.5" />
                      Scanning…
                    </span>
                  )}

                  {/* Multi-select toggle */}
                  <button
                    onClick={() => {
                      if (multiSelectMode) { exitMultiSelect() } else { setMultiSelectMode(true) }
                    }}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
                      multiSelectMode
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'btn-secondary'
                    }`}
                    title="Select multiple channels to watch simultaneously"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Multi
                  </button>

                  {/* Watch selected button — visible when ≥2 channels chosen */}
                  {multiSelectMode && selectedForMulti.length >= 2 && (
                    <button
                      onClick={() => {
                        setActiveMultiChannels(selectedForMulti)
                        exitMultiSelect()
                      }}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-green-700 bg-green-900/20 text-green-400 hover:bg-green-900/40 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Watch {selectedForMulti.length}
                    </button>
                  )}

                  <button
                    onClick={startScan}
                    disabled={
                      scanLoading ||
                      lineupStatus?.ScanInProgress === 1 ||
                      lineupStatus?.ScanPossible === 0
                    }
                    className="btn-secondary flex items-center gap-1.5 text-xs"
                    title={
                      lineupStatus?.ScanPossible === 0
                        ? 'Scan not available for this source'
                        : 'Scan for channels'
                    }
                  >
                    {scanLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Scan className="w-3.5 h-3.5" />
                    )}
                    Scan
                  </button>
                </div>
              </div>

              {scanMessage && (
                <div className="text-sm text-blue-300 bg-blue-900/20 border border-blue-800 rounded px-3 py-2 mb-2">
                  {scanMessage}
                </div>
              )}

              {/* Search bar */}
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  className="input pl-8 w-full text-sm"
                  placeholder="Search channels…"
                  value={channelSearch}
                  onChange={(e) => setChannelSearch(e.target.value)}
                />
              </div>

              {channels.length === 0 ? (
                <div className="text-muted text-sm text-center py-4">
                  No channels found. Try scanning for channels.
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="text-muted text-sm text-center py-4">No channels match your search.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredChannels.map((ch) => {
                    const isPlaying = activeChannel?.GuideNumber === ch.GuideNumber
                    const guideCh = guideMap.get(ch.GuideNumber)
                    const prog = currentProgram(guideCh)
                    const logoUrl = guideCh?.ImageURL ?? prog?.ImageURL
                    const selectionIdx = selectedForMulti.findIndex(c => c.GuideNumber === ch.GuideNumber)
                    const isSelected = selectionIdx !== -1
                    const canSelect = ch.URL && (isSelected || selectedForMulti.length < 4)

                    // Border varies: multi-select selected → accent, playing → green, default
                    const cardBorder = multiSelectMode
                      ? isSelected
                        ? 'border-accent bg-accent/10'
                        : canSelect
                          ? 'border-surface-3 hover:bg-surface-3/40'
                          : 'border-surface-3 opacity-40'
                      : isPlaying
                        ? 'border-green-700 bg-surface-3/60'
                        : 'border-surface-3 hover:bg-surface-3/40'

                    return (
                      <div
                        key={ch.GuideNumber}
                        className={`flex items-center gap-2 px-3 py-2 rounded border transition-colors ${cardBorder}`}
                      >
                        {/* Channel logo */}
                        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                          {logoUrl ? (
                            <img
                              src={logoUrl}
                              alt=""
                              className="w-8 h-8 rounded object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <Tv className="w-4 h-4 text-muted" />
                          )}
                        </div>

                        {/* Channel info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {ch.Favorite === 1 && (
                              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                            )}
                            <span className="font-mono text-xs text-muted flex-shrink-0">
                              {ch.GuideNumber}
                            </span>
                            <span className="text-sm font-semibold text-gray-100 truncate">
                              {ch.GuideName}
                            </span>
                            {ch.HD === 1 && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-blue-900/50 text-blue-300 font-semibold flex-shrink-0">
                                HD
                              </span>
                            )}
                          </div>
                          {prog ? (
                            <div className="mt-0.5 space-y-0.5">
                              <div className="text-xs text-gray-300 truncate">
                                {prog.Title}
                                {prog.EpisodeTitle && (
                                  <span className="text-muted"> — {prog.EpisodeTitle}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-0.5 rounded-full bg-surface-3 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-accent"
                                    style={{ width: `${programProgress(prog)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted flex-shrink-0 tabular-nums">
                                  {fmtTime(prog.StartTime)}–{fmtTime(prog.EndTime)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted mt-0.5">
                              {ch.VideoCodec ?? '—'}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {multiSelectMode ? (
                            /* Position badge — shows grid slot number when selected */
                            <button
                              onClick={() => canSelect && toggleMultiSelect(ch)}
                              disabled={!canSelect}
                              title={
                                isSelected
                                  ? `Position ${selectionIdx + 1} — click to remove`
                                  : selectedForMulti.length >= 4
                                    ? 'Maximum 4 channels selected'
                                    : 'Add to multi-view'
                              }
                              className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors flex-shrink-0 border ${
                                isSelected
                                  ? 'bg-accent border-accent text-white'
                                  : 'border-surface-3 text-muted hover:border-accent hover:text-gray-100'
                              }`}
                            >
                              {isSelected ? selectionIdx + 1 : ''}
                            </button>
                          ) : ch.URL ? (
                            <>
                              <button
                                onClick={() => handlePlayChannel(ch)}
                                title={isPlaying ? 'Close player' : `Play ${ch.GuideName}`}
                                className={`p-1 rounded hover:bg-surface-3 transition-colors ${
                                  isPlaying
                                    ? 'text-green-400 hover:text-green-300'
                                    : 'text-muted hover:text-green-400'
                                }`}
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <CopyButton text={ch.URL} />
                            </>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          </div>

          {/* ── Right column (~35%) — Device info panel ── */}
          <div className="w-72 xl:w-80 flex-shrink-0 space-y-4">
            {/* Firmware update banner */}
            {device?.UpgradeAvailable === 1 && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-yellow-900/20 border border-yellow-700 rounded text-sm text-yellow-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Firmware update available.</span>
              </div>
            )}

            {device && (
              <>
                <div>
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Device Information
                  </h2>
                  <div className="card divide-y divide-surface-3 p-0 overflow-hidden">
                    {[
                      { label: 'Device Name', value: device.FriendlyName },
                      { label: 'Device ID', value: device.DeviceID },
                      { label: 'Model', value: device.ModelNumber },
                      {
                        label: 'Firmware',
                        value: device.FirmwareVersion
                          ? `${device.FirmwareVersion}${device.UpgradeAvailable === 1 ? ' ⚠ update available' : ''}`
                          : undefined,
                      },
                      { label: 'Tuner Count', value: device.TunerCount?.toString() },
                      { label: 'Base URL', value: device.BaseURL },
                    ]
                      .filter((row) => row.value != null && row.value !== '')
                      .map((row) => (
                        <div key={row.label} className="flex justify-between px-3 py-2.5 text-sm gap-2">
                          <span className="text-muted flex-shrink-0">{row.label}</span>
                          <span
                            className={`font-mono text-right break-all ${
                              row.label === 'Firmware' && device.UpgradeAvailable === 1
                                ? 'text-yellow-300'
                                : 'text-gray-100'
                            }`}
                          >
                            {row.value}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {lineupStatus && (
                  <div>
                    <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                      Lineup Status
                    </h2>
                    <div className="card divide-y divide-surface-3 p-0 overflow-hidden">
                      {[
                        { label: 'Source', value: lineupStatus.Source ?? '—' },
                        {
                          label: 'Scan Possible',
                          value: lineupStatus.ScanPossible === 1 ? 'Yes' : 'No',
                        },
                        {
                          label: 'Scan In Progress',
                          value: lineupStatus.ScanInProgress === 1 ? 'Yes' : 'No',
                        },
                      ].map((row) => (
                        <div key={row.label} className="flex justify-between px-3 py-2.5 text-sm">
                          <span className="text-muted">{row.label}</span>
                          <span className="font-mono text-gray-100">{row.value}</span>
                        </div>
                      ))}
                      {lineupStatus.SourceList && lineupStatus.SourceList.length > 0 && (
                        <div className="flex justify-between px-3 py-2.5 text-sm gap-2">
                          <span className="text-muted flex-shrink-0">Sources</span>
                          <span className="text-gray-100 text-right">{lineupStatus.SourceList.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Single-channel video overlay */}
      {activeChannel && (
        <VideoOverlay
          channel={activeChannel}
          hdhr={hdhr}
          guideMap={guideMap}
          muteByDefault={device?.mute_by_default ?? false}
          onClose={() => setActiveChannel(null)}
        />
      )}

      {/* Multi-channel video overlay */}
      {activeMultiChannels && (
        <MultiVideoOverlay
          channels={activeMultiChannels}
          hdhr={hdhr}
          guideMap={guideMap}
          muteByDefault={device?.mute_by_default ?? false}
          onClose={() => setActiveMultiChannels(null)}
        />
      )}
    </div>
  )
}
