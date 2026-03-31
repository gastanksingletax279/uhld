import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api, Passkey, User } from '../../api/client'
import {
  Shield, ShieldCheck, ShieldOff, Fingerprint, Trash2,
  Plus, Check, KeyRound, QrCode, Edit2
} from 'lucide-react'

export function AccountSettings() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  return (
    <div className="space-y-6 max-w-lg">
      <PasswordSection />
      <TOTPSection user={user} onRefresh={fetchMe} />
      <PasskeysSection />
    </div>
  )
}

// ── Password ─────────────────────────────────────────────────────────────────

function PasswordSection() {
  const clearSetupFlag = useAuthStore((s) => s.clearSetupFlag)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (next !== confirm) { setError('Passwords do not match'); return }
    if (next.length < 4) { setError('Password must be at least 4 characters'); return }
    setLoading(true)
    try {
      await api.changePassword(current, next)
      clearSetupFlag()
      setSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="w-4 h-4 text-muted" />
        <h3 className="text-sm font-semibold text-gray-200">Password</h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {success && <p className="text-xs text-success">Password changed successfully.</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

// ── TOTP ──────────────────────────────────────────────────────────────────────

type TOTPSetupState = 'idle' | 'setup' | 'disable'

function TOTPSection({ user, onRefresh }: {
  user: User | null
  onRefresh: () => Promise<void>
}) {
  const enabled = user?.totp_enabled ?? false
  const [state, setState] = useState<TOTPSetupState>('idle')
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [qrData, setQrData] = useState('')

  useEffect(() => {
    if (uri) {
      import('qrcode').then((QRCode) => {
        QRCode.toDataURL(uri, { width: 200, margin: 1 }).then(setQrData).catch(() => {})
      }).catch(() => {})
    }
  }, [uri])

  async function startSetup() {
    setError('')
    setLoading(true)
    try {
      const res = await api.totpSetup()
      setSecret(res.secret)
      setUri(res.uri)
      setState('setup')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start TOTP setup')
    } finally {
      setLoading(false)
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.totpVerify(secret, code)
      await onRefresh()
      setState('idle')
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  async function confirmDisable(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.totpDisable(code)
      await onRefresh()
      setState('idle')
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {enabled ? <ShieldCheck className="w-4 h-4 text-success" /> : <Shield className="w-4 h-4 text-muted" />}
          <h3 className="text-sm font-semibold text-gray-200">Two-factor authentication</h3>
          {enabled && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-success/20 text-success">Enabled</span>
          )}
        </div>
        {state === 'idle' && (
          enabled ? (
            <button onClick={() => setState('disable')} className="btn-danger text-xs px-2 py-1">
              <ShieldOff className="w-3 h-3 mr-1" /> Disable
            </button>
          ) : (
            <button onClick={startSetup} disabled={loading} className="btn-primary text-xs px-2 py-1">
              {loading ? 'Loading…' : 'Enable'}
            </button>
          )
        )}
      </div>

      {state === 'setup' && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
          </p>
          <div className="flex gap-4 items-start">
            {qrData ? (
              <img src={qrData} alt="TOTP QR Code" className="rounded w-[160px] h-[160px]" />
            ) : (
              <div className="w-[160px] h-[160px] bg-surface-3 rounded flex items-center justify-center">
                <QrCode className="w-8 h-8 text-muted" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted mb-1">Manual entry key:</p>
              <code className="text-xs font-mono text-gray-300 break-all">{secret}</code>
            </div>
          </div>
          <form onSubmit={confirmEnable} className="space-y-3">
            <div>
              <label className="label">Verification code</label>
              <input
                type="text" inputMode="numeric" maxLength={6} className="input"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" required
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={loading || code.length !== 6} className="btn-primary">
                <Check className="w-3 h-3 mr-1" /> {loading ? 'Verifying…' : 'Confirm & enable'}
              </button>
              <button type="button" onClick={() => { setState('idle'); setCode(''); setError('') }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {state === 'disable' && (
        <form onSubmit={confirmDisable} className="space-y-3">
          <p className="text-xs text-muted">Enter your current authenticator code to confirm disabling 2FA.</p>
          <div>
            <label className="label">Authenticator code</label>
            <input
              type="text" inputMode="numeric" maxLength={6} className="input"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" required
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading || code.length !== 6} className="btn-danger">
              {loading ? 'Disabling…' : 'Disable 2FA'}
            </button>
            <button type="button" onClick={() => { setState('idle'); setCode(''); setError('') }} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {state === 'idle' && !enabled && (
        <p className="text-xs text-muted">
          Protect your account with a time-based one-time password from an authenticator app.
        </p>
      )}
    </div>
  )
}

// ── Passkeys ──────────────────────────────────────────────────────────────────

function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await api.listPasskeys()
      setPasskeys(res.passkeys)
    } catch { /* no passkeys or not supported */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function registerPasskey() {
    if (!newKeyName.trim()) { setError('Enter a name for this passkey'); return }
    setError('')
    setRegistering(true)
    try {
      const beginRes = await api.passkeyRegisterBegin()
      const { challenge_token, options } = beginRes

      const credential = await navigator.credentials.create({ publicKey: parseCreationOptions(options) }) as PublicKeyCredential | null
      if (!credential) throw new Error('Registration cancelled')

      await api.passkeyRegisterComplete(challenge_token, credentialToJSON(credential), newKeyName.trim())
      setNewKeyName('')
      setShowNameInput(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  async function deletePasskey(id: number) {
    if (!confirm('Remove this passkey?')) return
    setLoading(true)
    try {
      await api.deletePasskey(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove passkey')
    } finally {
      setLoading(false)
    }
  }

  async function renamePasskey(id: number, currentName: string) {
    const name = prompt('New name:', currentName)
    if (!name || !name.trim()) return
    try {
      await api.renamePasskey(id, name.trim())
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename passkey')
    }
  }

  const passkeySupported = typeof navigator !== 'undefined' && 'credentials' in navigator

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-muted" />
          <h3 className="text-sm font-semibold text-gray-200">Passkeys</h3>
        </div>
        {passkeySupported && !showNameInput && (
          <button onClick={() => setShowNameInput(true)} className="btn-primary text-xs px-2 py-1">
            <Plus className="w-3 h-3 mr-1" /> Add passkey
          </button>
        )}
      </div>

      {!passkeySupported && (
        <p className="text-xs text-muted">Your browser does not support passkeys.</p>
      )}

      {passkeySupported && showNameInput && (
        <div className="flex gap-2 mb-4">
          <input
            type="text" className="input flex-1" placeholder="e.g. MacBook Touch ID"
            value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && registerPasskey()}
          />
          <button onClick={registerPasskey} disabled={registering} className="btn-primary text-xs px-3">
            {registering ? '…' : 'Register'}
          </button>
          <button onClick={() => { setShowNameInput(false); setNewKeyName(''); setError('') }} className="btn-secondary text-xs px-3">
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-xs text-danger mb-3">{error}</p>}

      {passkeys.length === 0 ? (
        <p className="text-xs text-muted">No passkeys registered. Add one to enable passwordless sign-in.</p>
      ) : (
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between py-2 border-b border-surface-4 last:border-0">
              <div>
                <p className="text-sm text-gray-200">{pk.name}</p>
                <p className="text-xs text-muted">
                  Added {pk.created_at ? new Date(pk.created_at).toLocaleDateString() : '—'}
                  {pk.last_used && ` · Last used ${new Date(pk.last_used).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => renamePasskey(pk.id, pk.name)} title="Rename" className="p-1.5 text-muted hover:text-gray-200 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deletePasskey(pk.id)} disabled={loading} title="Remove" className="p-1.5 text-muted hover:text-danger transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── WebAuthn helpers ──────────────────────────────────────────────────────────

function base64urlToBuffer(b: string): ArrayBuffer {
  const base64 = b.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCreationOptions(opts: Record<string, any>): PublicKeyCredentialCreationOptions {
  return {
    ...opts,
    challenge: base64urlToBuffer(opts.challenge),
    user: { ...opts.user, id: base64urlToBuffer(opts.user.id) },
    excludeCredentials: (opts.excludeCredentials ?? []).map((c: Record<string, string>) => ({ ...c, id: base64urlToBuffer(c.id) })),
  } as PublicKeyCredentialCreationOptions
}

function credentialToJSON(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
    },
  }
}
