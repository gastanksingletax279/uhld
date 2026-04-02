import type { PluginSummary } from '../../api/client'
import { Activity, Database, Film } from 'lucide-react'

interface PlexSummary extends PluginSummary {
  server_online: boolean
  version: string
  active_streams: number
  active_transcodes: number
  library_count: number
  total_items: number
  message?: string
}

export function PlexWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as PlexSummary

  // Handle offline or error states
  if (s.status === 'error' || s.server_online === false) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <div className="text-red-400 mb-1">Server Offline</div>
          <div className="text-xs">{(s.message as string) || 'Unable to connect'}</div>
        </div>
      </div>
    )
  }

  // Provide defaults for all numeric values
  const activeStreams = s.active_streams ?? 0
  const activeTranscodes = s.active_transcodes ?? 0
  const libraryCount = s.library_count ?? 0
  const totalItems = s.total_items ?? 0
  const version = s.version ?? 'unknown'

  return (
    <div className="space-y-2.5 text-xs">
      {/* Status badge and version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-muted">Online</span>
        </div>
        <span className="text-muted text-[10px]">v{version}</span>
      </div>

      {/* Active streams */}
      <div className="bg-surface-3 rounded p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-muted">Active Streams</span>
          </div>
          {activeStreams > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-semibold">LIVE</span>
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono font-semibold text-lg">{activeStreams}</span>
          {activeTranscodes > 0 && (
            <span className="text-orange-400 text-[10px]">
              {activeTranscodes} transcoding
            </span>
          )}
        </div>
      </div>

      {/* Libraries summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-3 rounded p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Database className="w-3 h-3 text-purple-400" />
            <span className="text-muted">Libraries</span>
          </div>
          <div className="font-mono font-semibold">{libraryCount}</div>
        </div>
        <div className="bg-surface-3 rounded p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Film className="w-3 h-3 text-pink-400" />
            <span className="text-muted">Items</span>
          </div>
          <div className="font-mono font-semibold">
            {totalItems.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}
