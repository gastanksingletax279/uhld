import { useEffect, useState, useCallback } from 'react'
import { Bell, BellOff, CheckCheck, Trash2, RefreshCw, Loader2, Send, AlertCircle } from 'lucide-react'
import { api, NotificationItem } from '../../api/client'
import { ConfirmModal, ConfirmModalState } from '../../components/ConfirmModal'

type Tab = 'history' | 'channels'

const LEVEL_BADGE: Record<string, string> = {
  error: 'badge-error',
  warning: 'badge-warning',
  info: 'badge-ok',
}

const LEVEL_DOT: Record<string, string> = {
  error: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-accent',
}

export function NotificationsView({ instanceId = 'default' }: { instanceId?: string }) {
  const notifApi = api.notifications(instanceId)
  const [tab, setTab] = useState<Tab>('history')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [offset, setOffset] = useState(0)
  const PAGE = 50

  // Channel test state
  const [testChannel, setTestChannel] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ch: string; ok: boolean; msg: string } | null>(null)

  const [marking, setMarking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await notifApi.getHistory(PAGE, offset, levelFilter || undefined, unreadOnly)
      setItems(data.items)
      setTotal(data.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [instanceId, offset, levelFilter, unreadOnly])

  useEffect(() => { load() }, [load])
  useEffect(() => { setOffset(0) }, [levelFilter, unreadOnly])

  async function markAllRead() {
    setMarking(true)
    try {
      await notifApi.markRead(null)
      await load()
    } finally {
      setMarking(false)
    }
  }

  async function clearHistory() {
    setConfirmModal({
      title: 'Clear notification history?',
      message: 'All notification history will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Clear All',
      confirmClass: 'bg-danger hover:bg-danger/80',
      onConfirm: () => { setConfirmModal(null); doClearing() },
    })
  }

  async function doClearing() {
    setClearing(true)
    try {
      await notifApi.clearHistory()
      await load()
    } finally {
      setClearing(false)
    }
  }

  async function sendTest(channel: string) {
    setTestChannel(channel)
    setTestResult(null)
    try {
      const resp = await notifApi.testChannel(channel)
      setTestResult({ ch: channel, ok: true, msg: resp.message })
    } catch (e: unknown) {
      setTestResult({ ch: channel, ok: false, msg: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setTestChannel(null)
    }
  }

  return (
    <>
    <div className="space-y-4 max-w-5xl">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-4 pb-0">
        {(['history', 'channels'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'history' && total > 0 && (
              <span className="ml-1.5 bg-surface-3 text-muted text-[10px] px-1.5 py-0.5 rounded-full">
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── History tab ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="input text-xs py-1 px-2 w-32"
            >
              <option value="">All levels</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded"
              />
              Unread only
            </label>
            <div className="ml-auto flex gap-2">
              <button
                onClick={load}
                className="btn-sm btn-ghost"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={markAllRead}
                disabled={marking}
                className="btn-sm btn-ghost flex items-center gap-1"
              >
                {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                Mark all read
              </button>
              <button
                onClick={clearHistory}
                disabled={clearing}
                className="btn-sm btn-danger flex items-center gap-1"
              >
                {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Clear
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-danger text-sm p-4">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          ) : items.length === 0 ? (
            <div className="card p-8 text-center text-muted text-sm">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No notifications
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-4 text-muted">
                    <th className="px-3 py-2 text-left w-6"></th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">Plugin</th>
                    <th className="px-3 py-2 text-left hidden lg:table-cell">Channels</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((n) => (
                    <tr
                      key={n.id}
                      className={`border-b border-surface-4 last:border-0 hover:bg-surface-3 transition-colors ${
                        n.read ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            n.read ? 'bg-surface-4' : (LEVEL_DOT[n.level] ?? 'bg-muted')
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-200 max-w-xs truncate">
                        <div className="truncate">{n.title}</div>
                        <div className="text-muted font-normal truncate">{n.message}</div>
                      </td>
                      <td className="px-3 py-2 text-muted hidden md:table-cell">
                        {n.plugin_id ?? '—'}
                        {n.instance_id && n.instance_id !== 'default' ? `/${n.instance_id}` : ''}
                      </td>
                      <td className="px-3 py-2 text-muted hidden lg:table-cell">
                        {n.channels_sent
                          ? (JSON.parse(n.channels_sent) as string[]).join(', ') || '—'
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`badge text-[10px] ${LEVEL_BADGE[n.level] ?? 'badge-ok'}`}>
                          {n.level}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted whitespace-nowrap">
                        {new Date(n.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE && (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}
                  className="btn-sm btn-ghost"
                >
                  Previous
                </button>
                <button
                  disabled={offset + PAGE >= total}
                  onClick={() => setOffset(offset + PAGE)}
                  className="btn-sm btn-ghost"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Channels tab ──────────────────────────────────────────────────── */}
      {tab === 'channels' && (
        <div className="space-y-3 max-w-xl">
          <p className="text-xs text-muted">
            Channel configuration is managed through the plugin settings. Use the buttons below to send
            a test notification to each enabled channel.
          </p>

          {testResult && (
            <div
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded ${
                testResult.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}
            >
              {testResult.ok ? (
                <CheckCheck className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {testResult.msg}
            </div>
          )}

          {(['email', 'telegram', 'webhook'] as const).map((ch) => (
            <div key={ch} className="card p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-200 capitalize">{ch}</div>
                <div className="text-xs text-muted mt-0.5">
                  {ch === 'email' && 'SMTP email delivery'}
                  {ch === 'telegram' && 'Telegram bot messages'}
                  {ch === 'webhook' && 'HMAC-signed HTTP POST'}
                </div>
              </div>
              <button
                onClick={() => sendTest(ch)}
                disabled={testChannel === ch}
                className="btn-sm btn-ghost flex items-center gap-1"
              >
                {testChannel === ch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Test
              </button>
            </div>
          ))}

          <p className="text-[11px] text-muted">
            If a channel is not configured yet, the test will fail with a configuration error. Go to
            Settings → Plugins → Notifications to configure channels.
          </p>
        </div>
      )}
    </div>

    {confirmModal && <ConfirmModal modal={confirmModal} onCancel={() => setConfirmModal(null)} />}
    </>
  )
}
