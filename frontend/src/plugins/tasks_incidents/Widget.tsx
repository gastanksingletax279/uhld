import type { PluginSummary } from '../../api/client'

export function TasksIncidentsWidget({ summary }: { summary: PluginSummary }) {
  const byStatus = (summary.by_status as Record<string, number> | undefined) ?? {}
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Open</span>
        <span className="font-mono text-gray-100">{String(byStatus.open ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">In progress</span>
        <span className="font-mono text-gray-100">{String(byStatus['in-progress'] ?? 0)}</span>
      </div>
    </div>
  )
}
