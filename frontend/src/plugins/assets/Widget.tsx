import type { PluginSummary } from '../../api/client'

interface AssetSummary extends PluginSummary {
  total: number
  by_type: Record<string, number>
}

const TYPE_LABELS: Record<string, string> = {
  server: 'Server',
  desktop: 'Desktop',
  laptop: 'Laptop',
  switch: 'Switch',
  router: 'Router',
  ap: 'AP',
  nas: 'NAS',
  printer: 'Printer',
  ups: 'UPS',
  other: 'Other',
}

export function AssetsWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as AssetSummary
  const byType = s.by_type ?? {}
  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 4)

  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">Total assets</span>
        <span className="font-mono font-semibold text-gray-100 text-lg">{s.total ?? 0}</span>
      </div>
      {sorted.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map(([type, count]) => (
            <span key={type} className="badge-ok text-[10px]">
              {TYPE_LABELS[type] ?? type}&nbsp;{count}
            </span>
          ))}
        </div>
      )}
      {sorted.length === 0 && (
        <div className="text-muted text-[11px]">No assets added yet</div>
      )}
    </div>
  )
}
