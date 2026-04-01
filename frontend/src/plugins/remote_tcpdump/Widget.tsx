import type { PluginSummary } from '../../api/client'

export function RemoteTcpdumpWidget({ summary }: { summary: PluginSummary }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Captures</span>
        <span className="font-mono text-gray-100">{String(summary.captures ?? 0)}</span>
      </div>
      <div className="text-muted">On-demand tcpdump runs</div>
    </div>
  )
}
