import type { PluginSummary } from '../../api/client'
import { PLUGIN_WIDGETS } from '../../plugins/registry'

interface Props {
  pluginId: string
  summary: PluginSummary | undefined
}

export function PluginWidget({ pluginId, summary }: Props) {
  if (!summary || summary.status === 'error') return null

  const Widget = PLUGIN_WIDGETS[pluginId]
  if (!Widget) return <GenericSummary summary={summary} />
  return <Widget summary={summary} />
}

function GenericSummary({ summary }: { summary: PluginSummary }) {
  const entries = Object.entries(summary).filter(
    ([k]) => !['plugin_id', 'status', 'message'].includes(k)
  )
  if (entries.length === 0) return <p className="text-xs text-muted">No data</p>
  return (
    <div className="space-y-1">
      {entries.slice(0, 6).map(([k, v]) => (
        <div key={k} className="flex justify-between text-xs gap-2">
          <span className="text-muted capitalize">{k.replace(/_/g, ' ')}</span>
          <span className="text-gray-200 font-mono truncate">{String(v)}</span>
        </div>
      ))}
    </div>
  )
}
