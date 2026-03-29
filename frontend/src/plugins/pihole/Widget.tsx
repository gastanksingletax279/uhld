import type { PluginSummary } from '../../api/client'

interface PiHoleSummary extends PluginSummary {
  blocking: boolean
  dns_queries_today: number
  ads_blocked_today: number
  ads_percentage_today: number
  domains_on_blocklist: number
}

export function PiHoleWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as PiHoleSummary

  return (
    <div className="space-y-2.5 text-xs">
      {/* Blocking status */}
      <div className="flex items-center justify-between">
        <span className="text-muted">Blocking</span>
        <span className={s.blocking ? 'badge-ok' : 'badge-error'}>
          {s.blocking ? 'active' : 'disabled'}
        </span>
      </div>

      {/* Query counts */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Queries" value={fmt(s.dns_queries_today)} ok />
        <Stat label="Blocked" value={fmt(s.ads_blocked_today)} ok={s.blocking} />
      </div>

      {/* Block % bar */}
      <UsageBar
        label="Block rate"
        pct={s.ads_percentage_today}
        detail={`${s.ads_percentage_today?.toFixed(1)}%`}
      />

      {/* Blocklist */}
      <div className="flex justify-between text-muted">
        <span>Blocklist</span>
        <span className="font-mono text-gray-300">{fmt(s.domains_on_blocklist)}</span>
      </div>
    </div>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n ?? 0)
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface-3 rounded p-2">
      <div className="text-muted mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${ok ? 'text-gray-100' : 'text-warning'}`}>{value}</div>
    </div>
  )
}

function UsageBar({ label, pct, detail }: { label: string; pct: number; detail?: string }) {
  const color = pct > 85 ? 'bg-danger' : pct > 65 ? 'bg-warning' : 'bg-accent-dim'
  return (
    <div>
      <div className="flex justify-between text-muted mb-1">
        <span>{label}</span>
        <span className="font-mono">{detail ?? `${pct}%`}</span>
      </div>
      <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}
