import type { PluginSummary } from '../../api/client'
import { Wifi, Network } from 'lucide-react'

interface UniFiSummary extends PluginSummary {
  clients_total: number
  clients_wifi: number
  clients_wired: number
  devices_total: number
  devices_online: number
}

export function UniFiWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as UniFiSummary

  return (
    <div className="space-y-2.5 text-xs">
      {/* Clients row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-3 rounded p-2">
          <div className="flex items-center gap-1 text-muted mb-0.5">
            <Wifi className="w-3 h-3" />
            <span>Wi-Fi</span>
          </div>
          <div className="font-mono font-semibold text-gray-100">{s.clients_wifi ?? 0}</div>
        </div>
        <div className="bg-surface-3 rounded p-2">
          <div className="flex items-center gap-1 text-muted mb-0.5">
            <Network className="w-3 h-3" />
            <span>Wired</span>
          </div>
          <div className="font-mono font-semibold text-gray-100">{s.clients_wired ?? 0}</div>
        </div>
      </div>

      {/* Total clients */}
      <div className="flex justify-between text-muted">
        <span>Clients total</span>
        <span className="font-mono text-gray-300">{s.clients_total ?? 0}</span>
      </div>

      {/* Devices */}
      <div className="flex justify-between text-muted">
        <span>Devices</span>
        <span className={`font-mono ${s.devices_online === s.devices_total ? 'text-green-400' : 'text-yellow-400'}`}>
          {s.devices_online ?? 0} / {s.devices_total ?? 0}
        </span>
      </div>
    </div>
  )
}
