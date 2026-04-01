import type { PluginSummary } from '../../api/client'

export function NetworkToolsWidget({ summary }: { summary: PluginSummary }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Available tools</span>
        <span className="font-mono text-gray-100">{String((summary.tools as unknown[] | undefined)?.length ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Speedtest runs</span>
        <span className="font-mono text-gray-100">{String(summary.speedtests ?? 0)}</span>
      </div>
    </div>
  )
}
