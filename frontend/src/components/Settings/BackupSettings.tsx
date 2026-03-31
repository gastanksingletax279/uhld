import { useEffect, useRef, useState } from 'react'
import { Download, Trash2, Plus, Upload, RefreshCw, Loader2, AlertCircle, CheckCircle2, Database, Clock } from 'lucide-react'
import { api, BackupInfo, BackupSchedule } from '../../api/client'
import { ConfirmModal, ConfirmModalState } from '../ConfirmModal'

export function BackupSettings() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [schedule, setSchedule] = useState<BackupSchedule>({ enabled: false, interval: 'daily', keep_count: 7 })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [savingSched, setSavingSched] = useState(false)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [b, s] = await Promise.all([api.backup.list(), api.backup.getSchedule()])
      setBackups(b)
      setSchedule(s)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load backup data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  function flash(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  async function createBackup() {
    setCreating(true)
    setError(null)
    try {
      await api.backup.create()
      flash('Backup created successfully')
      await loadAll()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create backup')
    } finally {
      setCreating(false)
    }
  }

  async function deleteBackup(filename: string) {
    setConfirmModal({
      title: `Delete backup?`,
      message: `"${filename}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      confirmClass: 'bg-danger hover:bg-danger/80',
      onConfirm: () => { setConfirmModal(null); doDeleteBackup(filename) },
    })
  }

  async function doDeleteBackup(filename: string) {
    setDeletingFile(filename)
    setError(null)
    try {
      await api.backup.delete(filename)
      flash('Backup deleted')
      setBackups((prev) => prev.filter((b) => b.filename !== filename))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete backup')
    } finally {
      setDeletingFile(null)
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Clear the input immediately so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = ''
    setConfirmModal({
      title: 'Restore from backup?',
      message: 'All current plugin configurations will be overwritten. Plugins will be set to disabled — re-enable them after restore. Settings will also be restored.',
      confirmLabel: 'Restore',
      confirmClass: 'bg-warning hover:bg-warning/80',
      onConfirm: () => { setConfirmModal(null); doRestore(file) },
    })
  }

  async function doRestore(file: File) {
    setRestoring(true)
    setError(null)
    try {
      const msg = await api.backup.restore(file)
      flash(msg.message)
    } catch (er: unknown) {
      setError(er instanceof Error ? er.message : 'Failed to restore backup')
    } finally {
      setRestoring(false)
    }
  }

  async function saveSchedule() {
    setSavingSched(true)
    setError(null)
    try {
      await api.backup.updateSchedule(schedule)
      flash('Backup schedule saved')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save schedule')
    } finally {
      setSavingSched(false)
    }
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted text-sm py-8">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading backup settings…
      </div>
    )
  }

  return (
    <>
    <div className="space-y-6 max-w-3xl">
      {/* Feedback banners */}
      {error && (
        <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/30 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-success text-sm bg-success/10 border border-success/30 rounded px-3 py-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-1.5">
          <Database className="w-4 h-4" /> Manual Backup / Restore
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={createBackup}
            disabled={creating}
            className="btn-sm btn-primary flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create Backup
          </button>

          <label className={`btn-sm btn-ghost flex items-center gap-1.5 cursor-pointer ${restoring ? 'opacity-60 pointer-events-none' : ''}`}>
            {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Restore from File
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleRestore}
              disabled={restoring}
            />
          </label>

          <button onClick={loadAll} className="btn-sm btn-ghost" title="Refresh list">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-muted mt-2">
          Backups contain all plugin configurations (encrypted) and application settings. Sensitive
          credentials remain encrypted in the backup file.
        </p>
      </div>

      {/* ── Backup list ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-4">
          <h3 className="text-sm font-semibold text-gray-200">Available Backups</h3>
        </div>
        {backups.length === 0 ? (
          <div className="px-4 py-6 text-center text-muted text-sm">No backups yet</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-4 text-muted">
                <th className="px-4 py-2 text-left">Filename</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Created</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Size</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.filename} className="border-b border-surface-4 last:border-0 hover:bg-surface-3">
                  <td className="px-4 py-2 font-mono text-gray-300">{b.filename}</td>
                  <td className="px-4 py-2 text-muted hidden sm:table-cell">
                    {new Date(b.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-muted hidden sm:table-cell">{fmtSize(b.size_bytes)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/backup/${b.filename}/download`}
                        download={b.filename}
                        className="btn-sm btn-ghost"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => deleteBackup(b.filename)}
                        disabled={deletingFile === b.filename}
                        className="btn-sm btn-danger"
                        title="Delete"
                      >
                        {deletingFile === b.filename ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Schedule ──────────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> Scheduled Backups
        </h3>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) => setSchedule((s) => ({ ...s, enabled: e.target.checked }))}
            className="rounded"
          />
          <span className="text-gray-200">Enable automatic backups</span>
        </label>

        {schedule.enabled && (
          <div className="space-y-3 pl-6">
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted w-24">Frequency</label>
              <select
                value={schedule.interval}
                onChange={(e) => setSchedule((s) => ({ ...s, interval: e.target.value }))}
                className="input text-xs py-1 px-2 w-32"
              >
                <option value="daily">Daily (2 AM)</option>
                <option value="weekly">Weekly (Sun 2 AM)</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted w-24">Keep last</label>
              <input
                type="number"
                min={1}
                max={90}
                value={schedule.keep_count}
                onChange={(e) => setSchedule((s) => ({ ...s, keep_count: parseInt(e.target.value) || 7 }))}
                className="input text-xs py-1 px-2 w-20"
              />
              <span className="text-xs text-muted">backups</span>
            </div>
          </div>
        )}

        <button
          onClick={saveSchedule}
          disabled={savingSched}
          className="btn-sm btn-primary flex items-center gap-1.5"
        >
          {savingSched ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Save Schedule
        </button>
      </div>
    </div>
    {confirmModal && <ConfirmModal modal={confirmModal} onCancel={() => setConfirmModal(null)} />}
    </>
  )
}
