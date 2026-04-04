// ── Note on Console Access ───────────────────────────────────────────────────────────
// QEMU VMs support VNC console access via Proxmox API. However, VNC authentication
// is required for many VMs. Until the authentication method is researched and
// implemented, console buttons are disabled. See backend comment in api.py for details.
//
// To enable:
// 1. Add VNC password to VM in Proxmox VE GUI, or
// 2. Implement proxy-based authentication via backend
//
// ───────────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { api, ProxmoxNode, ProxmoxVM, ProxmoxRrdPoint, ProxmoxResource } from '../../api/client'
import {
  RefreshCw, Play, Square, RotateCcw, Loader2, AlertCircle, Server,
  ExternalLink, ChevronUp, ChevronDown, ArrowLeft, ChevronRight,
  Database, Network, Cpu, MemoryStick,
} from 'lucide-react'

type Tab = 'nodes' | 'vms' | 'storage'
type SortDir = 'asc' | 'desc'
type VmSortKey = 'name' | 'vmid' | 'node' | 'type' | 'status' | 'cpu' | 'mem' | 'uptime'
type Timeframe = 'hour' | 'day' | 'week' | 'month'

type ProxmoxSelection =
  | { type: 'datacenter' }
  | { type: 'node'; node: ProxmoxNode }
  | { type: 'vm'; vm: ProxmoxVM }

