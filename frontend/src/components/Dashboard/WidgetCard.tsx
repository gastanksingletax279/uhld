import { AlertCircle } from 'lucide-react'
import { PluginIcon } from '../PluginIcon'
import type { PluginListItem, PluginSummary } from '../../api/client'

interface WidgetCardProps {
  plugin: PluginListItem
  summary: PluginSummary | undefined
  children?: React.ReactNode
}

export function WidgetCard({ plugin, summary, children }: WidgetCardProps) {
  const isError = !summary || summary.status === 'error'

  return (
    <div className="card flex flex-col" style={{ minHeight: 180 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-4">
        <PluginIcon name={plugin.icon} className="w-4 h-4 text-muted" />
        <span className="text-xs font-semibold text-gray-300 flex-1 truncate">{plugin.display_name}</span>
        {!isError ? (
          <span className="w-1.5 h-1.5 rounded-full bg-success" aria-label="OK" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-danger" aria-label="Error" />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-3">
        {isError ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <AlertCircle className="w-6 h-6 text-danger/60" />
            <p className="text-xs text-muted">
              {String(summary?.message ?? 'Plugin unreachable')}
            </p>
          </div>
        ) : (
          <>{children}</>
        )}
      </div>
    </div>
  )
}
