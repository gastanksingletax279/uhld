import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ManagedUser } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import {
  Users, Plus, Trash2, Shield, Eye, RefreshCw,
  UserCheck, UserX, KeyRound, X, Check
} from 'lucide-react'
import { ConfirmModal, ConfirmModalState, InputModal, InputModalState } from '../ConfirmModal'

export function UserManagement() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null)
  const [inputModal, setInputModal] = useState<InputModalState | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listUsers()
      setUsers(res.users)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function toggleActive(user: ManagedUser) {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    }
  }

  async function changeRole(user: ManagedUser, role: 'admin' | 'viewer') {
    try {
      await api.updateUser(user.id, { role })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  async function deleteUser(user: ManagedUser) {
    setConfirmModal({
      title: `Delete user "${user.username}"?`,
      message: 'This user account will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      confirmClass: 'bg-danger hover:bg-danger/80',
      onConfirm: () => { setConfirmModal(null); doDeleteUser(user) },
    })
  }

  async function doDeleteUser(user: ManagedUser) {
    try {
      await api.deleteUser(user.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  async function resetPassword(user: ManagedUser) {
    setInputModal({
      title: `Reset password for "${user.username}"`,
      inputLabel: 'New password',
      inputType: 'password',
      placeholder: 'Enter new password',
      confirmLabel: 'Reset Password',
      onConfirm: async (pw) => {
        setInputModal(null)
        try {
          await api.adminResetPassword(user.id, pw)
          setSuccessMsg(`Password reset for ${user.username}`)
          setTimeout(() => setSuccessMsg(''), 4000)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to reset password')
        }
      },
    })
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted" />
          <h3 className="text-sm font-semibold text-gray-200">Users</h3>
          <span className="text-xs text-muted">({users.length})</span>
        </div>
        <div className="flex gap-2">

          <button onClick={refresh} disabled={loading} className="btn-secondary text-xs px-2 py-1">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs px-2 py-1">
            <Plus className="w-3 h-3 mr-1" /> New user
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="text-sm text-success bg-success/10 border border-success/30 rounded px-3 py-2">
          {successMsg}
        </div>
      )}

      {showCreate && (
        <CreateUserForm
          onCreated={() => { setShowCreate(false); refresh() }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="card divide-y divide-surface-4">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
              u.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-muted'
            }`}>
              {u.username[0].toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-200 font-medium">{u.username}</span>
                {u.id === currentUser?.id && (
                  <span className="text-xs text-muted">(you)</span>
                )}
                {!u.is_active && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-danger/20 text-danger">Disabled</span>
                )}
                {u.totp_enabled && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-success/20 text-success">2FA</span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {u.role === 'admin' ? (
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Eye className="w-3 h-3" /> Viewer
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            {u.id !== currentUser?.id && (
              <div className="flex items-center gap-1">
                {/* Toggle role */}
                <button
                  onClick={() => changeRole(u, u.role === 'admin' ? 'viewer' : 'admin')}
                  title={u.role === 'admin' ? 'Demote to viewer' : 'Promote to admin'}
                  className="p-1.5 text-muted hover:text-gray-200 transition-colors"
                >
                  {u.role === 'admin' ? <Eye className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                </button>
                {/* Toggle active */}
                <button
                  onClick={() => toggleActive(u)}
                  title={u.is_active ? 'Disable account' : 'Enable account'}
                  className={`p-1.5 transition-colors ${u.is_active ? 'text-muted hover:text-warning' : 'text-muted hover:text-success'}`}
                >
                  {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                </button>
                {/* Reset password */}
                <button
                  onClick={() => resetPassword(u)}
                  title="Reset password"
                  className="p-1.5 text-muted hover:text-gray-200 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
                {/* Delete */}
                <button
                  onClick={() => deleteUser(u)}
                  title="Delete user"
                  className="p-1.5 text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {users.length === 0 && !loading && (
          <p className="px-4 py-6 text-center text-xs text-muted">No users found.</p>
        )}
      </div>
    </div>
    {confirmModal && <ConfirmModal modal={confirmModal} onCancel={() => setConfirmModal(null)} />}
    {inputModal && <InputModal modal={inputModal} onCancel={() => setInputModal(null)} />}
    </>
  )
}

function CreateUserForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.createUser(username, password, role)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-4 border border-accent/30">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-200">New user</h4>
        <button onClick={onCancel} className="text-muted hover:text-gray-200 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Username</label>
            <input type="text" className="input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'viewer')}>
            <option value="viewer">Viewer (read-only)</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary text-xs">
            <Check className="w-3 h-3 mr-1" /> {loading ? 'Creating…' : 'Create user'}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary text-xs">Cancel</button>
        </div>
      </form>
    </div>
  )
}
