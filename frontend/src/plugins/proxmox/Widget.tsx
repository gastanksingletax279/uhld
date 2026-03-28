import type { PluginSummary } from '../../api/client'

interface ProxmoxSummary extends PluginSummary {
  nodes_online: number
  nodes_total: number
  vms_running: number
  vms_total: number
  cpu_pct: number
  mem_used_gb: number
  mem_total_gb: number
}

interface Props {
  summary: PluginSummary
}

export function ProxmoxWidget({ summary }: Props) {
  const s = summary as ProxmoxSummary
  const memPct = s.mem_total_gb > 0 ? Math.round((s.mem_used_gb / s.mem_total_gb) * 100) : 0

  return (
    <div className="space-y-2.5 text-xs">
      {/* Nodes + VMs row */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Nodes" value={`${s.nodes_online} / ${s.nodes_total}`} ok={s.nodes_online === s.nodes_total} />
        <Stat label="VMs / CTs" value={`${s.vms_running} / ${s.vms_total}`} ok={s.vms_running > 0} />
      </div>

      {/* CPU bar */}
      <UsageBar label="CPU" pct={s.cpu_pct} />

      {/* RAM bar */}
      <UsageBar
        label="RAM"
        pct={memPct}
        detail={`${s.mem_used_gb} / ${s.mem_total_gb} GB`}
      />
    </div>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface-3 rounded p-2">
      <div className="text-muted mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${ok ? 'text-gray-100' : 'text-warning'}`}>
        {value}
      </div>
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
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
