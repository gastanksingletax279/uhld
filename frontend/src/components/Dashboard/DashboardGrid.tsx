import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePluginStore } from '../../store/pluginStore'
import { WidgetCard } from './WidgetCard'
import { PluginWidget } from './PluginWidget'
import { Loader2 } from 'lucide-react'

export function DashboardGrid() {
  const { plugins, summaries, fetchSummary, summaryLoading } = usePluginStore()
  const enabled = plugins.filter((p) => p.enabled)

  useEffect(() => {
    if (enabled.length > 0) {
      fetchSummary()
    }
  }, [plugins.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (summaryLoading && summaries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading dashboard…</span>
      </div>
    )
  }

  if (enabled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <p className="text-sm text-muted">No plugins enabled yet.</p>
        <Link to="/settings/plugins" className="btn-primary text-sm px-4 py-2">
          Enable plugins
        </Link>
      </div>
    )
  }

  const summaryMap = Object.fromEntries(summaries.map((s) => [s.plugin_id, s]))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {enabled.map((plugin) => (
        <Link key={plugin.plugin_id} to={`/plugins/${plugin.plugin_id}`} className="block hover:opacity-90 transition-opacity">
          <WidgetCard plugin={plugin} summary={summaryMap[plugin.plugin_id]}>
            <PluginWidget pluginId={plugin.plugin_id} summary={summaryMap[plugin.plugin_id]} />
          </WidgetCard>
        </Link>
      ))}
    </div>
  )
}
