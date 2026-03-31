import { Bell, BellOff } from 'lucide-react'
import type { PluginSummary } from '../../api/client'

interface NotificationSummary extends PluginSummary {
  total: number
  unread: number
  recent: Array<{ id: number; title: string; level: string; read: boolean; created_at: string }>
  channels: string[]
  message?: string
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-accent',
}

export function NotificationsWidget({ summary }: { summary: PluginSummary }) {
  const s = summary as NotificationSummary

  if (s.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-danger text-xs">
        <BellOff className="w-4 h-4" />
        <span>{s.message ?? 'Notifications unavailable'}</span>
      </div>
    )
  }

  const recent = s.recent ?? []

  return (
    <div className="space-y-2.5 text-xs">
      {/* Counts row */}
      <div className="flex items-center justify-between">
        <span className="text-muted">Unread</span>
        <span className={`font-mono font-semibold text-lg ${s.unread > 0 ? 'text-warning' : 'text-gray-100'}`}>
          {s.unread ?? 0}
        </span>
      </div>

      {/* Channels */}
      {(s.channels ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.channels.map((ch) => (
            <span key={ch} className="badge-ok text-[10px] capitalize">{ch}</span>
          ))}
        </div>
      )}
      {(s.channels ?? []).length === 0 && (
        <div className="text-muted text-[11px]">No channels configured</div>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <div className="space-y-1">
          {recent.map((n) => (
            <div key={n.id} className="flex items-start gap-1.5">
              <Bell className={`w-3 h-3 mt-0.5 flex-shrink-0 ${LEVEL_COLOR[n.level] ?? 'text-muted'}`} />
              <span className={`truncate ${n.read ? 'text-muted' : 'text-gray-200'}`}>
                {n.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
