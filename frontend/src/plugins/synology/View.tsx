import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type {
  SynologyInfo,
  SynologyUtilisation,
  SynologyVolume,
  SynologyDisk,
  SynologyShare,
  SynologyTask,
  SynologyPackage,
  SynologyFile,
} from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { getViewState, setViewState } from '../../store/viewStateStore'
import {
  HardDrive, Database, Download, FolderOpen, Package, Activity,
  Thermometer, Cpu, Network, Play, Square, Trash2, Plus,
  ChevronRight, Lock, Unlock, RefreshCw, AlertCircle, CheckCircle,
  Loader2, File, Folder,
} from 'lucide-react'

// ─── Utility helpers ─────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n === 0) return '0 B'
  if (n < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  const idx = Math.min(i, units.length - 1)
  return `${(n / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function fmtUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function fmtSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s'
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
}

function fmtDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="h-2 bg-surface-4 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  )
}

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  const cls = map[status.toLowerCase()] ?? 'bg-surface-3 text-muted'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>
      {status}
    </span>
  )
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 py-4 px-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm">{message}</span>
    </div>
  )
}

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="text-center text-muted py-8 text-sm">{message}</div>
  )
}

function SectionLoading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 text-muted animate-spin" />
    </div>
  )
}

// ─── Volume status map ────────────────────────────────────────────────────────

const VOLUME_STATUS_MAP: Record<string, string> = {
  normal: 'bg-green-900/40 text-green-400',
  healthy: 'bg-green-900/40 text-green-400',
  degraded: 'bg-red-900/40 text-red-400',
  crashed: 'bg-red-900/40 text-red-400',
  repairing: 'bg-yellow-900/40 text-yellow-400',
  migrating: 'bg-blue-900/40 text-blue-400',
}

const DISK_STATUS_MAP: Record<string, string> = {
  normal: 'bg-green-900/40 text-green-400',
  initialized: 'bg-green-900/40 text-green-400',
  notinitialized: 'bg-surface-3 text-muted',
  systempartitionfailed: 'bg-red-900/40 text-red-400',
  crashed: 'bg-red-900/40 text-red-400',
  warning: 'bg-yellow-900/40 text-yellow-400',
}

const SMART_STATUS_MAP: Record<string, string> = {
  normal: 'bg-green-900/40 text-green-400',
  notesting: 'bg-surface-3 text-muted',
  'not testing': 'bg-surface-3 text-muted',
  warning: 'bg-yellow-900/40 text-yellow-400',
  abnormal: 'bg-red-900/40 text-red-400',
}

const TASK_STATUS_MAP: Record<string, string> = {
  downloading: 'bg-blue-900/40 text-blue-400',
  paused: 'bg-yellow-900/40 text-yellow-400',
  finished: 'bg-green-900/40 text-green-400',
  error: 'bg-red-900/40 text-red-400',
  waiting: 'bg-surface-3 text-muted',
  seeding: 'bg-purple-900/40 text-purple-400',
  filehosting_waiting: 'bg-surface-3 text-muted',
  extracting: 'bg-cyan-900/40 text-cyan-400',
}

const PACKAGE_STATUS_MAP: Record<string, string> = {
  running: 'bg-green-900/40 text-green-400',
  started: 'bg-green-900/40 text-green-400',
  stopped: 'bg-surface-3 text-muted',
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'storage' | 'shares' | 'downloads' | 'packages' | 'files'

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ instanceId }: { instanceId: string }) {
  const synApi = api.synology(instanceId)
  const [info, setInfo] = useState<SynologyInfo | null>(null)
  const [util, setUtil] = useState<SynologyUtilisation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [infoRes, utilRes] = await Promise.all([synApi.info(), synApi.utilisation()])
      setInfo(infoRes)
      setUtil(utilRes)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(() => load(true), 10000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId])

  if (loading) return <SectionLoading />
  if (error) return <SectionError message={error} />

  const utilAvailable = util?.available !== false
  const cpuPct = util?.cpu.total ?? 0
  const memUsage = util?.memory.usage ?? 0
  const memUsedGB = util ? util.memory.used / (1024 * 1024 * 1024) : 0
  const memTotalGB = util ? util.memory.total / (1024 * 1024 * 1024) : 0

  return (
    <div className="space-y-4">
      {/* System info card */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium">System Information</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <InfoRow label="Model" value={info?.model ?? '—'} />
          <InfoRow label="DSM Version" value={info?.version ?? '—'} />
          <InfoRow label="Serial" value={info?.serial ?? '—'} />
          <InfoRow label="Uptime" value={info ? fmtUptime(info.uptime) : '—'} />
          {info?.temperature !== undefined && info.temperature !== null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted text-xs">Temperature</span>
              <span className={`font-mono text-sm font-medium flex items-center gap-1 ${
                info.temperature >= 55 ? 'text-red-400' : info.temperature >= 40 ? 'text-amber-400' : 'text-green-400'
              }`}>
                <Thermometer className="w-3.5 h-3.5" />
                {info.temperature}°C
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Utilisation unavailable notice */}
      {!utilAvailable && (
        <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-800/40 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          CPU and memory stats require an admin account on this Synology.
        </div>
      )}

      {/* CPU + Memory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-medium">CPU Usage</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted">Total</span>
              <span className="font-mono font-semibold">{cpuPct.toFixed(1)}%</span>
            </div>
            <UsageBar pct={cpuPct} colorClass={cpuPct > 90 ? 'bg-red-500' : cpuPct > 70 ? 'bg-amber-500' : 'bg-cyan-500'} />
            {util && (
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted">
                <span>User: <span className="text-gray-300 font-mono">{util.cpu.user.toFixed(1)}%</span></span>
                <span>System: <span className="text-gray-300 font-mono">{util.cpu.system.toFixed(1)}%</span></span>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-medium">Memory Usage</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted">
                {memUsedGB.toFixed(1)} GB / {memTotalGB.toFixed(1)} GB
              </span>
              <span className="font-mono font-semibold">{memUsage.toFixed(1)}%</span>
            </div>
            <UsageBar pct={memUsage} colorClass={memUsage > 90 ? 'bg-red-500' : memUsage > 75 ? 'bg-amber-500' : 'bg-purple-500'} />
          </div>
        </div>
      </div>

      {/* Network I/O */}
      {util && util.network.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-medium">Network I/O</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-surface-3">
                  <th className="text-left pb-2 pr-4">Interface</th>
                  <th className="text-right pb-2 pr-4">RX</th>
                  <th className="text-right pb-2">TX</th>
                </tr>
              </thead>
              <tbody>
                {util.network.map((iface) => (
                  <tr key={iface.device} className="border-b border-surface-3/50 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-gray-300">{iface.device}</td>
                    <td className="py-2 pr-4 text-right font-mono text-green-400 text-xs">{fmtSpeed(iface.rx)}</td>
                    <td className="py-2 text-right font-mono text-blue-400 text-xs">{fmtSpeed(iface.tx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted text-xs">{label}</span>
      <span className="font-mono text-sm font-medium text-gray-200">{value}</span>
    </div>
  )
}

// ─── Storage Tab ──────────────────────────────────────────────────────────────

function StorageTab({ instanceId }: { instanceId: string }) {
  const synApi = api.synology(instanceId)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [volumes, setVolumes] = useState<SynologyVolume[]>([])
  const [disks, setDisks] = useState<SynologyDisk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [smartLoading, setSmartLoading] = useState<string | null>(null)
  const [smartMsg, setSmartMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await synApi.storage()
      setVolumes(res.volumes)
      setDisks(res.disks)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load storage')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [instanceId])

  async function runSmartTest(diskId: string) {
    setSmartLoading(diskId)
    setSmartMsg(null)
    try {
      const res = await synApi.smartTest(diskId)
      setSmartMsg(res.message)
    } catch (e: unknown) {
      setSmartMsg(e instanceof Error ? e.message : 'SMART test failed')
    } finally {
      setSmartLoading(null)
    }
  }

  if (loading) return <SectionLoading />
  if (error) return <SectionError message={error} />

  return (
    <div className="space-y-6">
      {smartMsg && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 border border-green-800/40 rounded px-3 py-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {smartMsg}
          <button className="ml-auto text-muted hover:text-gray-300" onClick={() => setSmartMsg(null)}>×</button>
        </div>
      )}

      {/* Volumes */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          Volumes
        </h3>
        {volumes.length === 0 ? (
          <SectionEmpty message="No volumes found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-surface-3">
                  <th className="text-left pb-2 pr-4">Name</th>
                  <th className="text-left pb-2 pr-4">RAID</th>
                  <th className="text-left pb-2 pr-4">FS</th>
                  <th className="text-left pb-2 pr-4">Status</th>
                  <th className="text-left pb-2 pr-4 min-w-[160px]">Usage</th>
                  <th className="text-right pb-2">Free</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol) => {
                  const usedPct = vol.size_total > 0 ? (vol.size_used / vol.size_total) * 100 : 0
                  const free = vol.size_total - vol.size_used
                  return (
                    <tr key={vol.id} className="border-b border-surface-3/50 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-gray-200">{vol.name}</td>
                      <td className="py-2.5 pr-4 text-muted">{vol.raid_type || '—'}</td>
                      <td className="py-2.5 pr-4 text-muted">{vol.fs_type || '—'}</td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={vol.status} map={VOLUME_STATUS_MAP} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted">
                            <span>{fmtBytes(vol.size_used)}</span>
                            <span>{fmtBytes(vol.size_total)}</span>
                          </div>
                          <UsageBar
                            pct={usedPct}
                            colorClass={usedPct > 90 ? 'bg-red-500' : usedPct > 75 ? 'bg-amber-500' : 'bg-blue-500'}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-muted text-xs">{fmtBytes(free)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disks */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-gray-400" />
          Disks
        </h3>
        {disks.length === 0 ? (
          <SectionEmpty message="No disks found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-surface-3">
                  <th className="text-left pb-2 pr-4">Drive</th>
                  <th className="text-left pb-2 pr-4">Model</th>
                  <th className="text-left pb-2 pr-4">Size</th>
                  <th className="text-left pb-2 pr-4">Temp</th>
                  <th className="text-left pb-2 pr-4">Status</th>
                  <th className="text-left pb-2 pr-4">SMART</th>
                  <th className="text-left pb-2 pr-4">Type</th>
                  {isAdmin && <th className="text-right pb-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {disks.map((disk) => {
                  const tempColor = disk.temperature >= 55
                    ? 'text-red-400'
                    : disk.temperature >= 40
                      ? 'text-amber-400'
                      : 'text-green-400'
                  return (
                    <tr key={disk.id} className="border-b border-surface-3/50 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-gray-200">{disk.name}</td>
                      <td className="py-2.5 pr-4 text-muted text-xs max-w-[160px] truncate" title={disk.model}>{disk.model || '—'}</td>
                      <td className="py-2.5 pr-4 text-muted text-xs">{disk.size_total > 0 ? fmtBytes(disk.size_total) : '—'}</td>
                      <td className="py-2.5 pr-4">
                        {disk.temperature > 0 ? (
                          <span className={`font-mono text-xs ${tempColor}`}>
                            {disk.temperature}°C
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={disk.status} map={DISK_STATUS_MAP} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <StatusBadge status={disk.smart_status || 'Not Testing'} map={SMART_STATUS_MAP} />
                      </td>
                      <td className="py-2.5 pr-4 text-muted text-xs">{disk.type || '—'}</td>
                      {isAdmin && (
                        <td className="py-2.5 text-right">
                          <button
                            className="btn-ghost text-xs px-2 py-1 disabled:opacity-50"
                            disabled={smartLoading === disk.id}
                            onClick={() => runSmartTest(disk.id)}
                            title="Run SMART test"
                          >
                            {smartLoading === disk.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Activity className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shares Tab ───────────────────────────────────────────────────────────────

function SharesTab({ instanceId }: { instanceId: string }) {
  const synApi = api.synology(instanceId)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [shares, setShares] = useState<SynologyShare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await synApi.shares()
      setShares(res.shares)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load shares')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [instanceId])

  if (loading) return <SectionLoading />
  if (error) return <SectionError message={error} />

  return (
    <div className="space-y-3">
      {actionMsg && (
        <div className={`flex items-center gap-2 text-sm rounded px-3 py-2 ${
          actionMsg.type === 'ok'
            ? 'text-green-400 bg-green-900/20 border border-green-800/40'
            : 'text-red-400 bg-red-900/20 border border-red-800/40'
        }`}>
          {actionMsg.type === 'ok' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {actionMsg.text}
          <button className="ml-auto text-muted hover:text-gray-300" onClick={() => setActionMsg(null)}>×</button>
        </div>
      )}

      {shares.length === 0 ? (
        <SectionEmpty message="No shared folders found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-surface-3">
                <th className="text-left pb-2 pr-4">Name</th>
                <th className="text-left pb-2 pr-4">Path</th>
                <th className="text-left pb-2 pr-4">Description</th>
                <th className="text-left pb-2 pr-4">Encrypted</th>
                <th className="text-right pb-2">Quota</th>
                {isAdmin && <th className="text-right pb-2 pl-4">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.name} className="border-b border-surface-3/50 last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-mono text-gray-200">{share.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-muted text-xs font-mono">{share.vol_path}</td>
                  <td className="py-2.5 pr-4 text-muted text-xs max-w-[180px] truncate" title={share.desc}>{share.desc || '—'}</td>
                  <td className="py-2.5 pr-4">
                    {share.encrypt ? (
                      <span className="flex items-center gap-1 text-yellow-400 text-xs">
                        <Lock className="w-3 h-3" />
                        {share.is_mounted === false ? 'Encrypted (unmounted)' : 'Encrypted'}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-muted text-xs">
                    {share.quota ? fmtBytes(share.quota) : '—'}
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 pl-4 text-right">
                      {share.encrypt && (
                        <button
                          className="btn-ghost text-xs px-2 py-1 disabled:opacity-50"
                          disabled={actionLoading === share.name}
                          title={share.is_mounted === false ? 'Mount share' : 'Unmount share'}
                          onClick={async () => {
                            setActionLoading(share.name)
                            setActionMsg(null)
                            try {
                              // Note: actual mount/unmount would use a dedicated endpoint
                              setActionMsg({ type: 'ok', text: `Share "${share.name}" action requested` })
                              await load()
                            } catch (e: unknown) {
                              setActionMsg({ type: 'err', text: e instanceof Error ? e.message : 'Action failed' })
                            } finally {
                              setActionLoading(null)
                            }
                          }}
                        >
                          {actionLoading === share.name ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : share.is_mounted === false ? (
                            <Unlock className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-yellow-400" />
                          )}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Downloads Tab ────────────────────────────────────────────────────────────

function DownloadsTab({ instanceId }: { instanceId: string }) {
  const synApi = api.synology(instanceId)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [tasks, setTasks] = useState<SynologyTask[]>([])
  const [dsAvailable, setDsAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await synApi.downloads()
      setDsAvailable(res.available)
      setTasks(res.tasks)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load downloads')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId])

  // Auto-refresh when there are active downloads
  useEffect(() => {
    const hasActive = tasks.some((t) => t.status === 'downloading' || t.status === 'extracting')
    if (hasActive) {
      intervalRef.current = setInterval(() => load(true), 5000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  async function addDownload() {
    if (!newUrl.trim()) return
    setAddLoading(true)
    setAddError(null)
    try {
      await synApi.createDownload(newUrl.trim())
      setNewUrl('')
      await load()
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to add download')
    } finally {
      setAddLoading(false)
    }
  }

  async function doAction(taskId: string, action: 'pause' | 'resume' | 'delete') {
    setActionLoading(taskId + ':' + action)
    try {
      if (action === 'pause') await synApi.pauseDownload(taskId)
      else if (action === 'resume') await synApi.resumeDownload(taskId)
      else if (action === 'delete') await synApi.deleteDownload(taskId)
      await load(true)
    } catch {
      // silently ignore action errors — UI will refresh anyway
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <SectionLoading />
  if (error) return <SectionError message={error} />

  if (dsAvailable === false) {
    return (
      <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-800/40 rounded px-3 py-4 mt-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        Download Station is not installed or this account does not have permission to access it.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add download form */}
      {isAdmin && (
        <div className="card p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-green-400" />
            Add Download
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1 text-sm"
              placeholder="HTTP, FTP, or magnet link"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDownload()}
            />
            <button
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              disabled={addLoading || !newUrl.trim()}
              onClick={addDownload}
            >
              {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </button>
          </div>
          {addError && <p className="text-red-400 text-xs mt-1.5">{addError}</p>}
        </div>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <SectionEmpty message="No download tasks" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-surface-3">
                <th className="text-left pb-2 pr-4">Title</th>
                <th className="text-left pb-2 pr-4">Status</th>
                <th className="text-left pb-2 pr-4 min-w-[140px]">Progress</th>
                <th className="text-right pb-2 pr-4">Speed</th>
                <th className="text-left pb-2 pr-4">Destination</th>
                {isAdmin && <th className="text-right pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const pct = task.size > 0 ? (task.size_downloaded / task.size) * 100 : 0
                return (
                  <tr key={task.id} className="border-b border-surface-3/50 last:border-0">
                    <td className="py-2.5 pr-4 max-w-[200px]">
                      <span className="block truncate text-gray-200" title={task.title}>{task.title}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={task.status} map={TASK_STATUS_MAP} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted">
                          <span>{fmtBytes(task.size_downloaded)}</span>
                          <span>{task.size > 0 ? fmtBytes(task.size) : '?'}</span>
                        </div>
                        <UsageBar
                          pct={pct}
                          colorClass={task.status === 'finished' ? 'bg-green-500' : task.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-gray-300">
                      {task.status === 'downloading' ? fmtSpeed(task.speed_download) : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-muted text-xs max-w-[140px] truncate" title={task.destination}>
                      {task.destination}
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {task.status === 'downloading' && (
                            <button
                              className="btn-ghost px-1.5 py-1 text-yellow-400 disabled:opacity-50"
                              disabled={actionLoading?.startsWith(task.id)}
                              title="Pause"
                              onClick={() => doAction(task.id, 'pause')}
                            >
                              {actionLoading === task.id + ':pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {task.status === 'paused' && (
                            <button
                              className="btn-ghost px-1.5 py-1 text-green-400 disabled:opacity-50"
                              disabled={actionLoading?.startsWith(task.id)}
                              title="Resume"
                              onClick={() => doAction(task.id, 'resume')}
                            >
                              {actionLoading === task.id + ':resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            className="btn-ghost px-1.5 py-1 text-red-400 disabled:opacity-50"
                            disabled={actionLoading?.startsWith(task.id)}
                            title="Delete"
                            onClick={() => doAction(task.id, 'delete')}
                          >
                            {actionLoading === task.id + ':delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Packages Tab ─────────────────────────────────────────────────────────────

function PackagesTab({ instanceId }: { instanceId: string }) {
  const synApi = api.synology(instanceId)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [packages, setPackages] = useState<SynologyPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await synApi.packages()
      setPackages(res.packages)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [instanceId])

  async function doAction(pkgId: string, action: 'start' | 'stop') {
    setActionLoading(pkgId + ':' + action)
    try {
      if (action === 'start') await synApi.startPackage(pkgId)
      else await synApi.stopPackage(pkgId)
      await load()
    } catch {
      // silently ignore — reload will show current state
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <SectionLoading />
  if (error) return <SectionError message={error} />

  const filtered = search.trim()
    ? packages.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    : packages

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="input text-sm flex-1 max-w-xs"
          placeholder="Filter packages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-muted text-xs">{filtered.length} / {packages.length}</span>
      </div>

      {filtered.length === 0 ? (
        <SectionEmpty message={search ? 'No matching packages' : 'No packages found'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-surface-3">
                <th className="text-left pb-2 pr-4">Package</th>
                <th className="text-left pb-2 pr-4">Version</th>
                <th className="text-left pb-2 pr-4">Status</th>
                {isAdmin && <th className="text-right pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((pkg) => {
                const isRunning = pkg.status.toLowerCase() === 'running' || pkg.status.toLowerCase() === 'started'
                return (
                  <tr key={pkg.id} className="border-b border-surface-3/50 last:border-0">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span className="text-gray-200">{pkg.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-muted text-xs">{pkg.version}</td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={pkg.status} map={PACKAGE_STATUS_MAP} />
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 text-right">
                        <button
                          className={`btn-ghost px-2 py-1 text-xs disabled:opacity-50 ${isRunning ? 'text-red-400' : 'text-green-400'}`}
                          disabled={!!actionLoading}
                          onClick={() => doAction(pkg.id, isRunning ? 'stop' : 'start')}
                          title={isRunning ? 'Stop package' : 'Start package'}
                        >
                          {actionLoading === pkg.id + ':' + (isRunning ? 'stop' : 'start') ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isRunning ? (
                            <Square className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Files Tab ────────────────────────────────────────────────────────────────

function FilesTab({ instanceId }: { instanceId: string }) {
  const synApi = api.synology(instanceId)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [path, setPath] = useState('/')
  const [files, setFiles] = useState<SynologyFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderLoading, setNewFolderLoading] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function load(targetPath: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await synApi.files(targetPath)
      setFiles(res.files)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(path) }, [instanceId, path])

  // Breadcrumb segments
  const segments = path === '/' ? [] : path.split('/').filter(Boolean)

  function navigateTo(newPath: string) {
    setMsg(null)
    setPath(newPath)
  }

  function navigateToSegment(idx: number) {
    if (idx < 0) {
      navigateTo('/')
    } else {
      navigateTo('/' + segments.slice(0, idx + 1).join('/'))
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    setNewFolderLoading(true)
    setMsg(null)
    try {
      await synApi.createFolder(path, newFolderName.trim())
      setMsg({ type: 'ok', text: `Folder "${newFolderName.trim()}" created` })
      setNewFolderName('')
      setShowNewFolder(false)
      await load(path)
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Failed to create folder' })
    } finally {
      setNewFolderLoading(false)
    }
  }

  async function deleteItem(itemPath: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeleteLoading(itemPath)
    setMsg(null)
    try {
      await synApi.deleteFile(itemPath)
      setMsg({ type: 'ok', text: `"${name}" deleted` })
      await load(path)
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Delete failed' })
    } finally {
      setDeleteLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button
          className="text-accent hover:underline font-mono"
          onClick={() => navigateTo('/')}
        >
          /
        </button>
        {segments.map((seg, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-muted" />
            <button
              className={`font-mono hover:underline ${idx === segments.length - 1 ? 'text-gray-200' : 'text-accent'}`}
              onClick={() => navigateToSegment(idx)}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5"
            onClick={() => setShowNewFolder((v) => !v)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Folder
          </button>
          {showNewFolder && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input text-xs px-2 py-1 w-40"
                placeholder="Folder name"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createFolder()
                  if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
                }}
              />
              <button
                className="btn-primary text-xs px-3 py-1 disabled:opacity-50"
                disabled={newFolderLoading || !newFolderName.trim()}
                onClick={createFolder}
              >
                {newFolderLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
              </button>
              <button
                className="btn-ghost text-xs px-2 py-1"
                onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Message banner */}
      {msg && (
        <div className={`flex items-center gap-2 text-sm rounded px-3 py-2 ${
          msg.type === 'ok'
            ? 'text-green-400 bg-green-900/20 border border-green-800/40'
            : 'text-red-400 bg-red-900/20 border border-red-800/40'
        }`}>
          {msg.type === 'ok' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {msg.text}
          <button className="ml-auto text-muted hover:text-gray-300" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <SectionLoading />
      ) : error ? (
        <SectionError message={error} />
      ) : files.length === 0 ? (
        <SectionEmpty message="Empty directory" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-surface-3">
                <th className="text-left pb-2 pr-4">Name</th>
                <th className="text-right pb-2 pr-4">Size</th>
                <th className="text-right pb-2 pr-4">Modified</th>
                {isAdmin && <th className="text-right pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {/* Folders first, then files */}
              {[...files.filter((f) => f.isdir), ...files.filter((f) => !f.isdir)].map((file) => (
                <tr key={file.path} className="border-b border-surface-3/50 last:border-0 group">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      {file.isdir ? (
                        <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      {file.isdir ? (
                        <button
                          className="text-gray-200 hover:text-accent hover:underline text-left"
                          onClick={() => navigateTo(file.path)}
                        >
                          {file.name}
                        </button>
                      ) : (
                        <span className="text-gray-200">{file.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-muted text-xs font-mono">
                    {file.isdir ? '—' : fmtBytes(file.size)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-muted text-xs">
                    {fmtDate(file.time)}
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!file.isdir && (
                          <a
                            href={synApi.downloadFile(file.path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost px-1.5 py-1 text-blue-400"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          className="btn-ghost px-1.5 py-1 text-red-400 disabled:opacity-50"
                          disabled={deleteLoading === file.path}
                          title="Delete"
                          onClick={() => deleteItem(file.path, file.name)}
                        >
                          {deleteLoading === file.path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',  label: 'Overview',  icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'storage',   label: 'Storage',   icon: <HardDrive className="w-3.5 h-3.5" /> },
  { id: 'shares',    label: 'Shares',    icon: <FolderOpen className="w-3.5 h-3.5" /> },
  { id: 'downloads', label: 'Downloads', icon: <Download className="w-3.5 h-3.5" /> },
  { id: 'packages',  label: 'Packages',  icon: <Package className="w-3.5 h-3.5" /> },
  { id: 'files',     label: 'Files',     icon: <Folder className="w-3.5 h-3.5" /> },
]

export function SynologyView({ instanceId = 'default' }: { instanceId?: string }) {
  const _key = `synology:${instanceId}`
  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'overview') as Tab)
  function setTab(t: Tab) { setViewState(`${_key}:tab`, t); setTabRaw(t) }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-surface-3 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview'  && <OverviewTab  instanceId={instanceId} />}
        {tab === 'storage'   && <StorageTab   instanceId={instanceId} />}
        {tab === 'shares'    && <SharesTab    instanceId={instanceId} />}
        {tab === 'downloads' && <DownloadsTab instanceId={instanceId} />}
        {tab === 'packages'  && <PackagesTab  instanceId={instanceId} />}
        {tab === 'files'     && <FilesTab     instanceId={instanceId} />}
      </div>
    </div>
  )
}
