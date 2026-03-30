import { useEffect, useState } from 'react'
import { api, DockerContainer, DockerImage } from '../../api/client'
import {
  RefreshCw, Loader2, AlertCircle, Play, Square, RotateCcw,
  ScrollText, X, Container, HardDrive,
} from 'lucide-react'

type Tab = 'containers' | 'images'

export function DockerView({ instanceId = 'default' }: { instanceId?: string }) {
  const docker = api.docker(instanceId)
  const [tab, setTab] = useState<Tab>('containers')

  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [containersLoading, setContainersLoading] = useState(true)
  const [containersError, setContainersError] = useState<string | null>(null)

  const [images, setImages] = useState<DockerImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [imagesError, setImagesError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Logs modal
  const [logsContainer, setLogsContainer] = useState<DockerContainer | null>(null)
  const [logsText, setLogsText] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  async function loadContainers() {
    setContainersLoading(true); setContainersError(null)
    try {
      const data = await docker.containers()
      setContainers(data.containers)
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

  useEffect(() => { loadContainers() }, [])

  useEffect(() => {
    if (tab === 'images' && !imagesLoaded && !imagesLoading) loadImages()
  }, [tab])

  function refresh() {
    if (tab === 'containers') loadContainers()
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

  async function openLogs(container: DockerContainer) {
    setLogsContainer(container); setLogsText(''); setLogsError(null); setLogsLoading(true)
    try {
      const text = await docker.logs(container.full_id, 200)
      setLogsText(text)
    } catch (e: unknown) {
      setLogsError(e instanceof Error ? e.message : 'Failed to load logs')
    } finally { setLogsLoading(false) }
  }

  const running = containers.filter((c) => c.state === 'running').length
  const isLoading = containersLoading || imagesLoading

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'containers', label: 'Containers', icon: <Container className="w-3.5 h-3.5" /> },
    { id: 'images',     label: 'Images',     icon: <HardDrive  className="w-3.5 h-3.5" /> },
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

      {/* Logs modal */}
      {logsContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setLogsContainer(null)}>
          <div className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-4xl mx-4 flex flex-col" style={{ maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-muted" />
                <span className="font-semibold text-sm text-white">{logsContainer.names[0] ?? logsContainer.id}</span>
                <span className="text-muted text-xs">— last 200 lines</span>
              </div>
              <button onClick={() => setLogsContainer(null)} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {logsLoading ? (
                <div className="flex items-center gap-2 text-muted text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading logs…</div>
              ) : logsError ? (
                <ErrorBanner msg={logsError} />
              ) : (
                <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all leading-relaxed">{logsText || '(no output)'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContainerRow({ container: c, actionLoading, onAction, onLogs }: {
  container: DockerContainer
  actionLoading: string | null
  onAction: (action: 'start' | 'stop' | 'restart', c: DockerContainer) => void
  onLogs: (c: DockerContainer) => void
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
        <div className="font-medium text-gray-200">{name}</div>
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
