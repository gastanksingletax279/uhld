import { useEffect, useState } from 'react'
import { api, TailscaleDevice } from '../../api/client'
import { RefreshCw, Network, Loader2, AlertCircle, Copy, Check, ArrowUpCircle } from 'lucide-react'

type SortKey = 'hostname' | 'os' | 'user' | 'lastSeen' | 'online' | 'clientVersion'
type SortDir = 'asc' | 'desc'

export function TailscaleView() {
  const [devices, setDevices] = useState<TailscaleDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('hostname')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.tailscale.devices()
      setDevices(data.devices ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load Tailscale devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const online = devices.filter((d) => d.online).length
  const total = devices.length

  const sorted = [...devices].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'hostname': {
        const na = a.name ? a.name.split('.')[0] : a.hostname
        const nb = b.name ? b.name.split('.')[0] : b.hostname
        cmp = na.localeCompare(nb)
        break
      }
      case 'os':            cmp = a.os.localeCompare(b.os); break
      case 'user':          cmp = a.user.localeCompare(b.user); break
      case 'lastSeen':      cmp = a.lastSeen.localeCompare(b.lastSeen); break
      case 'online':        cmp = Number(b.online) - Number(a.online); break
      case 'clientVersion': cmp = a.clientVersion.localeCompare(b.clientVersion); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Tailscale</h2>
          {!loading && (
            <span className="text-xs text-muted">
              <span className="text-green-400 font-semibold">{online}</span>
              <span className="mx-1">/</span>
              <span>{total}</span>
              <span className="ml-1">online</span>
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : devices.length === 0 ? (
        <div className="text-sm text-muted text-center py-12">No devices found in this tailnet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-4 text-muted">
                <Th label="Hostname" col="hostname" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <Th label="OS" col="os" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <Th label="User" col="user" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <Th label="Version" col="clientVersion" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <Th label="Last Seen" col="lastSeen" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <Th label="Status" col="online" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((device) => (
                <DeviceRow key={device.id} device={device} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DeviceRow({ device }: { device: TailscaleDevice }) {
  const ipv4 = device.addresses?.find((a) => !a.includes(':')) ?? device.addresses?.[0] ?? '—'
  const lastSeen = device.online ? 'now' : fmtRelativeTime(device.lastSeen)
  const [copied, setCopied] = useState(false)

  function copyIp() {
    if (ipv4 === '—') return
    navigator.clipboard.writeText(ipv4).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // `name` is the MagicDNS FQDN (e.g. "pangolin.tail1234.ts.net") — the first
  // segment is the unique admin-console name and reflects any renames.
  // `hostname` is the raw OS hostname which can be "localhost" on containers/VMs.
  const displayName = device.name ? device.name.split('.')[0] : device.hostname
  const showOsHostname = device.hostname && device.hostname !== displayName

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2">
        <div className="font-medium text-gray-200">{displayName}</div>
        {showOsHostname && <div className="text-muted text-[10px] font-mono">{device.hostname}</div>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-muted">{ipv4}</span>
          {ipv4 !== '—' && (
            <button
              onClick={copyIp}
              title="Copy IP"
              className="text-muted hover:text-gray-300 transition-colors flex-shrink-0"
            >
              {copied
                ? <Check className="w-3 h-3 text-green-400" />
                : <Copy className="w-3 h-3" />
              }
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-muted capitalize">{device.os || '—'}</td>
      <td className="px-3 py-2 text-muted truncate max-w-[140px]" title={device.user}>{device.user || '—'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-muted text-[11px]">{shortVersion(device.clientVersion)}</span>
          {device.updateAvailable && (
            <span title="Update available" className="text-yellow-400">
              <ArrowUpCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-muted whitespace-nowrap">{lastSeen}</td>
      <td className="px-3 py-2">
        {device.online
          ? <span className="badge-ok">online</span>
          : <span className="badge-muted">offline</span>
        }
      </td>
    </tr>
  )
}

function Th({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (col: SortKey) => void
}) {
  const active = col === sortKey
  return (
    <th
      className={`px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-gray-200 transition-colors ${active ? 'text-gray-200' : ''}`}
      onClick={() => onSort(col)}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function shortVersion(v: string): string {
  if (!v) return '—'
  // "1.56.1-t12345678-g1234567890ab" → "1.56.1"
  return v.split('-')[0] || v
}

function fmtRelativeTime(iso: string): string {
  if (!iso) return '—'
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (mins > 0) return `${mins}m ago`
    return 'just now'
  } catch {
    return iso
  }
}
