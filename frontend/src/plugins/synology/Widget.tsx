import type { PluginSummary, SynologySummary } from '../../api/client'
import { HardDrive, Cpu, Download, AlertCircle } from 'lucide-react'

export function SynologyWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as SynologySummary

  if (s.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
          <div className="text-red-400 text-xs mb-0.5">Connection Error</div>
          <div className="text-xs text-muted">{String(s.message ?? 'Unable to connect')}</div>
        </div>
      </div>
    )
  }

  const cpuUsage = s.cpu_usage ?? 0
  const memUsage = s.memory_usage ?? 0
  const volumeCount = s.volume_count ?? 0
  const volumesHealthy = s.volumes_healthy ?? 0
  const volumesDegraded = s.volumes_degraded ?? 0
  const activeDownloads = s.active_downloads ?? 0
  const model = s.model ?? 'Synology NAS'
  const dsmVersion = s.dsm_version ?? ''

  const allHealthy = volumesDegraded === 0 && volumeCount > 0
  const volumeColor = volumesDegraded > 0 ? 'text-red-400' : volumeCount > 0 ? 'text-green-400' : 'text-muted'

  return (
    <div className="space-y-2.5 text-xs">
      {/* Header: model + DSM version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-medium text-gray-200 truncate max-w-[120px]" title={model}>{model}</span>
        </div>
        {dsmVersion && (
          <span className="text-muted text-[10px]">DSM {dsmVersion}</span>
        )}
      </div>

      {/* CPU usage */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-cyan-400" />
            <span className="text-muted">CPU</span>
          </div>
          <span className="font-mono text-gray-300">{cpuUsage.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cpuUsage > 90 ? 'bg-red-500' : cpuUsage > 70 ? 'bg-amber-500' : 'bg-cyan-500'}`}
            style={{ width: `${Math.min(cpuUsage, 100)}%` }}
          />
        </div>
      </div>

      {/* RAM usage */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted">RAM</span>
          <span className="font-mono text-gray-300">{memUsage.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${memUsage > 90 ? 'bg-red-500' : memUsage > 75 ? 'bg-amber-500' : 'bg-purple-500'}`}
            style={{ width: `${Math.min(memUsage, 100)}%` }}
          />
        </div>
      </div>

      {/* Volume health */}
      <div className="bg-surface-3 rounded p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${allHealthy ? 'bg-green-400' : volumesDegraded > 0 ? 'bg-red-400' : 'bg-gray-500'}`} />
            <span className={volumeColor}>
              {volumeCount} {volumeCount === 1 ? 'volume' : 'volumes'}
            </span>
          </div>
          <span className={`text-[10px] ${volumeColor}`}>
            {volumesDegraded > 0
              ? `${volumesDegraded} degraded`
              : volumeCount > 0
                ? `${volumesHealthy} healthy`
                : 'no volumes'}
          </span>
        </div>
      </div>

      {/* Active downloads */}
      {activeDownloads > 0 && (
        <div className="flex items-center gap-1.5 text-blue-400">
          <Download className="w-3 h-3" />
          <span>{activeDownloads} active {activeDownloads === 1 ? 'download' : 'downloads'}</span>
        </div>
      )}
    </div>
  )
}
