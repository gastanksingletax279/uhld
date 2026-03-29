import { FormEvent, useState } from 'react'
import { api } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { KeyRound, AlertCircle } from 'lucide-react'

export function ChangePasswordModal({ forced = false, onClose }: { forced?: boolean; onClose?: () => void }) {
  const clearSetupFlag = useAuthStore((s) => s.clearSetupFlag)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('Passwords do not match'); return }
    if (next.length < 4) { setError('Password must be at least 4 characters'); return }
    setLoading(true)
    try {
      await api.changePassword(current, next)
      clearSetupFlag()
      onClose?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={forced ? undefined : onClose}
    >
      <div className="card w-full max-w-sm p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-1">
          <KeyRound className="w-4 h-4 text-warning" />
          <h2 className="text-sm font-semibold text-gray-100">
            {forced ? 'Set a new password' : 'Change password'}
          </h2>
        </div>
        {forced && (
          <p className="text-xs text-muted mb-5">
            The default <span className="font-mono text-gray-300">admin / admin</span> credentials are active. Set a new password before continuing.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 mt-4">
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              className="input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center py-2 mt-1"
          >
            {loading ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  )
}
