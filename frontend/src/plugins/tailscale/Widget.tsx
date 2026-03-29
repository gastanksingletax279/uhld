import type { PluginSummary } from '../../api/client'

interface TailscaleSummary extends PluginSummary {
  devices_total: number
  devices_online: number
}

export function TailscaleWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as TailscaleSummary
  const total = s.devices_total ?? 0
  const online = s.devices_online ?? 0
  const offline = total - online

  return (
    <div className="space-y-2.5 text-xs">
      {/* Online/Offline counts */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Online" value={String(online)} ok={online > 0} />
        <Stat label="Offline" value={String(offline)} ok={offline === 0} />
      </div>

      {/* Device dots */}
      <div>
        <div className="text-muted mb-1.5">Devices ({total})</div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: Math.min(total, 20) }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full ${i < online ? 'bg-green-400' : 'bg-gray-600'}`}
              title={i < online ? 'online' : 'offline'}
            />
          ))}
          {total > 20 && (
            <span className="text-muted ml-1">+{total - 20}</span>
          )}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex justify-between text-muted">
        <span>Tailnet</span>
        <span className="font-mono text-gray-300">{online}/{total} online</span>
      </div>
    </div>
  )
}

function Stat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface-3 rounded p-2">
      <div className="text-muted mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${ok ? 'text-gray-100' : 'text-warning'}`}>{value}</div>
    </div>
  )
}