export function ProxmoxView({ instanceId = 'default' }: { instanceId?: string }) {
  const proxmox = api.proxmox(instanceId)
  const [nodes, setNodes] = useState<ProxmoxNode[]>([])
  const [vms, setVms] = useState<ProxmoxVM[]>([])
  const [storage, setStorage] = useState<ProxmoxStorage[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [proxmoxUrl, setProxmoxUrl] = useState<string | null>(null)
  const [clusterName, setClusterName] = useState<string>('Datacenter')
  const [selection, setSelection] = useState<ProxmoxSelection>({ type: 'datacenter' })

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
      proxmox.clusterStatus()
        .then((r) => {
          const clusterItem = r.status.find((i) => i.type === 'cluster')
          if (clusterItem?.name) setClusterName(clusterItem.name)
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
      if (selection.type === 'vm' && selection.vm.vmid === vm.vmid && selection.vm.node === vm.node) {
        const updated = res.vms.find((v) => v.vmid === vm.vmid && v.node === vm.node)
        if (updated) setSelection({ type: 'vm', vm: updated })
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Proxmox VE</h2>
          {proxmoxUrl && (
            <a href={proxmoxUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors">
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

      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-auto text-danger/70 hover:text-danger">✕</button>
        </div>
      )}

      {/* Main layout: sidebar + content */}
      <div className="flex gap-3 items-start">
        {/* Tree sidebar */}
        <div className="w-52 flex-shrink-0">
          <ProxmoxTreeSidebar
            nodes={nodes}
            vms={vms}
            selection={selection}
            onSelect={setSelection}
            loading={loading}
            clusterName={clusterName}
          />
        </div>
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {loading && nodes.length === 0 ? (
            <div className="flex items-center gap-2 text-muted text-sm py-16 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : selection.type === 'datacenter' ? (
            <DatacenterSummary
              nodes={nodes}
              vms={vms}
              storage={storage}
              clusterName={clusterName}
              errors={errors}
              instanceId={instanceId}
              onSelectNode={(node) => setSelection({ type: 'node', node })}
              onSelectVm={(vm) => setSelection({ type: 'vm', vm })}
            />
          ) : selection.type === 'node' ? (
            <NodeDetailView
              node={selection.node}
              vms={vms.filter((v) => v.node === selection.node.node)}
              instanceId={instanceId}
              onBack={() => setSelection({ type: 'datacenter' })}
              onVmAction={vmAction}
              onSelectVm={(vm) => setSelection({ type: 'vm', vm })}
              actionLoading={actionLoading}
            />
          ) : (
            <VmDetailView
              vm={selection.vm}
              instanceId={instanceId}
              onBack={() => {
                const parentNode = nodes.find((n) => n.node === selection.vm.node)
                setSelection(parentNode ? { type: 'node', node: parentNode } : { type: 'datacenter' })
              }}
              onAction={vmAction}
              actionLoading={actionLoading}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── VM / LXC Detail View ──────────────────────────────────────────────────────

function parseKVString(s: string): Record<string, string> {
  const result: Record<string, string> = {}
  s.split(',').forEach((part) => {
    const eq = part.indexOf('=')
    if (eq !== -1) result[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  })
  return result
}

function VmDetailView({
  vm,
  instanceId,
  onBack,
  onAction,
  actionLoading,
}: {
  vm: ProxmoxVM
  instanceId: string
  onBack: () => void
  onAction: (action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) => void
  actionLoading: string | null
}) {
  const proxmox = api.proxmox(instanceId)
  const vmType = vm.type === 'lxc' ? 'lxc' : 'qemu'
  const [timeframe, setTimeframe] = useState<Timeframe>('hour')
  const [rrdData, setRrdData] = useState<ProxmoxRrdPoint[]>([])
  const [rrdLoading, setRrdLoading] = useState(true)
  const [rrdError, setRrdError] = useState<string | null>(null)
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)

  const [configError, setConfigError] = useState<string | null>(null)
  useEffect(() => {
    proxmox.vmConfig(vm.node, vm.vmid, vmType)
      .then(setConfig)
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : 'Failed to load config'))
  }, [vm.node, vm.vmid, vmType])

  useEffect(() => {
    setRrdLoading(true)
    setRrdError(null)
    proxmox.vmRrd(vm.node, vm.vmid, vmType, timeframe)
      .then((r) => setRrdData(r.rrddata))
      .catch((e: unknown) => setRrdError(e instanceof Error ? e.message : 'Failed to load performance data'))
      .finally(() => setRrdLoading(false))
  }, [vm.node, vm.vmid, timeframe])

  const running = vm.status === 'running'
  const cpuPct = Math.round((vm.cpu ?? 0) * 100)
  const memPct = vm.maxmem > 0 ? Math.round((vm.mem / vm.maxmem) * 100) : 0
  const isActing = actionLoading?.startsWith(`${vm.node}-${vm.vmid}`)

  // Parse network interfaces (net0, net1, …)
  const netIfaces = config
    ? Object.entries(config)
        .filter(([k]) => /^net\d+$/.test(k))
        .map(([slot, v]) => {
          const raw = String(v)
          const parsed = parseKVString(raw)
          const firstPart = raw.split(',')[0]
          const eqIdx = firstPart.indexOf('=')
          const model = vmType === 'lxc' ? (parsed.name ?? slot) : (eqIdx !== -1 ? firstPart.slice(0, eqIdx) : firstPart)
          const mac = vmType === 'lxc' ? (parsed.hwaddr ?? '—') : (eqIdx !== -1 ? firstPart.slice(eqIdx + 1) : '—')
          return {
            slot,
            model,
            mac,
            bridge: parsed.bridge ?? '—',
            ip: parsed.ip ?? parsed.ip6 ?? null,
            vlan: parsed.tag ?? null,
          }
        })
    : []

  // Parse disks
  const diskPattern = vmType === 'lxc' ? /^(rootfs|mp\d+)$/ : /^(scsi|virtio|ide|sata)\d+$/
  const disks = config
    ? Object.entries(config)
        .filter(([k, v]) => diskPattern.test(k) && !String(v).startsWith('none'))
        .map(([slot, v]) => {
          const raw = String(v)
          const parsed = parseKVString(raw)
          const storageVol = raw.split(',')[0]
          return { slot, storageVol, size: parsed.size ?? null, mountpoint: parsed.mp ?? null }
        })
    : []

  // RRD chart data
  const chartData = rrdData.map((pt) => ({
    time: pt.time,
    cpu: typeof pt.cpu === 'number' ? Math.round(pt.cpu * 100 * 10) / 10 : null,
    memPct: typeof pt.mem === 'number' && typeof pt.maxmem === 'number' && pt.maxmem > 0
      ? Math.round((pt.mem / pt.maxmem) * 100 * 10) / 10 : null,
    netin: typeof pt.netin === 'number' ? Math.round(pt.netin / 1024) : null,
    netout: typeof pt.netout === 'number' ? Math.round(pt.netout / 1024) : null,
  }))

  // General config key/value pairs to display
  const configFields: [string, unknown][] = config ? (
    [
      ['Cores', config.cores] as [string, unknown],
      ['Sockets', config.sockets] as [string, unknown],
      ['Memory', config.memory ? `${config.memory} MiB` : null] as [string, unknown],
      ['Swap', config.swap ? `${config.swap} MiB` : null] as [string, unknown],
      ['OS Type', config.ostype] as [string, unknown],
      ['Hostname', config.hostname] as [string, unknown],
      ['Machine', config.machine] as [string, unknown],
      ['BIOS', config.bios] as [string, unknown],
      ['Guest Agent', config.agent === '1' || config.agent === 1 ? 'enabled' : config.agent ? String(config.agent) : null] as [string, unknown],
      ['Boot Order', config.boot] as [string, unknown],
      ['Description', config.description] as [string, unknown],
    ].filter(([, v]) => v != null && v !== '')
  ) : []

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            ← Datacenter
          </button>
          <span className="text-surface-4">/</span>
          <span className="font-mono text-muted text-sm">#{vm.vmid}</span>
          <h2 className="text-base font-semibold text-white">{vm.name ?? `${vm.type}/${vm.vmid}`}</h2>
          <span className="badge bg-surface-4 text-muted">{vm.type}</span>
          <StatusBadge status={vm.status} />
          {vm.tags && vm.tags.split(';').filter(Boolean).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/20 text-accent/90 border border-accent/20">
              {tag}
            </span>
          ))}
          <span className="text-xs text-muted">on {vm.node}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['hour', 'day', 'week', 'month'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  timeframe === tf ? 'bg-surface-4 text-gray-100' : 'text-muted hover:text-gray-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          {isActing ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted" />
          ) : running ? (
            <div className="flex gap-1">
              <ActionBtn icon={<RotateCcw className="w-3.5 h-3.5" />} title="Reboot" onClick={() => onAction('reboot', vm)} />
              <ActionBtn icon={<Square className="w-3.5 h-3.5" />} title="Graceful Shutdown" onClick={() => onAction('shutdown', vm)} />
            </div>
          ) : (
            <ActionBtn icon={<Play className="w-3.5 h-3.5" />} title="Start" onClick={() => onAction('start', vm)} className="text-success hover:bg-success/10" />
          )}
        </div>
      </div>

      {/* Stats */}
      {running && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard icon={<Cpu className="w-4 h-4" />} label="CPU" value={`${cpuPct}%`} sub={`${vm.cpus} vCPU${vm.cpus !== 1 ? 's' : ''}`} pct={cpuPct} />
          <StatCard icon={<MemoryStick className="w-4 h-4" />} label="Memory" value={fmtBytes(vm.mem)} sub={`of ${fmtBytes(vm.maxmem)}`} pct={memPct} />
          <StatCard icon={<Network className="w-4 h-4" />} label="Uptime" value={fmtUptime(vm.uptime)} sub="up" />
        </div>
      )}

      {/* Performance charts */}
      {rrdError ? (
        <SectionError message={rrdError} />
      ) : rrdLoading && chartData.length === 0 ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading performance data…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PerfGraph title="CPU Usage" data={chartData} series={[{ key: 'cpu', color: '#3b82f6', name: 'CPU %' }]} unit="%" yMax={100} timeframe={timeframe} />
          <PerfGraph title="Memory Usage" data={chartData} series={[{ key: 'memPct', color: '#8b5cf6', name: 'Mem %' }]} unit="%" yMax={100} timeframe={timeframe} />
          <PerfGraph title="Network I/O" data={chartData} series={[{ key: 'netin', color: '#10b981', name: 'In' }, { key: 'netout', color: '#f59e0b', name: 'Out' }]} unit=" KB/s" timeframe={timeframe} />
        </div>
      )}

      {configError && <SectionError message={configError} />}

      {/* Network + Disk config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card p-3 space-y-2">
          <h3 className="text-sm font-semibold text-white">Network Interfaces</h3>
          {netIfaces.length === 0 ? (
            <div className="text-xs text-muted py-2">No interfaces in config</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-surface-4">
                  <th className="text-left py-1 pr-3 font-medium">Slot</th>
                  <th className="text-left py-1 pr-3 font-medium">Model / Name</th>
                  <th className="text-left py-1 pr-3 font-medium">Bridge</th>
                  <th className="text-left py-1 font-medium">IP / MAC</th>
                </tr>
              </thead>
              <tbody>
                {netIfaces.map(({ slot, model, mac, bridge, ip, vlan }) => (
                  <tr key={slot} className="border-b border-surface-4/30">
                    <td className="py-1.5 pr-3 font-mono text-muted">{slot}</td>
                    <td className="py-1.5 pr-3 text-gray-300">{model}{vlan ? <span className="ml-1 badge bg-surface-4 text-muted">vlan {vlan}</span> : null}</td>
                    <td className="py-1.5 pr-3 text-gray-300">{bridge}</td>
                    <td className="py-1.5 font-mono text-gray-400 text-[10px] break-all">{ip ?? mac}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-3 space-y-2">
          <h3 className="text-sm font-semibold text-white">Disks</h3>
          {disks.length === 0 ? (
            <div className="text-xs text-muted py-2">No disks in config</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-surface-4">
                  <th className="text-left py-1 pr-3 font-medium">Slot</th>
                  <th className="text-left py-1 pr-3 font-medium">Storage / Volume</th>
                  <th className="text-left py-1 pr-3 font-medium">Size</th>
                  {vmType === 'lxc' && <th className="text-left py-1 font-medium">Mount</th>}
                </tr>
              </thead>
              <tbody>
                {disks.map(({ slot, storageVol, size, mountpoint }) => (
                  <tr key={slot} className="border-b border-surface-4/30">
                    <td className="py-1.5 pr-3 font-mono text-muted">{slot}</td>
                    <td className="py-1.5 pr-3 text-gray-300 truncate max-w-[120px]">{storageVol}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-400">{size ?? '—'}</td>
                    {vmType === 'lxc' && <td className="py-1.5 font-mono text-gray-400">{mountpoint ?? (slot === 'rootfs' ? '/' : '—')}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* General config */}
      {configFields.length > 0 && (
        <div className="card p-3 space-y-2">
          <h3 className="text-sm font-semibold text-white">Configuration</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1.5 text-xs">
            {configFields.map(([label, value]) => (
              <div key={String(label)}>
                <span className="text-muted">{label}: </span>
                <span className="text-gray-300">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Proxmox Tree Sidebar ──────────────────────────────────────────────────────

function ProxmoxTreeSidebar({
  nodes,
  vms,
  selection,
  onSelect,
  loading,
  clusterName,
}: {
  nodes: ProxmoxNode[]
  vms: ProxmoxVM[]
  selection: ProxmoxSelection
  onSelect: (s: ProxmoxSelection) => void
  loading: boolean
  clusterName: string
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (selection.type === 'vm') setExpandedNodes((p) => new Set([...p, selection.vm.node]))
    if (selection.type === 'node') setExpandedNodes((p) => new Set([...p, selection.node.node]))
  }, [selection])

  function toggleNode(name: string) {
    setExpandedNodes((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  const dcSelected = selection.type === 'datacenter'

  return (
    <div className="card p-1.5 space-y-0.5 select-none">
      <button
        onClick={() => onSelect({ type: 'datacenter' })}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
          dcSelected ? 'bg-accent/20 text-accent' : 'text-gray-300 hover:bg-surface-3/50'
        }`}
      >
        <Server className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-medium truncate text-xs">{clusterName}</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted" />}
      </button>

      {nodes.map((node) => {
        const nodeVms = [...vms.filter((v) => v.node === node.node)].sort((a, b) => a.vmid - b.vmid)
        const online = node.status === 'online'
        const expanded = expandedNodes.has(node.node)
        const nodeSelected = selection.type === 'node' && selection.node.node === node.node

        return (
          <div key={node.node}>
            <div className="flex items-center">
              <button onClick={() => toggleNode(node.node)} className="p-1 text-muted hover:text-gray-300 flex-shrink-0">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              <button
                onClick={() => onSelect({ type: 'node', node })}
                className={`flex-1 flex items-center gap-1.5 px-1 py-1 rounded text-left transition-colors text-xs ${
                  nodeSelected ? 'bg-accent/20 text-accent' : 'text-gray-300 hover:bg-surface-3/50'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${online ? 'bg-success' : 'bg-danger'}`} />
                <span className="font-medium truncate">{node.node}</span>
                <span className="text-muted ml-auto font-normal text-[10px]">{nodeVms.length}</span>
              </button>
            </div>
            {expanded && (
              <div className="ml-5 space-y-0.5">
                {nodeVms.map((vm) => {
                  const vmSelected = selection.type === 'vm' && selection.vm.vmid === vm.vmid && selection.vm.node === vm.node
                  const running = vm.status === 'running'
                  return (
                    <button
                      key={`${vm.node}-${vm.vmid}`}
                      onClick={() => onSelect({ type: 'vm', vm })}
                      className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors text-xs ${
                        vmSelected ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-surface-3/50 hover:text-gray-300'
                      }`}
                    >
                      <span className="flex-shrink-0 text-[10px]">{vm.type === 'lxc' ? '⬡' : '▣'}</span>
                      <span className="font-mono text-[10px] w-8 flex-shrink-0 opacity-70">{vm.vmid}</span>
                      <span className="truncate">{vm.name ?? `${vm.type}/${vm.vmid}`}</span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ml-auto ${running ? 'bg-success' : 'bg-surface-4'}`} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Datacenter Summary ────────────────────────────────────────────────────────

function DatacenterSummary({
  nodes,
  vms,
  clusterName,
  errors,
  onSelectNode,
  onSelectVm,
}: {
  nodes: ProxmoxNode[]
  vms: ProxmoxVM[]
  storage: ProxmoxStorage[]
  clusterName: string
  errors: Record<string, string>
  instanceId: string
  onSelectNode?: (node: ProxmoxNode) => void
  onSelectVm?: (vm: ProxmoxVM) => void
}) {
  const onlineNodes = nodes.filter((n) => n.status === 'online').length
  const runningVms = vms.filter((v) => v.status === 'running').length
  const totalVms = vms.filter((v) => v.type === 'qemu').length
  const totalLxc = vms.filter((v) => v.type === 'lxc').length
  const totalCpuPct = (() => {
    const used = nodes.reduce((s, n) => s + n.cpu * n.maxcpu, 0)
    const max = nodes.reduce((s, n) => s + n.maxcpu, 0)
    return max > 0 ? Math.round((used / max) * 100) : 0
  })()
  const totalMem = nodes.reduce((s, n) => s + n.mem, 0)
  const totalMaxMem = nodes.reduce((s, n) => s + n.maxmem, 0)
  const totalMaxCpu = nodes.reduce((s, n) => s + n.maxcpu, 0)
  const totalMemPct = totalMaxMem > 0 ? Math.round((totalMem / totalMaxMem) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-white">{clusterName}</h3>
        <span className={onlineNodes === nodes.length && nodes.length > 0 ? 'badge-ok' : 'badge-warning'}>
          {onlineNodes}/{nodes.length} nodes online
        </span>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Server className="w-4 h-4" />} label="Nodes" value={String(nodes.length)} sub={`${onlineNodes} online`} />
        <StatCard icon={<Cpu className="w-4 h-4" />} label="Total CPU" value={`${totalCpuPct}%`} sub={`${totalMaxCpu} cores`} pct={totalCpuPct} />
        <StatCard icon={<MemoryStick className="w-4 h-4" />} label="Total RAM" value={fmtBytes(totalMem)} sub={`of ${fmtBytes(totalMaxMem)}`} pct={totalMemPct} />
        <StatCard icon={<Database className="w-4 h-4" />} label="Guests" value={String(vms.length)} sub={`${runningVms} running · ${totalVms} VMs · ${totalLxc} CTs`} />
      </div>

      {nodes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Nodes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {nodes.map((node) => (
              <NodeCard key={node.node} node={node} onSelect={() => onSelectNode?.(node)} />
            ))}
          </div>
        </div>
      )}

      {vms.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">All Guests</h4>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Node</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">CPU</th>
                  <th className="px-3 py-2 text-right font-medium">Memory</th>
                  <th className="px-3 py-2 text-right font-medium">Uptime</th>
                  <th className="px-3 py-2 text-left font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {[...vms].sort((a, b) => a.vmid - b.vmid).map((vm) => {
                  const running = vm.status === 'running'
                  const cpuPct = Math.round((vm.cpu ?? 0) * 100)
                  const tags = vm.tags ? vm.tags.split(';').filter(Boolean) : []
                  return (
                    <tr key={`${vm.node}-${vm.vmid}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
                      <td className="px-3 py-2"><span className="badge bg-surface-4 text-muted">{vm.type}</span></td>
                      <td className="px-3 py-2 font-mono text-muted">{vm.vmid}</td>
                      <td className="px-3 py-2">
                        {onSelectVm ? (
                          <button onClick={() => onSelectVm(vm)} className="flex items-center gap-1 font-medium text-accent hover:text-accent/80 transition-colors">
                            {vm.name ?? '—'}
                            <ChevronRight className="w-3 h-3 opacity-60" />
                          </button>
                        ) : (
                          <span className="font-medium text-gray-200">{vm.name ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{vm.node}</td>
                      <td className="px-3 py-2"><StatusBadge status={vm.status} /></td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{running ? `${cpuPct}%` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted">
                        {running ? `${fmtBytes(vm.mem)} / ${fmtBytes(vm.maxmem)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">
                        {running ? fmtUptime(vm.uptime) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/20 text-accent/90 border border-accent/20">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Node Detail View ───────────────────────────────────────────────────────────

function NodeDetailView({
  node,
  vms,
  instanceId,
  onBack,
  onVmAction,
  onSelectVm,
  actionLoading,
}: {
  node: ProxmoxNode
  vms: ProxmoxVM[]
  instanceId: string
  onBack: () => void
  onVmAction: (action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) => void
  onSelectVm?: (vm: ProxmoxVM) => void
  actionLoading: string | null
}) {
  const proxmox = api.proxmox(instanceId)
  const [timeframe, setTimeframe] = useState<Timeframe>('hour')
  const [rrdData, setRrdData] = useState<ProxmoxRrdPoint[]>([])
  const [rrdLoading, setRrdLoading] = useState(true)
  const [rrdError, setRrdError] = useState<string | null>(null)

  async function loadRrd(tf: Timeframe) {
    setRrdLoading(true)
    setRrdError(null)
    try {
      const r = await proxmox.nodeRrd(node.node, tf)
      setRrdData(r.rrddata)
    } catch (e: unknown) {
      setRrdError(e instanceof Error ? e.message : 'Failed to load performance data')
    } finally {
      setRrdLoading(false)
    }
  }

  useEffect(() => { loadRrd(timeframe) }, [node.node, timeframe])

  const online = node.status === 'online'
  const cpuPct = Math.round(node.cpu * 100)
  const memPct = node.maxmem > 0 ? Math.round((node.mem / node.maxmem) * 100) : 0
  const diskPct = node.maxdisk > 0 ? Math.round((node.disk / node.maxdisk) * 100) : 0

  const pickMetric = (pt: ProxmoxRrdPoint, keys: string[]): number | null => {
    for (const key of keys) {
      const value = pt[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value
      }
    }
    return null
  }

  // Transform RRD data for charts — filter out null/undefined values
  const chartData = rrdData.map((pt) => ({
    time: pt.time,
    cpu: (() => {
      const cpu = pickMetric(pt, ['cpu'])
      return cpu != null ? Math.round(cpu * 100 * 10) / 10 : null
    })(),
    memPct: (() => {
      const memUsed = pickMetric(pt, ['mem', 'memused'])
      const memTotal = pickMetric(pt, ['maxmem', 'memtotal'])
      if (memUsed != null && memTotal != null && memTotal > 0) {
        return Math.round((memUsed / memTotal) * 100 * 10) / 10
      }
      const memFraction = pickMetric(pt, ['memory'])
      if (memFraction != null) {
        return Math.round(memFraction * 100 * 10) / 10
      }
      return null
    })(),
    diskPct: (() => {
      const rootUsed = pickMetric(pt, ['rootused'])
      const rootTotal = pickMetric(pt, ['roottotal'])
      if (rootUsed != null && rootTotal != null && rootTotal > 0) {
        return Math.round((rootUsed / rootTotal) * 100 * 10) / 10
      }
      const diskFraction = pickMetric(pt, ['disk'])
      if (diskFraction != null) {
        return Math.round(diskFraction * 100 * 10) / 10
      }
      return null
    })(),
    netin: (() => {
      const netIn = pickMetric(pt, ['netin'])
      return netIn != null ? Math.round(netIn / 1024) : null
    })(),
    netout: (() => {
      const netOut = pickMetric(pt, ['netout'])
      return netOut != null ? Math.round(netOut / 1024) : null
    })(),
    diskread: (() => {
      const read = pickMetric(pt, ['diskread'])
      return read != null ? Math.round(read / 1024) : null
    })(),
    diskwrite: (() => {
      const write = pickMetric(pt, ['diskwrite'])
      return write != null ? Math.round(write / 1024) : null
    })(),
  }))

  const hasDiskIo = chartData.some((pt) => pt.diskread != null || pt.diskwrite != null)

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            ← Datacenter
          </button>
          <span className="text-surface-4">/</span>
          <Server className="w-4 h-4 text-muted" />
          <h2 className="text-base font-semibold text-white">{node.node}</h2>
          <span className={online ? 'badge-ok' : 'badge-error'}>{node.status}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex gap-1">
            {(['hour', 'day', 'week', 'month'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  timeframe === tf ? 'bg-surface-4 text-gray-100' : 'text-muted hover:text-gray-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadRrd(timeframe)}
            disabled={rrdLoading}
            className="btn-ghost text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rrdLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      {online && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Cpu className="w-4 h-4" />}
            label="CPU"
            value={`${cpuPct}%`}
            sub={`${node.maxcpu} cores`}
            pct={cpuPct}
          />
          <StatCard
            icon={<MemoryStick className="w-4 h-4" />}
            label="Memory"
            value={fmtBytes(node.mem)}
            sub={`of ${fmtBytes(node.maxmem)}`}
            pct={memPct}
          />
          <StatCard
            icon={<Database className="w-4 h-4" />}
            label="Disk"
            value={fmtBytes(node.disk)}
            sub={`of ${fmtBytes(node.maxdisk)}`}
            pct={diskPct}
          />
          <StatCard
            icon={<Network className="w-4 h-4" />}
            label="Uptime"
            value={fmtUptime(node.uptime)}
            sub="up"
          />
        </div>
      )}

      {/* Performance graphs */}
      {rrdError ? (
        <SectionError message={rrdError} />
      ) : rrdLoading && chartData.length === 0 ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading performance data…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PerfGraph
            title="CPU Usage"
            data={chartData}
            series={[{ key: 'cpu', color: '#3b82f6', name: 'CPU %' }]}
            unit="%"
            yMax={100}
            timeframe={timeframe}
          />
          <PerfGraph
            title="Memory Usage"
            data={chartData}
            series={[{ key: 'memPct', color: '#8b5cf6', name: 'Mem %' }]}
            unit="%"
            yMax={100}
            timeframe={timeframe}
          />
          <PerfGraph
            title="Network I/O"
            data={chartData}
            series={[
              { key: 'netin', color: '#10b981', name: 'In' },
              { key: 'netout', color: '#f59e0b', name: 'Out' },
            ]}
            unit=" KB/s"
            timeframe={timeframe}
          />
          <PerfGraph
            title={hasDiskIo ? 'Disk I/O' : 'Disk Usage'}
            data={chartData}
            series={hasDiskIo
              ? [
                { key: 'diskread', color: '#06b6d4', name: 'Read' },
                { key: 'diskwrite', color: '#f97316', name: 'Write' },
              ]
              : [{ key: 'diskPct', color: '#06b6d4', name: 'Disk %' }]}
            unit={hasDiskIo ? ' KB/s' : '%'}
            yMax={hasDiskIo ? undefined : 100}
            timeframe={timeframe}
          />
        </div>
      )}

      {/* VMs on this node */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">
          VMs &amp; Containers on {node.node} ({vms.length})
        </h3>
        {vms.length === 0 ? (
          <Empty>No VMs or containers on this node.</Empty>
        ) : (
          <VmsTab
            vms={vms}
            actionLoading={actionLoading}
            onAction={onVmAction}
            onSelectVm={onSelectVm}
          />
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  pct,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  pct?: number
}) {
  const color = pct != null
    ? pct > 85 ? 'bg-danger' : pct > 65 ? 'bg-warning' : 'bg-accent-dim'
    : 'bg-accent-dim'

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted text-xs">
          {icon}
          {label}
        </div>
        {pct != null && (
          <span className="text-xs font-mono text-muted">{pct}%</span>
        )}
      </div>
      <div>
        <div className="text-lg font-semibold text-white leading-tight">{value}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      {pct != null && (
        <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}

type ChartPoint = {
  time: number
  [key: string]: number | null
}

function PerfGraph({
  title,
  data,
  series,
  unit,
  yMax,
  timeframe,
}: {
  title: string
  data: ChartPoint[]
  series: { key: string; color: string; name: string }[]
  unit: string
  yMax?: number
  timeframe: Timeframe
}) {
  function fmtTick(time: number) {
    const d = new Date(time * 1000)
    if (timeframe === 'hour') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (timeframe === 'day') return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300">{title}</span>
        <div className="flex gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1 text-xs text-muted">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="time"
            tickFormatter={fmtTick}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, yMax ?? 'auto']}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v: number) => `${v}${unit.trim()}`}
          />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: '#1a1f2e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#e5e7eb',
            }}
            formatter={(value: number, name: string) => [`${value}${unit}`, name]}
            labelFormatter={(label: number) => new Date(label * 1000).toLocaleString()}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={1.5}
              fill={`url(#grad-${s.key})`}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Tree Tab ───────────────────────────────────────────────────────────────────

function TreeTab({
  instanceId,
  vms,
  onSelectNode,
  onSelectVm,
}: {
  instanceId: string
  vms: ProxmoxVM[]
  onSelectNode: (nodeName: string) => void
  onSelectVm?: (vm: ProxmoxVM) => void
}) {
  const proxmox = api.proxmox(instanceId)
  const [resources, setResources] = useState<ProxmoxResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    proxmox.clusterResources()
      .then((r) => {
        setResources(r.resources)
        // Expand all nodes by default
        const nodeNames = r.resources
          .filter((res) => res.type === 'node')
          .map((res) => res.name ?? res.id)
        setExpandedNodes(new Set(nodeNames))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load tree'))
      .finally(() => setLoading(false))
  }, [instanceId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading tree…
      </div>
    )
  }
  if (error) return <SectionError message={error} />

  const getNodeName = (res: ProxmoxResource): string => {
    if (res.node) return res.node
    if (res.name) return res.name
    if (res.id?.startsWith('node/')) return res.id.slice('node/'.length)
    return res.id
  }

  // Group by node
  const nodeResources = resources
    .filter((r) => r.type === 'node')
    .sort((a, b) => getNodeName(a).localeCompare(getNodeName(b), undefined, { numeric: true, sensitivity: 'base' }))
  const vmResources = resources.filter((r) => r.type === 'vm' || r.type === 'qemu' || r.type === 'lxc')
  const storageResources = resources.filter((r) => r.type === 'storage')

  // Also include vms that may have been loaded on the main view
  // Use cluster resources if available, fall back to vms prop
  const getNodeVms = (nodeName: string) => {
    const fromResources = vmResources.filter((r) => (r.node ?? '') === nodeName)
    if (fromResources.length > 0) {
      return [...fromResources].sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0))
    }
    return vms
      .filter((v) => v.node === nodeName)
      .map((v) => ({
        id: `${v.type}/${v.vmid}`,
        type: v.type as 'vm' | 'lxc',
        node: v.node,
        vmid: v.vmid,
        name: v.name,
        status: v.status,
        cpu: v.cpu,
        maxcpu: v.cpus,
        mem: v.mem,
        maxmem: v.maxmem,
        uptime: v.uptime,
      }))
      .sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0))
  }

  const getNodeStorage = (nodeName: string) => storageResources.filter((r) => r.node === nodeName)

  function toggleNode(name: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  // Detect cluster name from resources if present
  const clusterRes = resources.find((r) => r.type as string === 'cluster')
  const clusterName = clusterRes ? (clusterRes.name ?? 'Cluster') : 'Proxmox Cluster'

  // Summary counts
  const totalVms = vmResources.length || vms.length
  const runningVms = vmResources.filter((r) => r.status === 'running').length ||
    vms.filter((v) => v.status === 'running').length

  return (
    <div className="space-y-2">
      {/* Cluster root */}
      <div className="card p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Server className="w-4 h-4 text-accent" />
          <span>{clusterName}</span>
          <span className="text-xs text-muted font-normal ml-1">
            {nodeResources.length} node{nodeResources.length !== 1 ? 's' : ''} · {totalVms} VM/CT ({runningVms} running)
          </span>
        </div>
      </div>

      {/* Nodes */}
      <div className="space-y-1 ml-4">
        {nodeResources.map((nodeRes) => {
          const nodeName = getNodeName(nodeRes)
          const expanded = expandedNodes.has(nodeName)
          const nodeVms = getNodeVms(nodeName)
          const nodeStorage = getNodeStorage(nodeName)
          const online = nodeRes.status === 'online'
          const nodeCpuPct = nodeRes.cpu != null && nodeRes.maxcpu != null
            ? Math.round((nodeRes.cpu / nodeRes.maxcpu) * 100)
            : null
          const nodeMemPct = nodeRes.mem != null && nodeRes.maxmem != null && nodeRes.maxmem > 0
            ? Math.round((nodeRes.mem / nodeRes.maxmem) * 100)
            : null

          return (
            <div key={nodeRes.id} className="space-y-0.5">
              {/* Node row */}
              <div className="flex items-center gap-1 group">
                <button
                  onClick={() => toggleNode(nodeName)}
                  className="p-0.5 text-muted hover:text-gray-300 transition-colors"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  />
                </button>
                <div
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-3/50 cursor-pointer transition-colors"
                  onClick={() => onSelectNode(nodeName)}
                >
                  <Server className={`w-3.5 h-3.5 ${online ? 'text-accent' : 'text-muted'}`} />
                  <span className="text-sm font-medium text-gray-200">{nodeName}</span>
                  <span className={online ? 'badge-ok text-[10px]' : 'badge-error text-[10px]'}>
                    {nodeRes.status}
                  </span>
                  {nodeCpuPct != null && (
                    <span className="text-xs text-muted ml-1">CPU {nodeCpuPct}%</span>
                  )}
                  {nodeMemPct != null && (
                    <span className="text-xs text-muted">RAM {nodeMemPct}%</span>
                  )}
                  <span className="text-xs text-muted ml-auto">
                    {nodeVms.length} VM/CT
                  </span>
                  <ExternalLink className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Expanded children */}
              {expanded && (
                <div className="ml-8 space-y-0.5">
                  {nodeVms.length === 0 && nodeStorage.length === 0 ? (
                    <div className="text-xs text-muted px-2 py-1">No VMs or containers</div>
                  ) : (
                    <>
                      {nodeVms.map((vm) => {
                        const running = vm.status === 'running'
                        const cpuPct = vm.cpu != null && vm.maxcpu != null && vm.maxcpu > 0
                          ? Math.round((vm.cpu / vm.maxcpu) * 100)
                          : vm.cpu != null ? Math.round(vm.cpu * 100)
                          : null
                        const memPct = vm.mem != null && vm.maxmem != null && vm.maxmem > 0
                          ? Math.round((vm.mem / vm.maxmem) * 100)
                          : null

                        function handleVmClick() {
                          if (!onSelectVm) return
                          const full = vms.find((v) => v.vmid === (vm.vmid ?? 0) && v.node === (vm.node ?? ''))
                          if (full) {
                            onSelectVm(full)
                          } else {
                            onSelectVm({
                              vmid: vm.vmid ?? 0,
                              name: vm.name ?? `${vm.type}/${vm.vmid}`,
                              status: vm.status ?? 'unknown',
                              type: vm.type === 'lxc' ? 'lxc' : 'qemu',
                              node: vm.node ?? '',
                              cpu: vm.cpu ?? 0,
                              cpus: vm.maxcpu ?? 0,
                              mem: vm.mem ?? 0,
                              maxmem: vm.maxmem ?? 0,
                              uptime: vm.uptime ?? 0,
                            })
                          }
                        }

                        return (
                          <div
                            key={vm.id}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${onSelectVm ? 'hover:bg-surface-3/50 cursor-pointer' : 'hover:bg-surface-3/30'}`}
                            onClick={onSelectVm ? handleVmClick : undefined}
                          >
                            <span className="w-3 h-3 text-center text-muted">
                              {vm.type === 'lxc' ? '⬡' : '▣'}
                            </span>
                            <span className="font-mono text-muted w-12">{vm.vmid ?? '—'}</span>
                            <span className={`font-medium ${running ? (onSelectVm ? 'text-accent hover:text-accent/80' : 'text-gray-200') : 'text-muted'}`}>
                              {vm.name ?? `${vm.type}/${vm.vmid}`}
                            </span>
                            <span className="badge bg-surface-4 text-muted text-[10px]">{vm.type}</span>
                            <StatusBadge status={vm.status ?? 'unknown'} />
                            {running && cpuPct != null && (
                              <span className="text-muted ml-1">CPU {cpuPct}%</span>
                            )}
                            {running && memPct != null && (
                              <span className="text-muted">RAM {memPct}%</span>
                            )}
                            {running && vm.uptime != null && (
                              <span className="text-muted ml-auto">{fmtUptime(vm.uptime)}</span>
                            )}
                            {onSelectVm && <ChevronRight className="w-3 h-3 text-muted ml-auto opacity-50" />}
                          </div>
                        )
                      })}
                      {nodeStorage.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-surface-4/30">
                          {nodeStorage.map((s) => {
                            const pct = s.disk != null && s.maxdisk != null && s.maxdisk > 0
                              ? Math.round((s.disk / s.maxdisk) * 100)
                              : null
                            return (
                              <div key={s.id} className="flex items-center gap-2 px-2 py-1 text-xs text-muted">
                                <Database className="w-3 h-3" />
                                <span className="font-medium">{s.name ?? s.id}</span>
                                {pct != null && <span>{pct}% used</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Nodes tab ──────────────────────────────────────────────────────────────────

function NodesTab({
  nodes,
  error,
  onSelectNode,
}: {
  nodes: ProxmoxNode[]
  error?: string
  onSelectNode: (node: ProxmoxNode) => void
}) {
  if (error) return <SectionError message={error} />
  if (nodes.length === 0) return <Empty>No nodes found.</Empty>
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {nodes.map((node) => (
        <NodeCard key={node.node} node={node} onSelect={() => onSelectNode(node)} />
      ))}
    </div>
  )
}

function NodeCard({ node, onSelect }: { node: ProxmoxNode; onSelect: () => void }) {
  const online = node.status === 'online'
  const cpuPct = Math.round(node.cpu * 100)
  const memPct = node.maxmem > 0 ? Math.round((node.mem / node.maxmem) * 100) : 0
  const diskPct = node.maxdisk > 0 ? Math.round((node.disk / node.maxdisk) * 100) : 0

  return (
    <button
      onClick={onSelect}
      className="card p-4 space-y-3 text-left hover:border-accent/50 hover:bg-surface-3/50 transition-colors cursor-pointer w-full"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted" />
          <span className="font-medium text-sm text-white">{node.node}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={online ? 'badge-ok' : 'badge-error'}>
            {online ? 'online' : 'offline'}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-muted" />
        </div>
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
    </button>
  )
}

// ── VMs tab ────────────────────────────────────────────────────────────────────

function VmsTab({
  vms,
  error,
  actionLoading,
  onAction,
  onSelectVm,
}: {
  vms: ProxmoxVM[]
  error?: string
  actionLoading: string | null
  onAction: (action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) => void
  onSelectVm?: (vm: ProxmoxVM) => void
}) {
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')
  const [sortKey, setSortKey] = useState<VmSortKey>('vmid')
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
        case 'name':    cmp = (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true, sensitivity: 'base' }); break
        case 'vmid':    cmp = a.vmid - b.vmid; break
        case 'node':    cmp = a.node.localeCompare(b.node, undefined, { numeric: true, sensitivity: 'base' }); break
        case 'type':    cmp = a.type.localeCompare(b.type, undefined, { numeric: true, sensitivity: 'base' }); break
        case 'status':  cmp = a.status.localeCompare(b.status, undefined, { numeric: true, sensitivity: 'base' }); break
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
              <VmRow key={`${vm.node}-${vm.vmid}`} vm={vm} actionLoading={actionLoading} onAction={onAction} onSelect={onSelectVm ? () => onSelectVm(vm) : undefined} />
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
  onSelect,
}: {
  vm: ProxmoxVM
  actionLoading: string | null
  onAction: (action: 'start' | 'stop' | 'shutdown' | 'reboot', vm: ProxmoxVM) => void
  onSelect?: () => void
}) {
  const running = vm.status === 'running'
  const cpuPct = Math.round((vm.cpu ?? 0) * 100)
  const isActing = actionLoading?.startsWith(`${vm.node}-${vm.vmid}`)

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2 font-mono text-muted">{vm.vmid}</td>
      <td className="px-3 py-2">
        {onSelect ? (
          <button onClick={onSelect} className="flex items-center gap-1 font-medium text-accent hover:text-accent/80 transition-colors text-left">
            {vm.name ?? '—'}
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>
        ) : (
          <span className="font-medium text-gray-200">{vm.name ?? '—'}</span>
        )}
      </td>
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

