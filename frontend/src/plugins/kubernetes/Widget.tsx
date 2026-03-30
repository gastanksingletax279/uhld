import type { PluginSummary } from '../../api/client'

interface K8sSummary extends PluginSummary {
  nodes_ready: number
  nodes_total: number
  pods_running: number
  pods_total: number
}

export function KubernetesWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as K8sSummary

  return (
    <div className="space-y-2.5 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Nodes" value={`${s.nodes_ready} / ${s.nodes_total}`} ok={s.nodes_ready === s.nodes_total} />
        <StatCard label="Pods" value={`${s.pods_running} / ${s.pods_total}`} ok={s.pods_running > 0} />
      </div>
    </div>
  )
}

function StatCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface-3 rounded p-2">
      <div className="text-muted mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${ok ? 'text-gray-100' : 'text-warning'}`}>{value}</div>
    </div>
  )
}
