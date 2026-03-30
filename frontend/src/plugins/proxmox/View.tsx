import { useEffect, useState } from 'react'
import { api, ProxmoxNode, ProxmoxVM } from '../../api/client'
import { RefreshCw, Play, Square, RotateCcw, Loader2, AlertCircle, Server, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react'
import { getViewState, setViewState } from '../../store/viewStateStore'

type Tab = 'nodes' | 'vms' | 'storage'
type SortDir = 'asc' | 'desc'
type VmSortKey = 'name' | 'vmid' | 'node' | 'type' | 'status' | 'cpu' | 'mem' | 'uptime'

export function ProxmoxView({ instanceId = 'default' }: { instanceId?: string }) {
  const proxmox = api.proxmox(instanceId)
  const _key = `proxmox:${instanceId}`
  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'nodes') as Tab)
  function setTab(t: Tab) { setViewState(`${_key}:tab`, t); setTabRaw(t) }
  const [nodes, setNodes] = useState<ProxmoxNode[]>([])
  const [vms, setVms] = useState<ProxmoxVM[]>([])
  const [storage, setStorage] = useState<ProxmoxStorage[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [proxmoxUrl, setProxmoxUrl] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErrors({})

    const errs: Record<string, string> = {}

    await Promise.all([
      proxmox.nodes()
        .then((r) => setNodes([...r.nodes].sort((a, b) => a.node.localeCompare(b.node))))
        .catch((e: unknown) => { errs.nodes = e instanceof Error ? e.message : 'Failed' }),
      proxmox.allVms()
        .then((r) => setVms(r.vms))
        .catch((e: unknown) => { errs.vms = e instanceof Error ? e.message : 'Failed' }),
      proxmox.storage()
        .then((r) => setStorage(r.storage))
        .catch((e: unknown) => { errs.storage = e instanceof Error ? e.message : 'Failed' }),
      api.getPlugin('proxmox', instanceId)
        .then((detail) => {
          const cfg = detail.config
          if (cfg?.host) {
            const port = cfg.port ?? 8006
            setProxmoxUrl(`https://${cfg.host}:${port}`)
          }
        })
        .catch(() => {}),
    ])

    setErrors(errs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function vmAction(action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) {
    const key = `${vm.node}-${vm.vmid}-${action}`
    setActionLoading(key)
    try {
      const actionFn = proxmox[`${action}Vm` as keyof typeof proxmox] as (node: string, vmid: number, type?: string) => Promise<unknown>
      await actionFn(vm.node, vm.vmid, vm.type)
      await new Promise((r) => setTimeout(r, 1500))
      const res = await proxmox.allVms()
      setVms(res.vms)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'nodes', label: `Nodes (${nodes.length})` },
    { id: 'vms', label: `VMs / CTs (${vms.length})` },
    { id: 'storage', label: `Storage (${storage.length})` },
  ]

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Proxmox VE</h2>
          {proxmoxUrl && (
            <a
              href={proxmoxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              {proxmoxUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="space-y-1">
          {Object.entries(errors).map(([section, msg]) => (
            <div key={section} className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="capitalize font-medium">{section}:</span> {msg}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && nodes.length === 0 ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          {tab === 'nodes' && <NodesTab nodes={nodes} error={errors.nodes} />}
          {tab === 'vms' && (
            <VmsTab vms={vms} error={errors.vms} actionLoading={actionLoading} onAction={vmAction} />
          )}
          {tab === 'storage' && <StorageTab storage={storage} error={errors.storage} />}
        </>
      )}
    </div>
  )
}

// ── Nodes tab ──────────────────────────────────────────────────────────────────

function NodesTab({ nodes, error }: { nodes: ProxmoxNode[]; error?: string }) {
  if (error) return <SectionError message={error} />
  if (nodes.length === 0) return <Empty>No nodes found.</Empty>
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {nodes.map((node) => (
        <NodeCard key={node.node} node={node} />
      ))}
    </div>
  )
}

function NodeCard({ node }: { node: ProxmoxNode }) {
  const online = node.status === 'online'
  const cpuPct = Math.round(node.cpu * 100)
  const memPct = node.maxmem > 0 ? Math.round((node.mem / node.maxmem) * 100) : 0
  const diskPct = node.maxdisk > 0 ? Math.round((node.disk / node.maxdisk) * 100) : 0

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted" />
          <span className="font-medium text-sm text-white">{node.node}</span>
        </div>
        <span className={online ? 'badge-ok' : 'badge-error'}>
          {online ? 'online' : 'offline'}
        </span>
      </div>

      {online && (
        <div className="space-y-2 text-xs">
          <MiniBar label="CPU" pct={cpuPct} />
          <MiniBar label="RAM" pct={memPct} detail={`${fmtBytes(node.mem)} / ${fmtBytes(node.maxmem)}`} />
          <MiniBar label="Disk" pct={diskPct} detail={`${fmtBytes(node.disk)} / ${fmtBytes(node.maxdisk)}`} />
          <div className="flex justify-between text-muted pt-1">
            <span>Uptime</span>
            <span className="font-mono">{fmtUptime(node.uptime)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>CPUs</span>
            <span className="font-mono">{node.maxcpu}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── VMs tab ────────────────────────────────────────────────────────────────────

function VmsTab({
  vms,
  error,
  actionLoading,
  onAction,
}: {
  vms: ProxmoxVM[]
  error?: string
  actionLoading: string | null
  onAction: (action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) => void
}) {
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')
  const [sortKey, setSortKey] = useState<VmSortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  if (error) return <SectionError message={error} />
  if (vms.length === 0) return <Empty>No VMs or containers found.</Empty>

  function handleSort(key: VmSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = vms
    .filter((v) => {
      if (filter === 'running') return v.status === 'running'
      if (filter === 'stopped') return v.status === 'stopped'
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':    cmp = (a.name ?? '').localeCompare(b.name ?? ''); break
        case 'vmid':    cmp = a.vmid - b.vmid; break
        case 'node':    cmp = a.node.localeCompare(b.node); break
        case 'type':    cmp = a.type.localeCompare(b.type); break
        case 'status':  cmp = a.status.localeCompare(b.status); break
        case 'cpu':     cmp = (a.cpu ?? 0) - (b.cpu ?? 0); break
        case 'mem':     cmp = a.mem - b.mem; break
        case 'uptime':  cmp = a.uptime - b.uptime; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex gap-1">
        {(['all', 'running', 'stopped'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-surface-4 text-gray-100' : 'text-muted hover:text-gray-300'
            }`}
          >
            {f} {f === 'all' ? `(${vms.length})` : f === 'running' ? `(${vms.filter(v => v.status === 'running').length})` : `(${vms.filter(v => v.status === 'stopped').length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-4 text-muted">
              <SortTh label="ID"     col="vmid"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="Name"   col="name"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="Node"   col="node"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="Type"   col="type"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
              <SortTh label="CPU"    col="cpu"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortTh label="RAM"    col="mem"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortTh label="Uptime" col="uptime" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((vm) => (
              <VmRow key={`${vm.node}-${vm.vmid}`} vm={vm} actionLoading={actionLoading} onAction={onAction} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SortTh({
  label, col, sortKey, sortDir, onSort, align,
}: {
  label: string
  col: VmSortKey
  sortKey: VmSortKey
  sortDir: SortDir
  onSort: (col: VmSortKey) => void
  align: 'left' | 'right'
}) {
  const active = col === sortKey
  return (
    <th
      className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-gray-200 transition-colors text-${align}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-0.5 ${active ? 'text-gray-200' : ''}`}>
        {align === 'right' && active && (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
        {label}
        {align === 'left' && active && (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </span>
    </th>
  )
}

function VmRow({
  vm,
  actionLoading,
  onAction,
}: {
  vm: ProxmoxVM
  actionLoading: string | null
  onAction: (action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) => void
}) {
  const running = vm.status === 'running'
  const cpuPct = Math.round((vm.cpu ?? 0) * 100)
  const memPct = vm.maxmem > 0 ? Math.round((vm.mem / vm.maxmem) * 100) : 0
  const isActing = actionLoading?.startsWith(`${vm.node}-${vm.vmid}`)

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2 font-mono text-muted">{vm.vmid}</td>
      <td className="px-3 py-2 font-medium text-gray-200">{vm.name ?? '—'}</td>
      <td className="px-3 py-2 text-muted">{vm.node}</td>
      <td className="px-3 py-2">
        <span className="badge bg-surface-4 text-muted">{vm.type}</span>
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={vm.status} />
      </td>
      <td className="px-3 py-2 text-right font-mono text-muted">
        {running ? `${cpuPct}%` : '—'}
      </td>
      <td className="px-3 py-2 text-right font-mono text-muted">
        {running ? `${fmtBytes(vm.mem)} / ${fmtBytes(vm.maxmem)}` : '—'}
      </td>
      <td className="px-3 py-2 text-right font-mono text-muted">
        {running ? fmtUptime(vm.uptime) : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          {isActing ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted" />
          ) : running ? (
            <>
              <ActionBtn icon={<RotateCcw className="w-3.5 h-3.5" />} title="Reboot" onClick={() => onAction('reboot', vm)} />
              <ActionBtn icon={<Square className="w-3.5 h-3.5" />} title="Shutdown" onClick={() => onAction('shutdown', vm)} />
            </>
          ) : (
            <ActionBtn icon={<Play className="w-3.5 h-3.5" />} title="Start" onClick={() => onAction('start', vm)} className="text-success hover:bg-success/10" />
          )}
        </div>
      </td>
    </tr>
  )
}

function ActionBtn({
  icon,
  title,
  onClick,
  className = 'text-muted hover:text-gray-100 hover:bg-surface-4',
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${className}`}
    >
      {icon}
    </button>
  )
}

// ── Storage tab ────────────────────────────────────────────────────────────────

interface ProxmoxStorage {
  storage: string
  node: string
  type: string
  content: string
  used: number
  avail: number
  total: number
  active: number
  enabled: number
}

function StorageTab({ storage, error }: { storage: ProxmoxStorage[]; error?: string }) {
  if (error) return <SectionError message={error} />
  if (storage.length === 0) return <Empty>No storage pools found.</Empty>

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">Node</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Content</th>
            <th className="px-3 py-2 text-right font-medium">Used</th>
            <th className="px-3 py-2 text-right font-medium">Available</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-left font-medium w-32">Usage</th>
          </tr>
        </thead>
        <tbody>
          {storage.map((s, i) => {
            const pct = s.total > 0 ? Math.round((s.used / s.total) * 100) : 0
            const color = pct > 85 ? 'bg-danger' : pct > 65 ? 'bg-warning' : 'bg-accent-dim'
            return (
              <tr key={i} className="border-b border-surface-4/50 hover:bg-surface-3/30">
                <td className="px-3 py-2 font-medium text-gray-200">{s.storage}</td>
                <td className="px-3 py-2 text-muted">{s.node}</td>
                <td className="px-3 py-2 text-muted">{s.type}</td>
                <td className="px-3 py-2 text-muted truncate max-w-[120px]">{s.content}</td>
                <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(s.used)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(s.avail)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(s.total)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-surface-4 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-muted w-7 text-right">{pct}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') return <span className="badge-ok">running</span>
  if (status === 'stopped') return <span className="badge-muted">stopped</span>
  return <span className="badge-warning">{status}</span>
}

function MiniBar({ label, pct, detail }: { label: string; pct: number; detail?: string }) {
  const color = pct > 85 ? 'bg-danger' : pct > 65 ? 'bg-warning' : 'bg-accent-dim'
  return (
    <div>
      <div className="flex justify-between text-muted mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{detail ?? `${pct}%`}</span>
      </div>
      <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted text-center py-12">{children}</div>
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-3">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  )
}

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function fmtUptime(seconds: number): string {
  if (!seconds) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
