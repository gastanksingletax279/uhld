import { useEffect } from 'react'
import { usePluginStore } from '../store/pluginStore'
import { DashboardGrid } from '../components/Dashboard/DashboardGrid'
import { RefreshCw } from 'lucide-react'

export function DashboardPage() {
  const { fetchPlugins, fetchSummary, summaryLoading } = usePluginStore()

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted">Overview</h2>
        <button
          onClick={() => fetchSummary()}
          disabled={summaryLoading}
          className="btn-ghost text-xs gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <DashboardGrid />
    </div>
  )
}
