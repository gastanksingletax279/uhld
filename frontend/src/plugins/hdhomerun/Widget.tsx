import { Tv } from 'lucide-react'
import type { PluginSummary } from '../../api/client'

interface HDHomeRunSummary extends PluginSummary {
  device_name?: string
  model?: string
  tuner_count?: number
  firmware?: string
  scan_in_progress?: boolean
  source?: string
  message?: string
}

export function HDHomeRunWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as HDHomeRunSummary

  if (s.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <div className="text-red-400 mb-1">Connection Error</div>
          <div className="text-xs">{s.message ?? 'Unable to connect to HDHomeRun'}</div>
        </div>
      </div>
    )
  }

  const tunerCount = s.tuner_count ?? 0
  const deviceName = s.device_name ?? 'HDHomeRun'
  const model = s.model ?? ''
  const source = s.source ?? ''
  const scanInProgress = s.scan_in_progress ?? false

  return (
    <div className="space-y-2.5 text-xs">
      {/* Status + device name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-muted">Online</span>
        </div>
        <div className="flex items-center gap-1">
          <Tv className="w-3 h-3 text-blue-400" />
          <span className="text-gray-100 truncate max-w-[120px]" title={deviceName}>{deviceName}</span>
        </div>
      </div>

      {/* Tuner count */}
      <div className="bg-surface-3 rounded p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted">Tuners</span>
          <span className="font-mono font-semibold text-lg">{tunerCount}</span>
        </div>
        {model && <div className="text-muted text-[10px]">{model}</div>}
      </div>

      {/* Source + scan status */}
      <div className="flex items-center justify-between">
        {source && (
          <span className="text-muted">
            Source: <span className="text-gray-300">{source}</span>
          </span>
        )}
        {scanInProgress && (
          <span className="text-yellow-400 text-[10px] font-semibold animate-pulse">SCANNING…</span>
        )}
      </div>
    </div>
  )
}
