import { useEffect, useRef, useState } from 'react'
import { api, DockerContainer, DockerImage, DockerInfo, DockerEvent, DockerStats } from '../../api/client'
import {
  RefreshCw, Loader2, AlertCircle, Play, Square, RotateCcw,
  ScrollText, X, Container, HardDrive, Terminal, LayoutDashboard,
  Cpu, MemoryStick, Network, Clock, Activity, Filter,
} from 'lucide-react'
import { getViewState, setViewState } from '../../store/viewStateStore'

type Tab = 'overview' | 'containers' | 'images'

const SHELL_CANDIDATES = ['/bin/sh', '/bin/bash', '/bin/ash', '/usr/bin/sh', '/usr/bin/bash']

export function DockerView({ instanceId = 'default' }: { instanceId?: string }) {
  const docker = api.docker(instanceId)
  const _key = `docker:${instanceId}`
  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'overview') as Tab)
  function setTab(t: Tab) { setViewState(`${_key}:tab`, t); setTabRaw(t) }

  // Overview
  const [info, setInfo] = useState<DockerInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoLoaded, setInfoLoaded] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [events, setEvents] = useState<DockerEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [containersLoading, setContainersLoading] = useState(false)
  const [containersLoaded, setContainersLoaded] = useState(false)
  const [containersError, setContainersError] = useState<string | null>(null)

  const [images, setImages] = useState<DockerImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [imagesError, setImagesError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Container detail modal
  const [detailContainer, setDetailContainer] = useState<DockerContainer | null>(null)
  const [detailStats, setDetailStats] = useState<DockerStats | null>(null)
  const [detailStatsLoading, setDetailStatsLoading] = useState(false)
  const [detailLogs, setDetailLogs] = useState<string>('')
  const [detailLogsLoading, setDetailLogsLoading] = useState(false)

  // Logs modal
  const [logsContainer, setLogsContainer] = useState<DockerContainer | null>(null)
  const [logsLines, setLogsLines] = useState<string[]>([])
  const [logsFilter, setLogsFilter] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLive, setLogsLive] = useState(false)
  const logsWsRef = useRef<WebSocket | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Shell modal
  const [shellContainer, setShellContainer] = useState<DockerContainer | null>(null)

  async function loadOverview() {
    setInfoLoading(true); setEventsLoading(true); setInfoError(null)
    try {
      const [infoData, eventsData] = await Promise.all([docker.info(), docker.events()])
      setInfo(infoData)
      setEvents(eventsData.events ?? [])
      setInfoLoaded(true)
    } catch (e: unknown) {
      setInfoError(e instanceof Error ? e.message : 'Failed to load Docker info')
    } finally { setInfoLoading(false); setEventsLoading(false) }
  }

  async function loadContainers() {
    setContainersLoading(true); setContainersError(null)
    try {
      const data = await docker.containers()
      setContainers(data.containers)
      setContainersLoaded(true)
    } catch (e: unknown) {
      setContainersError(e instanceof Error ? e.message : 'Failed to load containers')
    } finally { setContainersLoading(false) }
  }

  async function loadImages() {
    setImagesLoading(true); setImagesError(null)
    try {
      const data = await docker.images()
      setImages([...data.images].sort((a, b) => b.created - a.created))
      setImagesLoaded(true)
    } catch (e: unknown) {
      setImagesError(e instanceof Error ? e.message : 'Failed to load images')
    } finally { setImagesLoading(false) }
  }

  useEffect(() => { loadOverview() }, [])

  useEffect(() => {
    if (tab === 'overview' && !infoLoaded && !infoLoading) loadOverview()
    else if (tab === 'containers' && !containersLoaded && !containersLoading) loadContainers()
    else if (tab === 'images' && !imagesLoaded && !imagesLoading) loadImages()
  }, [tab])

  // Cleanup live log WebSocket on unmount or close
  useEffect(() => {
    return () => { logsWsRef.current?.close() }
  }, [])

  function refresh() {
    if (tab === 'overview') { setInfoLoaded(false); loadOverview() }
    else if (tab === 'containers') loadContainers()
    else { setImagesLoaded(false); loadImages() }
  }

  async function containerAction(action: 'start' | 'stop' | 'restart', container: DockerContainer) {
    const key = `${action}:${container.id}`
    setActionLoading(key); setActionError(null)
    try {
      await docker[action](container.full_id)
      await loadContainers()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : `${action} failed`)
    } finally { setActionLoading(null) }
  }

  async function openDetail(container: DockerContainer) {
    setDetailContainer(container)
    setDetailStats(null); setDetailLogs('')
    setDetailStatsLoading(true); setDetailLogsLoading(true)
    try {
      const stats = await docker.stats(container.full_id)
      setDetailStats(stats)
    } catch { /* stats optional */ }
    finally { setDetailStatsLoading(false) }
    try {
      const txt = await docker.logs(container.full_id, 50)
      setDetailLogs(txt)
    } catch { /* logs optional */ }
    finally { setDetailLogsLoading(false) }
  }

  async function openLogs(container: DockerContainer) {
    logsWsRef.current?.close(); logsWsRef.current = null
    setLogsContainer(container); setLogsLines([]); setLogsFilter(''); setLogsError(null); setLogsLive(false); setLogsLoading(true)
    try {
      const text = await docker.logs(container.full_id, 500)
      setLogsLines(text.split('\n').filter(Boolean))
    } catch (e: unknown) {
      setLogsError(e instanceof Error ? e.message : 'Failed to load logs')
    } finally { setLogsLoading(false) }
  }

  function startLiveLogs(container: DockerContainer) {
    logsWsRef.current?.close()
    setLogsLines([]); setLogsLive(true)
    const ws = new WebSocket(docker.logsWsUrl(container.full_id))
    logsWsRef.current = ws
    ws.onmessage = (ev) => {
      const lines = (ev.data as string).split('\n').filter(Boolean)
      setLogsLines((prev) => {
        const next = [...prev, ...lines]
        return next.length > 2000 ? next.slice(-2000) : next
      })
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    }
    ws.onerror = () => setLogsError('Live stream error')
    ws.onclose = () => setLogsLive(false)
  }

  function stopLiveLogs() {
    logsWsRef.current?.close(); logsWsRef.current = null
    setLogsLive(false)
  }

  function closeLogs() {
    stopLiveLogs(); setLogsContainer(null)
  }

  function openShell(container: DockerContainer) {
    setShellContainer(container)
  }

  const running = containers.filter((c) => c.state === 'running').length
  const isLoading = containersLoading || imagesLoading || infoLoading

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',   label: 'Overview',   icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'containers', label: 'Containers', icon: <Container       className="w-3.5 h-3.5" /> },
    { id: 'images',     label: 'Images',     icon: <HardDrive       className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Container className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Docker</h2>
          {!containersLoading && tab === 'containers' && (
            <span className="text-xs text-muted">
              <span className="text-green-400 font-semibold">{running}</span>
              <span className="mx-1">/</span>
              <span>{containers.length}</span>
              <span className="ml-1">running</span>
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={isLoading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        infoError ? <ErrorBanner msg={infoError} /> :
        infoLoading ? <LoadingSpinner /> :
        info ? (
          <div className="space-y-4">
            {/* Host info */}
            <div className="card grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
              <InfoStat icon={<Activity className="w-4 h-4 text-accent" />} label="Docker" value={`v${info.server_version}`} />
              <InfoStat icon={<Container className="w-4 h-4 text-muted" />} label="Host" value={info.name || '—'} />
              <InfoStat icon={<Cpu className="w-4 h-4 text-muted" />} label="CPUs" value={String(info.cpus)} />
              <InfoStat icon={<MemoryStick className="w-4 h-4 text-muted" />} label="Memory" value={fmtBytes(info.mem_total)} />
              <InfoStat icon={<HardDrive className="w-4 h-4 text-muted" />} label="OS" value={info.os} />
              <InfoStat icon={<Activity className="w-4 h-4 text-muted" />} label="Kernel" value={info.kernel} />
              <InfoStat icon={<HardDrive className="w-4 h-4 text-muted" />} label="Storage Driver" value={info.storage_driver} />
              <InfoStat icon={<HardDrive className="w-4 h-4 text-muted" />} label="Arch" value={info.arch} />
            </div>

            {/* Container counts */}
            <div className="grid grid-cols-4 gap-3">
              <div className="card p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{info.containers_running}</div>
                <div className="text-xs text-muted mt-1">Running</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-2xl font-bold text-yellow-400">{info.containers_paused}</div>
                <div className="text-xs text-muted mt-1">Paused</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-2xl font-bold text-muted">{info.containers_stopped}</div>
                <div className="text-xs text-muted mt-1">Stopped</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-2xl font-bold text-gray-300">{info.images}</div>
                <div className="text-xs text-muted mt-1">Images</div>
              </div>
            </div>

            {/* Recent events */}
            <div className="card overflow-x-auto">
              <div className="px-3 py-2 border-b border-surface-4 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs font-medium text-muted uppercase tracking-wider">Recent Events (last hour)</span>
                {eventsLoading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
              </div>
              {events.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted">No events in the last hour.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-surface-4 text-muted">
                    <th className="px-3 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                  </tr></thead>
                  <tbody>
                    {events.map((ev, i) => (
                      <tr key={i} className="border-b border-surface-4/40 hover:bg-surface-3/30">
                        <td className="px-3 py-1.5 text-muted whitespace-nowrap">{new Date(ev.time * 1000).toLocaleTimeString()}</td>
                        <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3 text-gray-400">{ev.Type}</span></td>
                        <td className="px-3 py-1.5 font-mono text-accent">{ev.Action}</td>
                        <td className="px-3 py-1.5 text-gray-300 truncate max-w-[240px]">{ev.Actor?.Attributes?.name || ev.Actor?.ID?.slice(0, 12) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null
      )}

      {/* Containers tab */}
      {tab === 'containers' && (
        containersError ? <ErrorBanner msg={containersError} /> :
        containersLoading ? <LoadingSpinner /> :
        containers.length === 0 ? (
          <div className="text-sm text-muted text-center py-12">No containers found.</div>
        ) : (
          <div className="space-y-2">
            {actionError && <ErrorBanner msg={actionError} />}
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-4 text-muted">
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Image</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Ports</th>
                    <th className="px-3 py-2 text-left font-medium">Created</th>
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...containers]
                    .sort((a, b) => {
                      if (a.state === 'running' && b.state !== 'running') return -1
                      if (b.state === 'running' && a.state !== 'running') return 1
                      return (a.names[0] ?? '').localeCompare(b.names[0] ?? '')
                    })
                    .map((c) => (
                      <ContainerRow
                        key={c.id}
                        container={c}
                        actionLoading={actionLoading}
                        onAction={containerAction}
                        onLogs={openLogs}
                        onShell={openShell}
                        onDetail={openDetail}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Images tab */}
      {tab === 'images' && (
        imagesError ? <ErrorBanner msg={imagesError} /> :
        imagesLoading ? <LoadingSpinner /> :
        images.length === 0 ? (
          <div className="text-sm text-muted text-center py-12">No images found.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  <th className="px-3 py-2 text-left font-medium">Repository</th>
                  <th className="px-3 py-2 text-left font-medium">Tag</th>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-right font-medium">Size</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img) => {
                  const [repo, tag] = (img.repo_tags[0] ?? '<none>:<none>').split(':')
                  return (
                    <tr key={img.id} className="border-b border-surface-4/50 hover:bg-surface-3/30">
                      <td className="px-3 py-2 font-mono text-gray-300">{repo}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          tag === 'latest' ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-muted'
                        }`}>{tag ?? 'latest'}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted">{img.id}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(img.size)}</td>
                      <td className="px-3 py-2 text-muted">{fmtAge(img.created)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Shell modal */}
      {shellContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-5xl mx-4 flex flex-col" style={{ height: '70vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-muted" />
                <span className="font-semibold text-sm text-white">{shellContainer.names[0] ?? shellContainer.id}</span>
                <span className="text-muted text-xs">— interactive shell</span>
              </div>
              <button onClick={() => setShellContainer(null)} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ShellTerminal
                wsUrlFn={(cmd) => docker.execWsUrl(shellContainer.full_id, cmd)}
                onClose={() => setShellContainer(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Container detail modal */}
      {detailContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setDetailContainer(null)}>
          <div className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4">
              <div className="flex items-center gap-2">
                <Container className="w-4 h-4 text-muted" />
                <span className="font-semibold text-sm text-white">{detailContainer.names[0] ?? detailContainer.id}</span>
                <StateBadge state={detailContainer.state} status={detailContainer.status} />
              </div>
              <button onClick={() => setDetailContainer(null)} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted">Image: </span><span className="font-mono text-gray-300">{detailContainer.image}</span></div>
                <div><span className="text-muted">ID: </span><span className="font-mono text-gray-300">{detailContainer.id}</span></div>
                <div><span className="text-muted">Created: </span><span className="text-gray-300">{fmtAge(detailContainer.created)}</span></div>
                <div><span className="text-muted">Command: </span><span className="font-mono text-gray-300 truncate">{detailContainer.command || '—'}</span></div>
              </div>

              {/* Stats */}
              <div>
                <div className="text-[10px] text-muted/70 uppercase tracking-wider mb-2">Resource Usage</div>
                {detailStatsLoading ? (
                  <div className="flex gap-2 items-center text-muted text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading stats…</div>
                ) : detailStats ? (
                  <div className="grid grid-cols-3 gap-3">
                    <ResourceBar icon={<Cpu className="w-3.5 h-3.5" />} label="CPU" pct={detailStats.cpu_pct} valueStr={`${detailStats.cpu_pct.toFixed(1)}%`} />
                    <ResourceBar icon={<MemoryStick className="w-3.5 h-3.5" />} label="Memory" pct={detailStats.mem_pct} valueStr={`${fmtBytes(detailStats.mem_usage)} / ${fmtBytes(detailStats.mem_limit)}`} />
                    <div className="card p-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted mb-1"><Network className="w-3.5 h-3.5" />Network I/O</div>
                      <div className="text-gray-300">↓ {fmtBytes(detailStats.net_rx)}</div>
                      <div className="text-gray-300">↑ {fmtBytes(detailStats.net_tx)}</div>
                    </div>
                  </div>
                ) : detailContainer.state !== 'running' ? (
                  <div className="text-xs text-muted">Stats only available for running containers.</div>
                ) : (
                  <div className="text-xs text-muted">Stats unavailable.</div>
                )}
              </div>

              {/* Recent logs */}
              <div>
                <div className="text-[10px] text-muted/70 uppercase tracking-wider mb-2">Recent Logs (last 50 lines)</div>
                {detailLogsLoading ? (
                  <div className="flex gap-2 items-center text-muted text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading logs…</div>
                ) : detailLogs ? (
                  <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all leading-relaxed bg-surface-1 rounded p-2 max-h-40 overflow-y-auto">{detailLogs || '(no output)'}</pre>
                ) : (
                  <div className="text-xs text-muted">No logs.</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-surface-4">
              <button className="btn-ghost text-xs gap-1.5" onClick={() => { setDetailContainer(null); openLogs(detailContainer) }}>
                <ScrollText className="w-3.5 h-3.5" />Full Logs
              </button>
              <button className="btn-ghost text-xs" onClick={() => setDetailContainer(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Logs modal */}
      {logsContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={closeLogs}>
          <div className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-4xl mx-4 flex flex-col" style={{ maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-muted" />
                <span className="font-semibold text-sm text-white">{logsContainer.names[0] ?? logsContainer.id}</span>
                {logsLive && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Live</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${logsLive ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'btn-ghost'}`}
                  onClick={() => logsLive ? stopLiveLogs() : startLiveLogs(logsContainer)}
                >
                  <Activity className="w-3.5 h-3.5" />{logsLive ? 'Stop Live' : 'Live Tail'}
                </button>
                <button onClick={closeLogs} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
              </div>
            </div>
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-4 bg-surface-1/50">
              <Filter className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <input
                className="input flex-1 text-xs h-7 py-1"
                placeholder="Filter lines…"
                value={logsFilter}
                onChange={(e) => setLogsFilter(e.target.value)}
              />
              {logsFilter && (
                <button className="text-muted hover:text-gray-300" onClick={() => setLogsFilter('')}><X className="w-3.5 h-3.5" /></button>
              )}
              <span className="text-[10px] text-muted whitespace-nowrap">
                {logsFilter
                  ? `${logsLines.filter((l) => l.toLowerCase().includes(logsFilter.toLowerCase())).length} / ${logsLines.length}`
                  : `${logsLines.length} lines`}
              </span>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {logsLoading ? (
                <div className="flex items-center gap-2 text-muted text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading logs…</div>
              ) : logsError ? (
                <ErrorBanner msg={logsError} />
              ) : (
                <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all leading-relaxed">
                  {(logsFilter
                    ? logsLines.filter((l) => l.toLowerCase().includes(logsFilter.toLowerCase()))
                    : logsLines
                  ).map((line, i) => {
                    const lc = line.toLowerCase()
                    const cls = lc.includes('error') || lc.includes('err ') || lc.includes('fatal') ? 'text-red-400' :
                                lc.includes('warn') ? 'text-yellow-400' : undefined
                    return <span key={i} className={cls}>{line}{'\n'}</span>
                  })}
                  {logsLines.length === 0 && !logsLive && <span className="text-muted">(no output)</span>}
                  <div ref={logsEndRef} />
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContainerRow({ container: c, actionLoading, onAction, onLogs, onShell, onDetail }: {
  container: DockerContainer
  actionLoading: string | null
  onAction: (action: 'start' | 'stop' | 'restart', c: DockerContainer) => void
  onLogs: (c: DockerContainer) => void
  onShell: (c: DockerContainer) => void
  onDetail: (c: DockerContainer) => void
}) {
  const name = c.names[0] ?? c.id
  const isRunning = c.state === 'running'
  const loading = (key: string) => actionLoading === `${key}:${c.id}`

  const portStr = c.ports
    .filter((p) => p.public_port)
    .map((p) => `${p.public_port}→${p.private_port}`)
    .join(', ')

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2">
        <button className="font-medium text-gray-200 hover:text-accent transition-colors text-left" onClick={() => onDetail(c)}>{name}</button>
        <div className="font-mono text-[10px] text-muted">{c.id}</div>
      </td>
      <td className="px-3 py-2 font-mono text-muted max-w-[200px] truncate" title={c.image}>{c.image}</td>
      <td className="px-3 py-2">
        <StateBadge state={c.state} status={c.status} />
      </td>
      <td className="px-3 py-2 font-mono text-muted text-[11px]">{portStr || '—'}</td>
      <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(c.created)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          {!isRunning && (
            <ActionBtn title="Start" onClick={() => onAction('start', c)} loading={loading('start')} icon={<Play className="w-3.5 h-3.5" />} hoverColor="hover:text-green-400" />
          )}
          {isRunning && (
            <ActionBtn title="Stop" onClick={() => onAction('stop', c)} loading={loading('stop')} icon={<Square className="w-3.5 h-3.5" />} hoverColor="hover:text-danger" />
          )}
          <ActionBtn title="Restart" onClick={() => onAction('restart', c)} loading={loading('restart')} icon={<RotateCcw className="w-3.5 h-3.5" />} hoverColor="hover:text-yellow-400" />
          <ActionBtn title="View Logs" onClick={() => onLogs(c)} loading={false} icon={<ScrollText className="w-3.5 h-3.5" />} hoverColor="hover:text-accent" />
          {isRunning && (
            <ActionBtn title="Open Shell" onClick={() => onShell(c)} loading={false} icon={<Terminal className="w-3.5 h-3.5" />} hoverColor="hover:text-purple-400" />
          )}
        </div>
      </td>
    </tr>
  )
}

function StateBadge({ state, status }: { state: string; status: string }) {
  const cls =
    state === 'running'    ? 'badge-ok' :
    state === 'paused'     ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    state === 'restarting' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    'badge-muted'
  return (
    <div>
      <span className={cls}>{state}</span>
      <div className="text-[10px] text-muted mt-0.5">{status}</div>
    </div>
  )
}

function ActionBtn({ title, onClick, loading, icon, hoverColor }: {
  title: string; onClick: () => void; loading: boolean
  icon: React.ReactNode; hoverColor: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`text-muted ${hoverColor} transition-colors p-0.5`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    </button>
  )
}

function ShellTerminal({ wsUrlFn, onClose }: {
  wsUrlFn: (cmd: string) => string
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<string>('Connecting…')

  useEffect(() => {
    let destroyed = false
    let currentWs: WebSocket | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fitAddon: any = null

    async function tryShell(idx: number) {
      if (destroyed || idx >= SHELL_CANDIDATES.length) {
        if (!destroyed) {
          term?.writeln('\r\n\x1b[31m✗ No shell found in container.\x1b[0m')
        }
        return
      }

      const cmd = SHELL_CANDIDATES[idx]
      setStatus(`Trying ${cmd}…`)
      const hasData = { current: false }
      let noDataTimer: ReturnType<typeof setTimeout> | null = null

      const ws = new WebSocket(wsUrlFn(cmd))
      currentWs = ws

      ws.onopen = () => {
        noDataTimer = setTimeout(() => {
          if (!hasData.current && !destroyed) {
            ws.close()
          }
        }, 1500)
      }

      ws.onmessage = (ev) => {
        if (!hasData.current) {
          hasData.current = true
          if (noDataTimer) { clearTimeout(noDataTimer); noDataTimer = null }
          setStatus('')
          term?.write('\x1b[?25h') // show cursor
        }
        term?.write(ev.data)
      }

      ws.onclose = () => {
        if (noDataTimer) { clearTimeout(noDataTimer); noDataTimer = null }
        if (destroyed) return
        if (!hasData.current) {
          tryShell(idx + 1)
        } else {
          term?.writeln('\r\n\x1b[33m● Session ended — closing…\x1b[0m')
          setTimeout(() => { if (!destroyed) onClose() }, 1500)
        }
      }

      ws.onerror = () => ws.close()

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })
    }

    async function init() {
      if (!containerRef.current) return
      // @ts-expect-error css import
      await import('@xterm/xterm/css/xterm.css')
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' },
        convertEol: true,
      })
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current!)
      fitAddon.fit()

      const ro = new ResizeObserver(() => { try { fitAddon?.fit() } catch { /* ignore */ } })
      ro.observe(containerRef.current!)

      tryShell(0)

      return () => { ro.disconnect() }
    }

    init()

    return () => {
      destroyed = true
      currentWs?.close()
      term?.dispose()
    }
  }, [])

  return (
    <div className="relative w-full h-full bg-[#0d1117] rounded-b-lg overflow-hidden">
      {status && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex items-center gap-2 text-muted text-sm bg-surface-2/80 px-3 py-2 rounded">
            <Loader2 className="w-4 h-4 animate-spin" />{status}
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full p-1" />
    </div>
  )
}

function InfoStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-shrink-0">{icon}</span>
      <div>
        <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
        <div className="text-xs text-gray-300 font-mono">{value}</div>
      </div>
    </div>
  )
}

function ResourceBar({ icon, label, pct, valueStr }: { icon: React.ReactNode; label: string; pct: number; valueStr: string }) {
  const color = pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-yellow-400' : 'bg-accent'
  return (
    <div className="card p-2 text-xs">
      <div className="flex items-center gap-1.5 text-muted mb-1">{icon}{label}</div>
      <div className="text-gray-300 mb-1">{valueStr}</div>
      <div className="w-full bg-surface-4 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded bg-danger/10 border border-danger/30 text-danger text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />{msg}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12 text-muted gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span>
    </div>
  )
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtAge(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
