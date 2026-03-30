import type { PluginSummary } from '../../api/client'

interface DockerSummary extends PluginSummary {
  containers_running: number
  containers_total: number
}

export function DockerWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as DockerSummary
  const stopped = s.containers_total - s.containers_running

  return (
    <div className="space-y-2.5 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Running" value={s.containers_running} color="text-green-400" />
        <StatCard label="Stopped" value={stopped} color={stopped > 0 ? 'text-muted' : 'text-gray-300'} />
      </div>
      <div className="bg-surface-3 rounded p-2 flex items-center justify-between">
        <span className="text-muted">Total</span>
        <span className="font-mono font-semibold">{s.containers_total}</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface-3 rounded p-2">
      <div className="text-muted mb-0.5">{label}</div>
      <div className={`font-mono font-semibold text-base ${color}`}>{value}</div>
    </div>
  )
}
