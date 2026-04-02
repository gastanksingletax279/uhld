import type { PluginSummary } from '../../api/client'

interface K8sSummary extends PluginSummary {
  nodes_ready: number
  nodes_total: number
  pods_running: number
  pods_total: number
  metallb_present?: boolean
  metallb_pools?: number
  etcd_present?: boolean
  etcd_healthy_members?: number
  etcd_total_members?: number
}

export function KubernetesWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as K8sSummary

  return (
    <div className="space-y-2.5 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Nodes" value={`${s.nodes_ready} / ${s.nodes_total}`} ok={s.nodes_ready === s.nodes_total} />
        <StatCard label="Pods" value={`${s.pods_running} / ${s.pods_total}`} ok={s.pods_running > 0} />
      </div>
      {(s.metallb_present || s.etcd_present) && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="MetalLB"
            value={s.metallb_present ? `${s.metallb_pools ?? 0} pools` : 'not detected'}
            ok={Boolean(s.metallb_present)}
          />
          <StatCard
            label="etcd"
            value={s.etcd_present ? `${s.etcd_healthy_members ?? 0} / ${s.etcd_total_members ?? 0}` : 'not detected'}
            ok={!s.etcd_present || (s.etcd_healthy_members ?? 0) === (s.etcd_total_members ?? 0)}
          />
        </div>
      )}
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
