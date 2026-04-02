import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import {
  RefreshCw, Film, Database, Activity, Users, Settings,
  Play, Pause, StopCircle, ExternalLink, AlertCircle, Trash2,
  RotateCcw, CheckCircle, Loader2, X, Info, Star, Clock, Calendar,
  Tv, Music, Image
} from 'lucide-react'
import { getViewState, setViewState } from '../../store/viewStateStore'

type Tab = 'dashboard' | 'library' | 'health' | 'users'

interface PlexSession {
  Session: { id: string; bandwidth?: number; location?: string }
  User: { title: string; thumb?: string }
  Player: { title: string; state: string; platform?: string; product?: string }
  title: string
  type: string
  year?: number
  thumb?: string
  duration?: number
  viewOffset?: number
  TranscodeSession?: {
    videoDecision?: string
    audioDecision?: string
    protocol?: string
    speed?: number
  }
}

interface PlexLibrary {
  key: string
  title: string
  type: string
  count: number
  art?: string
  thumb?: string
  scannedAt?: number
  updatedAt?: number
}

interface PlexUser {
  id: number | string
  title: string
  thumb?: string
  email?: string
  home?: boolean
  restricted?: boolean
}

export function PlexView({ instanceId = 'default' }: { instanceId?: string }) {
  const plex = api.plex(instanceId)
  const _key = `plex:${instanceId}`
  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'dashboard') as Tab)
  function setTab(t: Tab) { setViewState(`${_key}:tab`, t); setTabRaw(t) }

  // Helper to convert Plex image paths to proxy URLs
  const imageProxy = (path: string | undefined) => {
    if (!path) return undefined
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    const base = instanceId === 'default' ? '/api/plugins/plex' : `/api/plugins/plex/${instanceId}`
    return `${base}/image-proxy?path=${encodeURIComponent(path)}`
  }

  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<PlexSession[]>([])
  const [libraries, setLibraries] = useState<PlexLibrary[]>([])
  const [health, setHealth] = useState<any>(null)
  const [users, setUsers] = useState<PlexUser[]>([])
  const [recentlyAdded, setRecentlyAdded] = useState<any[]>([])
  const [onDeck, setOnDeck] = useState<any[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null)
  const [libraryItems, setLibraryItems] = useState<any[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  async function loadData() {
    setLoading(true)
    setActionError(null)
    
    try {
      const [sessionsRes, librariesRes, healthRes, usersRes, recentRes, deckRes] = await Promise.allSettled([
        plex.getSessions(),
        plex.getLibraries(),
        plex.getHealth(),
        plex.getUsers(),
        plex.getRecentlyAdded(12),
        plex.getOnDeck(12),
      ])

      if (sessionsRes.status === 'fulfilled') {
        setSessions(sessionsRes.value.sessions || [])
      }
      if (librariesRes.status === 'fulfilled') {
        const libs = librariesRes.value.libraries || []
        setLibraries(libs)
      }
      if (healthRes.status === 'fulfilled') {
        const h = healthRes.value as Record<string, any>
        setHealth({
          version: h.version ?? h.serverVersion ?? '',
          platform: h.platform ?? h.platform_name ?? '',
          platform_version: h.platform_version ?? h.platformVersion ?? '',
          transcoder_active_sessions: h.transcoder_active_sessions ?? h.transcoderActiveVideoSessions ?? 0,
          allow_camera_upload: h.allow_camera_upload ?? h.allowCameraUpload ?? false,
          allow_sync: h.allow_sync ?? h.allowSync ?? false,
        })
      }
      if (usersRes.status === 'fulfilled') {
        const rawUsers = usersRes.value.users || []
        const normalizedUsers = rawUsers.map((u: any, idx: number) => ({
          id: u.id ?? u.accountID ?? u.uuid ?? `user-${idx}`,
          title: u.title ?? u.username ?? u.name ?? u.email ?? 'Unknown User',
          thumb: u.thumb,
          email: u.email ?? u.username,
          home: Boolean(u.home ?? u.homeUser ?? u.isHomeUser),
          restricted: Boolean(u.restricted ?? u.isManaged ?? u.restrictedProfile),
        }))
        setUsers(normalizedUsers)
      }
      if (recentRes.status === 'fulfilled') {
        setRecentlyAdded(recentRes.value.items || [])
      }
      if (deckRes.status === 'fulfilled') {
        setOnDeck(deckRes.value.items || [])
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // Auto-refresh sessions every 15 seconds when on dashboard tab
    if (tab === 'dashboard') {
      const interval = setInterval(() => {
        plex.getSessions().then((r) => setSessions(r.sessions || [])).catch(() => {})
      }, 15000)
      return () => clearInterval(interval)
    }
  }, [tab])

  async function sessionAction(sessionId: string, action: 'pause' | 'resume' | 'stop') {
    setActionLoading(sessionId)
    try {
      if (action === 'pause') await plex.pauseSession(sessionId)
      else if (action === 'resume') await plex.resumeSession(sessionId)
      else await plex.stopSession(sessionId)
      
      await new Promise((r) => setTimeout(r, 500))
      const res = await plex.getSessions()
      setSessions(res.sessions || [])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function terminateSession(sessionId: string) {
    if (!confirm('Terminate this stream?')) return
    setActionLoading(sessionId)
    try {
      await plex.terminateSession(sessionId)
      const res = await plex.getSessions()
      setSessions(res.sessions || [])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Terminate failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function libraryAction(libraryId: string, action: 'scan' | 'refresh') {
    const key = `${libraryId}-${action}`
    setActionLoading(key)
    try {
      if (action === 'scan') {
        await plex.scanLibrary(libraryId)
      } else {
        await plex.refreshLibrary(libraryId)
      }
      
      await new Promise((r) => setTimeout(r, 1000))
      const res = await plex.getLibraries()
      setLibraries(res.libraries || [])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Library action failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function loadLibraryItems(libraryId: string) {
    setSelectedLibrary(libraryId)
    setItemsLoading(true)
    try {
      const res = await plex.getLibraryItems(libraryId, 0, 50)
      setLibraryItems(res.items || [])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setItemsLoading(false)
    }
  }

  async function refreshItem(ratingKey: string) {
    setActionLoading(ratingKey)
    try {
      await plex.refreshItem(ratingKey)
      // Reload library items
      if (selectedLibrary) {
        const res = await plex.getLibraryItems(selectedLibrary, 0, 50)
        setLibraryItems(res.items || [])
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function deleteItem(ratingKey: string, title: string) {
    if (!confirm(`Delete "${title}" and its files?`)) return
    setActionLoading(ratingKey)
    try {
      await plex.deleteItem(ratingKey)
      // Reload library items
      if (selectedLibrary) {
        const res = await plex.getLibraryItems(selectedLibrary, 0, 50)
        setLibraryItems(res.items || [])
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setActionLoading(null)
    }
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'library', label: 'Library', icon: Film },
    { id: 'health', label: 'Health', icon: Settings },
    { id: 'users', label: 'Users', icon: Users },
  ]

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Plex Media Server</h2>
        </div>
        <button onClick={loadData} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto text-danger/70 hover:text-danger">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 border-b-2 transition-colors ${
              tab === id
                ? 'border-accent text-white'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : (
        <>
          {tab === 'dashboard' && (
            <DashboardTab
              sessions={sessions}
              recentlyAdded={recentlyAdded}
              onDeck={onDeck}
              onSessionAction={sessionAction}
              onTerminate={terminateSession}
              onRefresh={refreshItem}
              onDelete={deleteItem}
              actionLoading={actionLoading}
              imageProxy={imageProxy}
              instanceId={instanceId}
            />
          )}
          {tab === 'library' && (
            <LibraryTab
              libraries={libraries}
              items={libraryItems}
              itemsLoading={itemsLoading}
              selectedLibrary={selectedLibrary}
              onSelectLibrary={loadLibraryItems}
              onBack={() => setSelectedLibrary(null)}
              onAction={libraryAction}
              onRefresh={refreshItem}
              onDelete={deleteItem}
              actionLoading={actionLoading}
              imageProxy={imageProxy}
              instanceId={instanceId}
            />
          )}
          {tab === 'health' && <HealthTab health={health} />}
          {tab === 'users' && <UsersTab users={users} imageProxy={imageProxy} />}
        </>
      )}
    </div>
  )
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({
  sessions,
  recentlyAdded,
  onDeck,
  onSessionAction,
  onTerminate,
  onRefresh,
  onDelete,
  actionLoading,
  imageProxy,
  instanceId,
}: {
  sessions: PlexSession[]
  recentlyAdded: any[]
  onDeck: any[]
  onSessionAction: (id: string, action: 'pause' | 'resume' | 'stop') => void
  onTerminate: (id: string) => void
  onRefresh: (ratingKey: string) => void
  onDelete: (ratingKey: string, title: string) => void
  actionLoading: string | null
  imageProxy: (path: string | undefined) => string | undefined
  instanceId: string
}) {
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)

  async function handleItemClick(item: any) {
    // If item is a season, fetch its episodes and show them directly
    if (item.type === 'season') {
      try {
        const plex = api.plex(instanceId)
        const episodesData = await plex.getSeasonEpisodes(item.ratingKey)
        setSelectedItem({
          ...item,
          _episodes: episodesData.episodes,
          _showSeasons: true, // Flag to show episodes view directly
        })
        setShowModal(true)
      } catch (err) {
        console.error('Failed to fetch episodes:', err)
        // Fallback to showing the season item
        setSelectedItem(item)
        setShowModal(true)
      }
    } else {
      setSelectedItem(item)
      setShowModal(true)
    }
  }

  return (
    <div className="space-y-6">
      {/* Continue Watching */}
      {onDeck.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Play className="w-5 h-5" />
            Continue Watching
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {onDeck.map((item) => (
              <div
                key={item.ratingKey}
                onClick={() => handleItemClick(item)}
                className="flex-shrink-0 w-40 bg-surface-2 rounded-lg overflow-hidden border border-border hover:border-accent transition-all cursor-pointer group"
              >
                <div className="relative">
                  {item.thumb && (
                    <img
                      src={imageProxy(item.thumb)}
                      alt={item.title}
                      className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity"
                    />
                  )}
                  {item.viewOffset && item.duration && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${Math.min(100, (item.viewOffset / item.duration) * 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-10 h-10 text-white" fill="white" />
                  </div>
                </div>
                <div className="p-2">
                  <div className="font-medium text-white text-xs line-clamp-2">{item.title}</div>
                  {item.year && <div className="text-xs text-muted">{item.year}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Added */}
      {recentlyAdded.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recently Added
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recentlyAdded.map((item) => (
              <div
                key={item.ratingKey}
                onClick={() => handleItemClick(item)}
                className="flex-shrink-0 w-40 bg-surface-2 rounded-lg overflow-hidden border border-border hover:border-accent transition-all cursor-pointer group"
              >
                <div className="relative">
                  {item.thumb && (
                    <img
                      src={imageProxy(item.thumb)}
                      alt={item.title}
                      className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-10 h-10 text-white" fill="white" />
                  </div>
                </div>
                <div className="p-2">
                  <div className="font-medium text-white text-xs line-clamp-2">{item.title}</div>
                  {item.year && <div className="text-xs text-muted">{item.year}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Now Playing
          </h3>
          <div className="space-y-3">
      {sessions.map((session) => {
        const sessionId = session.Session.id
        const user = session.User.title
        const playerName = session.Player.title
        const playerState = session.Player.state
        const title = session.title
        const year = session.year
        const progress = session.viewOffset || 0
        const duration = session.duration || 1
        const progressPercent = Math.min(100, (progress / duration) * 100)
        const transcode = session.TranscodeSession
        const isTranscoding = transcode?.videoDecision === 'transcode'
        
        const loading = actionLoading === sessionId

        return (
          <div key={sessionId} className="bg-surface-2 rounded-lg p-4 border border-border">
            <div className="flex gap-4">
              {/* Poster */}
              {session.thumb && (
                <img
                  src={imageProxy(session.thumb)}
                  alt={title}
                  className="w-20 h-28 object-cover rounded"
                />
              )}
              
              {/* Info */}
              <div className="flex-1 space-y-2">
                <div>
                  <div className="font-semibold text-white">
                    {title} {year && <span className="text-muted">({year})</span>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {user} · {playerName}
                    {session.Player.platform && ` · ${session.Player.platform}`}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">
                      {formatTime(progress)} / {formatTime(duration)}
                    </span>
                    <span className={playerState === 'playing' ? 'text-green-400' : 'text-yellow-400'}>
                      {playerState.toUpperCase()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Stream info */}
                <div className="flex items-center gap-3 text-xs">
                  {isTranscoding ? (
                    <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      Transcoding {transcode?.speed ? `(${transcode.speed.toFixed(1)}x)` : ''}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                      Direct Play
                    </span>
                  )}
                  {session.Session.bandwidth && (
                    <span className="text-muted">
                      {(session.Session.bandwidth / 1000).toFixed(1)} Mbps
                    </span>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 pt-1">
                  {playerState === 'playing' ? (
                    <button
                      onClick={() => onSessionAction(sessionId, 'pause')}
                      disabled={loading}
                      className="btn-ghost text-xs gap-1"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => onSessionAction(sessionId, 'resume')}
                      disabled={loading}
                      className="btn-ghost text-xs gap-1"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => onSessionAction(sessionId, 'stop')}
                    disabled={loading}
                    className="btn-ghost text-xs gap-1"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Stop
                  </button>
                  <button
                    onClick={() => onTerminate(sessionId)}
                    disabled={loading}
                    className="btn-ghost text-xs gap-1 text-danger hover:text-danger/80"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Terminate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sessions.length === 0 && recentlyAdded.length === 0 && onDeck.length === 0 && (
        <div className="text-center py-12 text-muted">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No activity yet</p>
        </div>
      )}

      {/* Item detail modal */}
      {selectedItem && showModal && (
        <MediaDetailModal
          item={selectedItem}
          onClose={() => setShowModal(false)}
          onRefresh={() => {}}
          onDelete={() => {}}
          imageProxy={imageProxy}
          instanceId={instanceId}
        />
      )}
    </div>
  )
}

// ── Library Tab (consolidated Libraries + Media) ──────────────────────────────

function LibraryTab({
  libraries,
  selectedLibrary,
  items,
  itemsLoading,
  onSelectLibrary,
  onBack,
  onAction,
  onRefresh,
  onDelete,
  actionLoading,
  imageProxy,
  instanceId,
}: {
  libraries: PlexLibrary[]
  selectedLibrary: string | null
  items: any[]
  itemsLoading: boolean
  onSelectLibrary: (id: string) => void
  onBack: () => void
  onAction: (id: string, action: 'scan' | 'refresh') => void
  onRefresh: (ratingKey: string) => void
  onDelete: (ratingKey: string, title: string) => void
  actionLoading: string | null
  imageProxy: (path: string | undefined) => string | undefined
  instanceId: string
}) {
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)

  function handleItemClick(item: any) {
    setSelectedItem(item)
    setShowModal(true)
  }

  if (!selectedLibrary) {
    // Show library selector with action buttons
    if (libraries.length === 0) {
      return (
        <div className="text-center py-12 text-muted">
          <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No libraries found</p>
        </div>
      )
    }

    // Sort libraries alphabetically by title
    const sortedLibraries = [...libraries].sort((a, b) => a.title.localeCompare(b.title))

    // Icon mapping by library type
    const getLibraryIcon = (type: string) => {
      switch (type) {
        case 'movie':
          return <Film className="w-12 h-12" />
        case 'show':
          return <Tv className="w-12 h-12" />
        case 'music':
          return <Music className="w-12 h-12" />
        case 'photo':
          return <Image className="w-12 h-12" />
        default:
          return <Database className="w-12 h-12" />
      }
    }

    // Color mapping by library type
    const getLibraryColor = (type: string) => {
      switch (type) {
        case 'movie':
          return 'from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-400'
        case 'show':
          return 'from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-400'
        case 'music':
          return 'from-pink-500/20 to-pink-600/10 border-pink-500/30 hover:border-pink-400'
        case 'photo':
          return 'from-green-500/20 to-green-600/10 border-green-500/30 hover:border-green-400'
        default:
          return 'from-gray-500/20 to-gray-600/10 border-gray-500/30 hover:border-gray-400'
      }
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Select a library to browse:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedLibraries.map((lib) => {
            const libId = lib.key.split('/').pop() || lib.key
            const scanLoading = actionLoading === `${libId}-scan`
            const refreshLoading = actionLoading === `${libId}-refresh`

            return (
              <div
                key={lib.key}
                onClick={() => onSelectLibrary(libId)}
                className={`bg-gradient-to-br ${getLibraryColor(lib.type)} rounded-lg border transition-all cursor-pointer overflow-hidden group relative`}
              >
                {/* Background artwork if available */}
                {lib.art && (
                  <div className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity">
                    <img
                      src={imageProxy(lib.art)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="relative p-5 space-y-4">
                  {/* Icon and Title */}
                  <div className="flex items-center gap-4">
                    <div className="text-white/80 group-hover:text-white transition-colors">
                      {getLibraryIcon(lib.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-lg truncate">
                        {lib.title}
                      </div>
                      <div className="text-sm text-muted/80 capitalize">
                        {lib.type === 'show' ? 'TV Shows' : lib.type}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-white/90">
                      <Database className="w-4 h-4" />
                      <span className="font-mono font-semibold">
                        {(lib.count ?? 0).toLocaleString()}
                      </span>
                      <span className="text-muted/80">items</span>
                    </div>
                    {lib.scannedAt && (
                      <div className="text-xs text-muted/70">
                        {new Date(lib.scannedAt * 1000).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onAction(libId, 'scan')}
                      disabled={scanLoading || refreshLoading}
                      className="btn-ghost text-xs gap-1 flex-1"
                    >
                      {scanLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Scan
                    </button>
                    <button
                      onClick={() => onAction(libId, 'refresh')}
                      disabled={scanLoading || refreshLoading}
                      className="btn-ghost text-xs gap-1 flex-1"
                    >
                      {refreshLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Show library items
  const currentLib = libraries.find((l) => l.key.endsWith(selectedLibrary))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="btn-ghost text-xs gap-1">
            ← Back
          </button>
          <span className="text-sm text-white font-semibold">
            {currentLib?.title || 'Library Items'}
          </span>
        </div>
      </div>

      {itemsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No items in this library</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item) => (
            <div
              key={item.ratingKey}
              className="bg-surface-2 rounded-lg overflow-hidden border border-border hover:border-accent transition-all cursor-pointer group"
              onClick={() => handleItemClick(item)}
            >
              <div className="relative">
                {item.thumb && (
                  <img
                    src={imageProxy(item.thumb)}
                    alt={item.title}
                    className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-12 h-12 text-white" fill="white" />
                </div>
              </div>
              <div className="p-3">
                <div className="font-semibold text-white text-sm line-clamp-2">
                  {item.title}
                </div>
                <div className="text-xs text-muted mt-1">
                  {item.type === 'show' && `${item.childCount || 0} seasons`}
                  {item.type === 'season' && `${item.leafCount || 0} episodes`}
                  {(item.type === 'movie' || item.type === 'episode') && (item.year || 'Unknown year')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && selectedItem && (
        <MediaDetailModal
          item={selectedItem}
          onClose={() => {
            setShowModal(false)
            setSelectedItem(null)
          }}
          onRefresh={() => {
            onRefresh(selectedItem.ratingKey)
            setShowModal(false)
            setSelectedItem(null)
          }}
          onDelete={() => {
            onDelete(selectedItem.ratingKey, selectedItem.title)
            setShowModal(false)
            setSelectedItem(null)
          }}
          imageProxy={imageProxy}
          instanceId={instanceId}
        />
      )}
    </div>
  )
}

// ── Media Detail Modal ────────────────────────────────────────────────────────

function MediaDetailModal({
  item,
  onClose,
  onRefresh,
  onDelete,
  imageProxy,
  instanceId,
}: {
  item: any
  onClose: () => void
  onRefresh: () => void
  onDelete: () => void
  imageProxy: (path: string | undefined) => string | undefined
  instanceId: string
}) {
  const plex = api.plex(instanceId)
  const [view, setView] = useState<'info' | 'seasons' | 'episodes'>(
    item._showSeasons ? 'episodes' : 'info'
  )
  const [seasons, setSeasons] = useState<any[]>([])
  const [episodes, setEpisodes] = useState<any[]>(item._episodes || [])
  const [selectedSeason, setSelectedSeason] = useState<any>(item.type === 'season' ? item : null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)

  // Load seasons if this is a TV show (and not pre-loaded)
  useEffect(() => {
    if (item.type === 'show' && !item._showSeasons) {
      setLoading(true)
      plex.getShowSeasons(item.ratingKey)
        .then((res) => setSeasons(res.seasons || []))
        .finally(() => setLoading(false))
    }
  }, [item.ratingKey, item.type])

  // Load episodes when a season is selected
  function selectSeason(season: any) {
    setSelectedSeason(season)
    setView('episodes')
    setLoading(true)
    plex.getSeasonEpisodes(season.ratingKey)
      .then((res) => setEpisodes(res.episodes || []))
      .finally(() => setLoading(false))
  }

  async function handlePlay() {
    try {
      setPlaying(true)
      const res = await plex.playItem(item.ratingKey)
      if (res.play_url) {
        window.open(res.play_url, '_blank')
      }
    } catch (err) {
      alert('Failed to start playback')
    } finally {
      setPlaying(false)
    }
  }

  const isPlayable = item.type === 'movie' || item.type === 'episode'

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header with backdrop */}
        <div className="relative h-64 bg-surface-3">
          {item.art && (
            <img
              src={imageProxy(item.art)}
              alt={item.title}
              className="w-full h-full object-cover opacity-50"
            />
          )}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 btn-ghost p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title and primary info */}
          <div className="flex gap-6">
            {item.thumb && (
              <img
                src={imageProxy(item.thumb)}
                alt={item.title}
                className="w-40 rounded-lg shadow-lg"
              />
            )}
            
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold text-white">{item.title}</h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-muted">
                  {item.year && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {item.year}
                    </div>
                  )}
                  {item.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      {item.rating.toFixed(1)}
                    </div>
                  )}
                  {item.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {Math.floor(item.duration / 60000)}m
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              {item.summary && (
                <p className="text-sm text-muted leading-relaxed line-clamp-4">
                  {item.summary}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                {item.type === 'show' && (
                  <button
                    onClick={() => setView(view === 'seasons' ? 'info' : 'seasons')}
                    className="btn-primary gap-2"
                  >
                    <Database className="w-4 h-4" />
                    {view === 'seasons' ? 'Back to Info' : 'View Seasons'}
                  </button>
                )}
                {isPlayable && (
                  <button
                    onClick={handlePlay}
                    disabled={playing}
                    className="btn-primary gap-2"
                  >
                    {playing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" fill="currentColor" />
                    )}
                    Play
                  </button>
                )}
                <button onClick={onRefresh} className="btn-ghost gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Refresh
                </button>
                <button onClick={onDelete} className="btn-ghost gap-2 text-danger">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>

          {/* TV Show: Seasons or Episodes grid */}
          {item.type === 'show' && view === 'seasons' && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Seasons</h3>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted" />
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {seasons.map((season) => (
                    <div
                      key={season.ratingKey}
                      className="bg-surface-2 rounded-lg overflow-hidden border border-border hover:border-accent transition-all cursor-pointer"
                      onClick={() => selectSeason(season)}
                    >
                      {season.thumb && (
                        <img
                          src={imageProxy(season.thumb)}
                          alt={season.title}
                          className="w-full aspect-[2/3] object-cover"
                        />
                      )}
                      <div className="p-2">
                        <div className="text-xs font-semibold text-white truncate">
                          {season.title}
                        </div>
                        <div className="text-[10px] text-muted">
                          {season.leafCount || 0} episodes
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'episodes' && selectedSeason && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => {
                    setView('seasons')
                    setSelectedSeason(null)
                  }}
                  className="btn-ghost text-xs"
                >
                  ← Back to Seasons
                </button>
                <h3 className="text-lg font-semibold text-white">
                  {selectedSeason.title}
                </h3>
              </div>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted" />
                </div>
              ) : (
                <div className="space-y-2">
                  {episodes.map((episode) => (
                    <div
                      key={episode.ratingKey}
                      className="bg-surface-2 rounded-lg p-3 border border-border hover:border-accent transition-all cursor-pointer flex gap-4"
                      onClick={async () => {
                        try {
                          const res = await plex.playItem(episode.ratingKey)
                          if (res.play_url) window.open(res.play_url, '_blank')
                        } catch (err) {
                          alert('Failed to play episode')
                        }
                      }}
                    >
                      {episode.thumb && (
                        <img
                          src={imageProxy(episode.thumb)}
                          alt={episode.title}
                          className="w-40 rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-white">
                              {episode.index}. {episode.title}
                            </div>
                            <div className="text-xs text-muted mt-1">
                              {episode.duration && `${Math.floor(episode.duration / 60000)}m`}
                              {episode.originallyAvailableAt && ` • ${new Date(episode.originallyAvailableAt).toLocaleDateString()}`}
                            </div>
                          </div>
                          <Play className="w-5 h-5 text-accent shrink-0" />
                        </div>
                        {episode.summary && (
                          <p className="text-xs text-muted mt-2 line-clamp-2">
                            {episode.summary}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metadata grid (shown in info view) */}
          {view === 'info' && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {item.contentRating && (
                <div>
                  <div className="text-muted text-xs">Rating</div>
                  <div className="text-white">{item.contentRating}</div>
                </div>
              )}
              {item.studio && (
                <div>
                  <div className="text-muted text-xs">Studio</div>
                  <div className="text-white">{item.studio}</div>
                </div>
              )}
              {item.originallyAvailableAt && (
                <div>
                  <div className="text-muted text-xs">Released</div>
                  <div className="text-white">
                    {new Date(item.originallyAvailableAt).toLocaleDateString()}
                  </div>
                </div>
              )}
              {item.addedAt && (
                <div>
                  <div className="text-muted text-xs">Added</div>
                  <div className="text-white">
                    {new Date(item.addedAt * 1000).toLocaleDateString()}
                  </div>
                </div>
              )}
              {item.Genre && item.Genre.length > 0 && (
                <div className="col-span-2">
                  <div className="text-muted text-xs mb-1">Genres</div>
                  <div className="flex flex-wrap gap-1">
                    {item.Genre.map((g: any, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-surface-3 rounded text-xs">
                        {g.tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {item.Role && item.Role.length > 0 && (
                <div className="col-span-2">
                  <div className="text-muted text-xs mb-1">Cast</div>
                  <div className="text-white text-xs">
                    {item.Role.slice(0, 5).map((r: any) => r.tag).join(', ')}
                  </div>
                </div>
              )}
              {item.Director && item.Director.length > 0 && (
                <div>
                  <div className="text-muted text-xs">Director</div>
                  <div className="text-white">
                    {item.Director.map((d: any) => d.tag).join(', ')}
                  </div>
                </div>
              )}
              {item.Writer && item.Writer.length > 0 && (
                <div>
                  <div className="text-muted text-xs">Writer</div>
                  <div className="text-white">
                    {item.Writer.map((w: any) => w.tag).join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Health Tab ────────────────────────────────────────────────────────────────

function HealthTab({ health }: { health: any }) {
  if (!health) {
    return (
      <div className="text-center py-12 text-muted">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Health data unavailable</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <StatCard label="Server Version" value={health.version || 'Unknown'} />
      <StatCard label="Platform" value={health.platform || 'Unknown'} />
      <StatCard label="Platform Version" value={health.platform_version || 'Unknown'} />
      <StatCard
        label="Active Transcodes"
        value={health.transcoder_active_sessions ?? 0}
        highlight={(health.transcoder_active_sessions ?? 0) > 0}
      />
      <StatCard
        label="Camera Upload"
        value={health.allow_camera_upload ? 'Enabled' : 'Disabled'}
      />
      <StatCard
        label="Sync"
        value={health.allow_sync ? 'Enabled' : 'Disabled'}
      />
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`font-semibold ${highlight ? 'text-accent' : 'text-white'}`}>
        {value}
      </div>
    </div>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ users, imageProxy }: { users: PlexUser[]; imageProxy: (path: string | undefined) => string | undefined }) {
  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No users found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {users.map((user) => (
        <div key={user.id} className="bg-surface-2 rounded-lg p-4 border border-border flex items-center gap-4">
          {user.thumb ? (
            <img src={imageProxy(user.thumb)} alt={user.title} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface-3 border border-border flex items-center justify-center">
              <Users className="w-5 h-5 text-muted" />
            </div>
          )}
          <div className="flex-1">
            <div className="font-semibold text-white">{user.title || 'Unknown User'}</div>
            {user.email && <div className="text-xs text-muted">{user.email}</div>}
          </div>
          <div className="flex gap-2">
            {user.home && (
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs border border-blue-500/30">
                Home User
              </span>
            )}
            {user.restricted && (
              <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs border border-yellow-500/30">
                Restricted
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}
