import { AlertCircle } from 'lucide-react'
import { PluginIcon } from '../PluginIcon'
import type { PluginListItem, PluginSummary } from '../../api/client'

interface WidgetCardProps {
  plugin: PluginListItem
  summary: PluginSummary | undefined
  isMultiInstance?: boolean
  children?: React.ReactNode
}

export function WidgetCard({ plugin, summary, isMultiInstance = false, children }: WidgetCardProps) {
  const isError = !summary || summary.status === 'error'

  return (
    <div className="card flex flex-col" style={{ minHeight: 180 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-4">
        <PluginIcon name={plugin.icon} className="w-4 h-4 text-muted" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-gray-300 truncate block">{plugin.display_name}</span>
          {(plugin.instance_id !== 'default' || isMultiInstance) && (
            <span className="text-[10px] text-muted truncate block">
              {plugin.instance_label || plugin.instance_id}
            </span>
          )}
        </div>
        {!isError ? (
          <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" aria-label="OK" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-danger flex-shrink-0" aria-label="Error" />
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
