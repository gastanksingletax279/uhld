import type { PluginSummary, NUTSummary, NUTUpsDevice } from '../../api/client'

export function NUTWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as NUTSummary

  if (s.status === 'error') {
    return (
      <div className="text-xs text-danger flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
        {String(s.message ?? 'Connection error')}
      </div>
    )
  }

  const devices = s.devices ?? []

  return (
    <div className="space-y-2.5 text-xs">
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-1.5">
        <StatusCount label="Total" value={s.total ?? 0} color="text-gray-200" />
        <StatusCount label="Online" value={s.online ?? 0} color="text-green-400" />
        <StatusCount label="On Battery" value={s.on_battery ?? 0} color={s.on_battery > 0 ? 'text-amber-400' : 'text-gray-500'} />
      </div>

      {/* Low battery alert */}
      {s.low_battery > 0 && (
        <div className="flex items-center gap-1.5 text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
          {s.low_battery} low battery
        </div>
      )}

      {/* Per-device battery bars */}
      {devices.slice(0, 3).map((d) => (
        <DeviceBar key={d.name} device={d} />
      ))}
      {devices.length > 3 && (
        <div className="text-muted text-center">+{devices.length - 3} more</div>
      )}
    </div>
  )
}

function StatusCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface-3 rounded p-1.5 text-center">
      <div className="text-muted mb-0.5 text-[10px]">{label}</div>
      <div className={`font-mono font-semibold text-sm ${color}`}>{value}</div>
    </div>
  )
}

function DeviceBar({ device }: { device: NUTUpsDevice }) {
  const charge = device.battery_charge ?? null
  const statusColor = getStatusColor(device.status)

  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor}`} />
          <span className="text-gray-300 truncate max-w-[90px]" title={device.name}>{device.name}</span>
        </div>
        <span className="font-mono text-gray-400">{charge !== null ? `${charge.toFixed(0)}%` : '—'}</span>
      </div>
      {charge !== null && (
        <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getBatteryBarColor(charge)}`}
            style={{ width: `${Math.min(charge, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function getStatusColor(status: string): string {
  if (status.includes('LB')) return 'bg-red-400'
  if (status.includes('OB')) return 'bg-amber-400'
  if (status.includes('OL')) return 'bg-green-400'
  if (status.includes('CHRG')) return 'bg-blue-400'
  return 'bg-gray-500'
}

function getBatteryBarColor(pct: number): string {
  if (pct <= 20) return 'bg-red-500'
  if (pct <= 50) return 'bg-amber-500'
  return 'bg-green-500'
}
