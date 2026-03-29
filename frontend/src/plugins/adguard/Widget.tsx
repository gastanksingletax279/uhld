import type { PluginSummary } from '../../api/client'

interface AdGuardSummary extends PluginSummary {
  protection_enabled: boolean
  dns_queries: number
  blocked_filtering: number
  blocked_pct: number
  avg_processing_ms: number
}

export function AdGuardWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as AdGuardSummary

  return (
    <div className="space-y-2.5 text-xs">
      {/* Status + protection badge */}
      <div className="flex items-center justify-between">
        <span className="text-muted">Protection</span>
        <span className={s.protection_enabled ? 'badge-ok' : 'badge-error'}>
          {s.protection_enabled ? 'enabled' : 'disabled'}
        </span>
      </div>

      {/* Query counts */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Queries" value={fmt(s.dns_queries)} ok />
        <Stat label="Blocked" value={fmt(s.blocked_filtering)} ok={s.protection_enabled} />
      </div>

      {/* Blocked % bar */}
      <UsageBar label="Block rate" pct={s.blocked_pct} detail={`${s.blocked_pct}%`} />

      {/* Avg latency */}
      <div className="flex justify-between text-muted">
        <span>Avg latency</span>
        <span className="font-mono text-gray-300">{s.avg_processing_ms} ms</span>
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
