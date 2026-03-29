import { useEffect, useState } from 'react'
import { usePluginStore } from '../store/pluginStore'
import { DashboardGrid } from '../components/Dashboard/DashboardGrid'
import { RefreshCw, LayoutGrid, Check } from 'lucide-react'

export function DashboardPage() {
  const { fetchPlugins, fetchSummary, summaryLoading } = usePluginStore()
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted">Overview</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className={editing ? 'btn-primary text-xs gap-1.5 py-1' : 'btn-ghost text-xs gap-1.5 py-1'}
            title={editing ? 'Done editing' : 'Edit layout'}
          >
            {editing ? (
              <><Check className="w-3.5 h-3.5" /> Done</>
            ) : (
              <><LayoutGrid className="w-3.5 h-3.5" /> Edit Layout</>
            )}
          </button>
          <button
            onClick={() => fetchSummary()}
            disabled={summaryLoading || editing}
            className="btn-ghost text-xs gap-1.5 py-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      {editing && (
        <p className="text-xs text-muted bg-surface-1 border border-surface-4 rounded px-3 py-2">
          Drag the <span className="text-gray-300">⠿</span> handle on any tile to reorder. Click <strong className="text-gray-300">Done</strong> when finished.
        </p>
      )}
      <DashboardGrid editing={editing} />
    </div>
  )
}
