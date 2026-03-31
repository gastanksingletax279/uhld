import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { api, OAuthProvider } from '../api/client'
import { Server, Sun, Moon, Fingerprint, Shield } from 'lucide-react'

type LoginStep = 'credentials' | 'totp'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const setUser = useAuthStore((s) => s.setUser)
  const { theme, toggleTheme } = useThemeStore()

  const [step, setStep] = useState<LoginStep>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [partialToken, setPartialToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([])

  // Check for OAuth error param
  const oauthError = new URLSearchParams(window.location.search).get('oauth_error')

  useEffect(() => {
    api.oauthProviders().then((res) => setOauthProviders(res.providers)).catch(() => {})
  }, [])

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if (result.requires_totp && result.partial_token) {
        setPartialToken(result.partial_token)
        setStep('totp')
        return
      }
      navigate('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.totpLogin(partialToken, totpCode)
      setUser(res.user)
      navigate('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasskeyLogin() {
    setError('')
    setLoading(true)
    try {
      const beginRes = await api.passkeyLoginBegin()
      const { challenge_token, options } = beginRes

      // Use the browser's WebAuthn API
      const credential = await navigator.credentials.get({ publicKey: parseRequestOptions(options) }) as PublicKeyCredential | null
      if (!credential) throw new Error('Passkey authentication cancelled')

      const credJSON = credentialToJSON(credential)
      const res = await api.passkeyLoginComplete(challenge_token, credJSON)
      setUser(res.user)
      navigate('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed')
    } finally {
      setLoading(false)
    }
  }

  function handleOAuthLogin(provider: string) {
    window.location.href = `/api/auth/oauth/${provider}`
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 text-muted hover:text-gray-100 transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-accent-dim rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-semibold text-white leading-none">UHLD</div>
            <div className="text-xs text-muted">Homelab Dashboard</div>
          </div>
        </div>

        {/* Card */}
        <div className="card p-6">
          {step === 'credentials' ? (
            <>
              <h1 className="text-base font-semibold text-white mb-6">Sign in</h1>

              {oauthError && (
                <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2 mb-4">
                  {oauthError === 'no_account'
                    ? 'No account linked to that identity. Contact an administrator.'
                    : oauthError === 'account_disabled'
                    ? 'Your account is disabled.'
                    : `OAuth error: ${oauthError}`}
                </div>
              )}

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="username">Username</label>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2">
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              {/* Passkey login */}
              {'credentials' in (navigator as Navigator) && (
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={loading}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted border border-surface-4 rounded hover:text-gray-200 hover:border-gray-500 transition-colors"
                >
                  <Fingerprint className="w-4 h-4" />
                  Sign in with passkey
                </button>
              )}

              {/* OAuth buttons */}
              {oauthProviders.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-surface-4" />
                    </div>
                    <div className="relative flex justify-center text-xs text-muted">
                      <span className="bg-surface-2 px-2">or continue with</span>
                    </div>
                  </div>
                  {oauthProviders.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleOAuthLogin(p.id)}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted border border-surface-4 rounded hover:text-gray-200 hover:border-gray-500 transition-colors"
                    >
                      <Shield className="w-4 h-4" />
                      Continue with {p.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-accent" />
                <h1 className="text-base font-semibold text-white">Two-factor authentication</h1>
              </div>
              <p className="text-xs text-muted mb-5">
                Enter the 6-digit code from your authenticator app.
              </p>

              <form onSubmit={handleTotpSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="totp-code">Authenticator code</label>
                  <input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    className="input text-center tracking-widest text-lg font-mono"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || totpCode.length !== 6} className="btn-primary w-full justify-center py-2">
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setError(''); setTotpCode('') }}
                  className="w-full text-center text-sm text-muted hover:text-gray-300 transition-colors"
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── WebAuthn helpers ──────────────────────────────────────────────────────────

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRequestOptions(options: Record<string, any>): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c: Record<string, string>) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  }
}

function credentialToJSON(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
    },
  }
}
