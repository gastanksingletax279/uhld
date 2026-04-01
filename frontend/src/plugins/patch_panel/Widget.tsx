import type { PluginSummary } from '../../api/client'

export function PatchPanelWidget({ summary }: { summary: PluginSummary }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Links</span>
        <span className="font-mono text-gray-100">{String(summary.total_links ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Panels</span>
        <span className="font-mono text-gray-100">{String(summary.panels ?? 0)}</span>
      </div>
    </div>
  )
}
