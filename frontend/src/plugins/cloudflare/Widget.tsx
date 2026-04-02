import type { PluginSummary } from '../../api/client'
import { AlertTriangle, Cloud, ShieldAlert, ShieldCheck, Activity } from 'lucide-react'

interface CloudflareSummary extends PluginSummary {
  zone_count?: number
  active_zones?: number
  paused_zones?: number
  total_requests_24h?: number
  total_threats_24h?: number
  attention_zones?: Array<{ id: string; name: string; status: string }>
}

export function CloudflareWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as CloudflareSummary

  if (s.status === 'error') {
    return (
      <div className="h-full flex items-center justify-center text-xs text-red-300">
        Cloudflare unavailable
      </div>
    )
  }

  const zoneCount = Number(s.zone_count ?? 0)
  const active = Number(s.active_zones ?? 0)
  const paused = Number(s.paused_zones ?? 0)
  const requests = Number(s.total_requests_24h ?? 0)
  const threats = Number(s.total_threats_24h ?? 0)
  const hasAttention = Array.isArray(s.attention_zones) && s.attention_zones.length > 0

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted">
          <Cloud className="w-3.5 h-3.5" />
          Zones
        </div>
        <span className="font-mono text-gray-100">{zoneCount}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-surface-3 p-2">
          <div className="flex items-center gap-1 text-muted mb-0.5">
            <ShieldCheck className="w-3 h-3 text-green-400" /> Active
          </div>
          <div className="font-mono text-gray-100">{active}</div>
        </div>
        <div className="rounded bg-surface-3 p-2">
          <div className="flex items-center gap-1 text-muted mb-0.5">
            <ShieldAlert className="w-3 h-3 text-yellow-400" /> Paused
          </div>
          <div className="font-mono text-gray-100">{paused}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-muted">
          <Activity className="w-3 h-3 text-blue-400" /> Requests 24h
        </div>
        <span className="font-mono text-gray-100">{requests.toLocaleString()}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-muted">
          <ShieldAlert className="w-3 h-3 text-red-400" /> Threats 24h
        </div>
        <span className="font-mono text-gray-100">{threats.toLocaleString()}</span>
      </div>

      {hasAttention && (
        <div className="rounded bg-yellow-900/20 border border-yellow-800/40 px-2 py-1.5 flex items-center gap-1 text-yellow-300">
          <AlertTriangle className="w-3.5 h-3.5" />
          {s.attention_zones?.length} zone(s) need attention
        </div>
      )}
    </div>
  )
}
