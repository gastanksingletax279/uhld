import { useEffect, useState } from 'react'
import { api, AdGuardStats, AdGuardStatus, AdGuardQueryLogEntry } from '../../api/client'
import { RefreshCw, Shield, ShieldOff, Loader2, AlertCircle } from 'lucide-react'

type Tab = 'overview' | 'querylog'

export function AdGuardView() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<AdGuardStats | null>(null)
  const [status, setStatus] = useState<AdGuardStatus | null>(null)
  const [querylog, setQuerylog] = useState<AdGuardQueryLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [logLoading, setLogLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)

  async function loadOverview() {
    setLoading(true)
    setError(null)
    try {
      const [statsData, statusData] = await Promise.all([
        api.adguard.stats(),
        api.adguard.status(),
      ])
      setStats(statsData)
      setStatus(statusData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load AdGuard data')
    } finally {
      setLoading(false)
    }
  }

  async function loadQueryLog() {
    setLogLoading(true)
    try {
      const data = await api.adguard.querylog(200)
      setQuerylog(data.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load query log')
    } finally {
      setLogLoading(false)
    }
  }

  async function refresh() {
    if (tab === 'overview') {
      await loadOverview()
    } else {
      await loadQueryLog()
    }
  }

  useEffect(() => { loadOverview() }, [])

  useEffect(() => {
    if (tab === 'querylog' && querylog.length === 0) {
      loadQueryLog()
    }
  }, [tab])

  async function toggleProtection() {
    if (!status) return
    setToggling(true)
    try {
      await api.adguard.setProtection(!status.protection_enabled)
      await loadOverview()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setToggling(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'querylog', label: 'Query Log' },
  ]

  // Compute 24h totals from hourly arrays
  const dnsTotal = stats ? stats.dns_queries.reduce((a, b) => a + b, 0) : 0
  const blockedTotal = stats ? stats.blocked_filtering.reduce((a, b) => a + b, 0) : 0
  const blockedPct = dnsTotal > 0 ? ((blockedTotal / dnsTotal) * 100).toFixed(1) : '0.0'
  const avgMs = stats ? (stats.avg_processing_time * 1000).toFixed(2) : '0.00'

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">AdGuard Home</h2>
          {status && (
            <span className={status.protection_enabled ? 'badge-ok' : 'badge-error'}>
              {status.protection_enabled ? 'protection on' : 'protection off'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <button
              onClick={toggleProtection}
              disabled={toggling}
              className={
                status.protection_enabled
                  ? 'px-3 py-1.5 rounded text-sm bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/50'
                  : 'px-3 py-1.5 rounded text-sm bg-green-900/40 hover:bg-green-900/60 text-green-300 border border-green-800/50'
              }
            >
              {toggling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              ) : status.protection_enabled ? (
                <><ShieldOff className="w-3.5 h-3.5 inline mr-1" />Disable</>
              ) : (
                <><Shield className="w-3.5 h-3.5 inline mr-1" />Enable</>
              )}
            </button>
          )}
          <button onClick={refresh} disabled={loading || logLoading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || logLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
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

      {tab === 'overview' && (
        loading ? (
          <LoadingSpinner />
        ) : (
          <OverviewTab
            dnsTotal={dnsTotal}
            blockedTotal={blockedTotal}
            blockedPct={blockedPct}
            avgMs={avgMs}
            status={status}
          />
        )
      )}

      {tab === 'querylog' && (
        logLoading ? (
          <LoadingSpinner />
        ) : (
          <QueryLogTab entries={querylog} />
        )
      )}
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  dnsTotal,
  blockedTotal,
  blockedPct,
  avgMs,
  status,
}: {
  dnsTotal: number
  blockedTotal: number
  blockedPct: string
  avgMs: string
  status: AdGuardStatus | null
}) {
  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="DNS Queries (24h)" value={fmt(dnsTotal)} />
        <StatCard label="Blocked (24h)" value={fmt(blockedTotal)} accent="text-yellow-400" />
        <StatCard label="Block Rate" value={`${blockedPct}%`} accent="text-blue-400" />
        <StatCard label="Avg Latency" value={`${avgMs} ms`} />
      </div>

      {/* Block rate bar */}
      <div className="card p-4">
        <div className="text-xs text-muted mb-2">Block Rate</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-surface-4 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-dim rounded-full transition-all"
              style={{ width: `${Math.min(parseFloat(blockedPct), 100)}%` }}
            />
          </div>
          <span className="font-mono text-sm text-gray-300 w-12 text-right">{blockedPct}%</span>
        </div>
      </div>

      {/* Status info */}
      {status && (
        <div className="card p-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted mb-0.5">Version</div>
            <div className="font-mono text-gray-200">{status.version || '—'}</div>
          </div>
          <div>
            <div className="text-muted mb-0.5">Running</div>
            <div className={status.running ? 'text-green-400' : 'text-red-400'}>
              {status.running ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent = 'text-gray-100' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-xl font-mono font-semibold ${accent}`}>{value}</div>
    </div>
  )
}

// ── Query log tab ─────────────────────────────────────────────────────────────

function QueryLogTab({ entries }: { entries: AdGuardQueryLogEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-sm text-muted text-center py-12">No query log entries.</div>
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-left font-medium">Client</th>
            <th className="px-3 py-2 text-left font-medium">Domain</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <QueryLogRow key={i} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QueryLogRow({ entry }: { entry: AdGuardQueryLogEntry }) {
  const time = new Date(entry.time).toLocaleTimeString()
  const isBlocked = entry.reason?.includes('FilteredBlock') || entry.status === 'filtered'

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">{time}</td>
      <td className="px-3 py-1.5 font-mono text-gray-300">{entry.client || '—'}</td>
      <td className="px-3 py-1.5 text-gray-200 max-w-[280px] truncate" title={entry.question?.name}>
        {entry.question?.name || '—'}
      </td>
      <td className="px-3 py-1.5 text-muted">{entry.question?.type || '—'}</td>
      <td className="px-3 py-1.5">
        {isBlocked ? (
          <span className="badge-error">blocked</span>
        ) : (
          <span className="badge-ok">allowed</span>
        )}
      </td>
    </tr>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading…
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n ?? 0)
}
