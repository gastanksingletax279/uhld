import { useEffect, useState } from 'react'
import { api, PiHoleStats, PiHoleQueryLogEntry } from '../../api/client'
import { RefreshCw, Shield, ShieldOff, Loader2, AlertCircle } from 'lucide-react'

type Tab = 'overview' | 'querylog'

export function PiHoleView() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<PiHoleStats | null>(null)
  const [querylog, setQuerylog] = useState<PiHoleQueryLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [logLoading, setLogLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)

  async function loadStats() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.pihole.stats()
      setStats(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load Pi-hole stats')
    } finally {
      setLoading(false)
    }
  }

  async function loadQueryLog() {
    setLogLoading(true)
    try {
      const data = await api.pihole.querylog(200)
      setQuerylog(data.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load query log')
    } finally {
      setLogLoading(false)
    }
  }

  async function refresh() {
    if (tab === 'overview') {
      await loadStats()
    } else {
      await loadQueryLog()
    }
  }

  useEffect(() => { loadStats() }, [])

  useEffect(() => {
    if (tab === 'querylog' && querylog.length === 0) {
      loadQueryLog()
    }
  }, [tab])

  async function toggleBlocking() {
    if (!stats) return
    setToggling(true)
    try {
      await api.pihole.setBlocking(!stats.blocking)
      await loadStats()
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

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Pi-hole</h2>
          {stats && (
            <span className={stats.blocking ? 'badge-ok' : 'badge-error'}>
              {stats.blocking ? 'blocking' : 'disabled'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <button
              onClick={toggleBlocking}
              disabled={toggling}
              className={
                stats.blocking
                  ? 'px-3 py-1.5 rounded text-sm bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/50'
                  : 'px-3 py-1.5 rounded text-sm bg-green-900/40 hover:bg-green-900/60 text-green-300 border border-green-800/50'
              }
            >
              {toggling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              ) : stats.blocking ? (
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
        ) : stats ? (
          <OverviewTab stats={stats} />
        ) : null
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

function OverviewTab({ stats }: { stats: PiHoleStats }) {
  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Queries Today" value={fmt(stats.dns_queries_today)} />
        <StatCard label="Blocked Today" value={fmt(stats.ads_blocked_today)} accent="text-yellow-400" />
        <StatCard label="Block Rate" value={`${stats.ads_percentage_today?.toFixed(1)}%`} accent="text-blue-400" />
        <StatCard label="Blocklist Domains" value={fmt(stats.domains_on_blocklist)} accent="text-gray-400" />
      </div>

      {/* Block rate bar */}
      <div className="card p-4">
        <div className="text-xs text-muted mb-2">Block Rate</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-surface-4 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-dim rounded-full transition-all"
              style={{ width: `${Math.min(stats.ads_percentage_today ?? 0, 100)}%` }}
            />
          </div>
          <span className="font-mono text-sm text-gray-300 w-14 text-right">
            {stats.ads_percentage_today?.toFixed(1)}%
          </span>
        </div>
      </div>
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

function QueryLogTab({ entries }: { entries: PiHoleQueryLogEntry[] }) {
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

function QueryLogRow({ entry }: { entry: PiHoleQueryLogEntry }) {
  // Time may be a Unix timestamp (v5 string number) or ISO string
  const ts = Number(entry.time)
  const timeStr = !isNaN(ts) && ts > 1_000_000_000
    ? new Date(ts * 1000).toLocaleTimeString()
    : entry.time

  const statusLower = (entry.status ?? '').toString().toLowerCase()
  const isBlocked = statusLower.includes('block') || statusLower === '1' || statusLower === '5' || statusLower === '6'

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">{timeStr}</td>
      <td className="px-3 py-1.5 font-mono text-gray-300">{entry.client || '—'}</td>
      <td className="px-3 py-1.5 text-gray-200 max-w-[280px] truncate" title={entry.domain}>
        {entry.domain || '—'}
      </td>
      <td className="px-3 py-1.5 text-muted">{entry.query_type || '—'}</td>
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
