import { useEffect, useRef, useState } from 'react'
import {
  api, TailscaleDevice, TailscaleUser, TailscaleDNS, TailscaleLocalStatus,
} from '../../api/client'
import {
  RefreshCw, Network, Loader2, AlertCircle, Copy, Check,
  ArrowUpCircle, Users, Globe, Shield, Wifi, Server,
} from 'lucide-react'

type Tab = 'devices' | 'users' | 'dns' | 'acl'
type SortKey = 'hostname' | 'os' | 'user' | 'lastSeen' | 'online' | 'clientVersion'
type SortDir = 'asc' | 'desc'

export function TailscaleView({ instanceId = 'default' }: { instanceId?: string }) {
  const tailscale = api.tailscale(instanceId)
  const [tab, setTab] = useState<Tab>('devices')

  // Devices
  const [devices, setDevices] = useState<TailscaleDevice[]>([])
  const [devLoading, setDevLoading] = useState(true)
  const [devError, setDevError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('hostname')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Users
  const [users, setUsers] = useState<TailscaleUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  // DNS
  const [dns, setDns] = useState<TailscaleDNS | null>(null)
  const [dnsLoading, setDnsLoading] = useState(false)
  const [dnsLoaded, setDnsLoaded] = useState(false)
  const [dnsError, setDnsError] = useState<string | null>(null)

  // ACL
  const [acl, setAcl] = useState('')
  const [aclLoading, setAclLoading] = useState(false)
  const [aclLoaded, setAclLoaded] = useState(false)
  const [aclError, setAclError] = useState<string | null>(null)
  const [aclSaving, setAclSaving] = useState(false)
  const [aclSaved, setAclSaved] = useState(false)
  const [aclValidationError, setAclValidationError] = useState<string | null>(null)

  // Local sidecar status
  const [localStatus, setLocalStatus] = useState<TailscaleLocalStatus | null>(null)

  async function loadDevices() {
    setDevLoading(true); setDevError(null)
    try {
      const data = await tailscale.devices()
      setDevices(data.devices ?? [])
    } catch (e: unknown) {
      setDevError(e instanceof Error ? e.message : 'Failed to load devices')
    } finally { setDevLoading(false) }
  }

  async function loadUsers() {
    setUsersLoading(true); setUsersError(null)
    try {
      const data = await tailscale.users()
      setUsers(data.users ?? [])
      setUsersLoaded(true)
    } catch (e: unknown) {
      setUsersError(e instanceof Error ? e.message : 'Failed to load users')
    } finally { setUsersLoading(false) }
  }

  async function loadDns() {
    setDnsLoading(true); setDnsError(null)
    try {
      const data = await tailscale.dns()
      setDns(data)
      setDnsLoaded(true)
    } catch (e: unknown) {
      setDnsError(e instanceof Error ? e.message : 'Failed to load DNS settings')
    } finally { setDnsLoading(false) }
  }

  async function loadAcl() {
    setAclLoading(true); setAclError(null)
    try {
      const text = await tailscale.acl()
      setAcl(text)
      setAclLoaded(true)
    } catch (e: unknown) {
      setAclError(e instanceof Error ? e.message : 'Failed to load ACL')
    } finally { setAclLoading(false) }
  }

  useEffect(() => {
    loadDevices()
    // Also fetch local sidecar status silently — no error display if unavailable
    tailscale.localStatus().then(setLocalStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'users'  && !usersLoaded  && !usersLoading)  loadUsers()
    if (tab === 'dns'    && !dnsLoaded    && !dnsLoading)    loadDns()
    if (tab === 'acl'    && !aclLoaded    && !aclLoading)    loadAcl()
  }, [tab])

  function refresh() {
    if (tab === 'devices') loadDevices()
    else if (tab === 'users') { setUsersLoaded(false); loadUsers() }
    else if (tab === 'dns')   { setDnsLoaded(false);   loadDns() }
    else if (tab === 'acl')   { setAclLoaded(false);   loadAcl() }
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleSaveAcl() {
    setAclValidationError(null)
    // Best-effort JSON validation (strip // comments for basic check)
    const stripped = acl.replace(/\/\/[^\n]*/g, '').trim()
    try { JSON.parse(stripped) } catch {
      setAclValidationError('Warning: content may not be valid JSON/HuJSON. The API will validate on save.')
    }
    setAclSaving(true); setAclError(null); setAclSaved(false)
    try {
      await tailscale.saveAcl(acl)
      setAclSaved(true)
      setTimeout(() => setAclSaved(false), 3000)
    } catch (e: unknown) {
      setAclError(e instanceof Error ? e.message : 'Failed to save ACL')
    } finally { setAclSaving(false) }
  }

  const online = devices.filter((d) => d.online).length

  const sorted = [...devices].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'hostname': {
        const na = a.name ? a.name.split('.')[0] : a.hostname
        const nb = b.name ? b.name.split('.')[0] : b.hostname
        cmp = na.localeCompare(nb); break
      }
      case 'os':            cmp = a.os.localeCompare(b.os); break
      case 'user':          cmp = a.user.localeCompare(b.user); break
      case 'lastSeen':      cmp = a.lastSeen.localeCompare(b.lastSeen); break
      case 'online':        cmp = Number(b.online) - Number(a.online); break
      case 'clientVersion': cmp = a.clientVersion.localeCompare(b.clientVersion); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const isLoading = tab === 'devices' ? devLoading
    : tab === 'users' ? usersLoading
    : tab === 'dns'   ? dnsLoading
    : aclLoading

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'devices', label: 'Devices',         icon: <Server className="w-3.5 h-3.5" /> },
    { id: 'users',   label: 'Users',            icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'dns',     label: 'DNS',              icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'acl',     label: 'Access Control',   icon: <Shield className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Tailscale</h2>
          {!devLoading && tab === 'devices' && (
            <span className="text-xs text-muted">
              <span className="text-green-400 font-semibold">{online}</span>
              <span className="mx-1">/</span>
              <span>{devices.length}</span>
              <span className="ml-1">online</span>
            </span>
          )}
        </div>
        <button onClick={refresh} disabled={isLoading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Local sidecar status bar */}
      {localStatus?.available && (
        <div className="flex items-center gap-3 px-3 py-2 rounded bg-surface-3 border border-surface-4 text-xs">
          <Wifi className={`w-3.5 h-3.5 flex-shrink-0 ${localStatus.online ? 'text-green-400' : 'text-muted'}`} />
          <span className="text-muted">Sidecar:</span>
          <span className={localStatus.online ? 'text-green-400 font-medium' : 'text-danger'}>
            {localStatus.backend_state ?? 'Unknown'}
          </span>
          {localStatus.hostname && <><span className="text-muted">·</span><span className="text-gray-300">{localStatus.hostname}</span></>}
          {localStatus.dns_name  && <><span className="text-muted">·</span><span className="font-mono text-muted">{localStatus.dns_name}</span></>}
          {localStatus.ipv4      && <><span className="text-muted">·</span><span className="font-mono text-gray-300">{localStatus.ipv4}</span></>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Devices tab ── */}
      {tab === 'devices' && (
        devError ? <ErrorBanner msg={devError} /> :
        devLoading ? <LoadingSpinner /> :
        devices.length === 0 ? (
          <div className="text-sm text-muted text-center py-12">No devices found in this tailnet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  <Th label="Hostname" col="hostname" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-left font-medium">IP</th>
                  <Th label="OS" col="os" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <Th label="User" col="user" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Version" col="clientVersion" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 text-left font-medium">Routes</th>
                  <th className="px-3 py-2 text-left font-medium">Expiry</th>
                  <Th label="Last Seen" col="lastSeen" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Status" col="online" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((device) => (
                  <DeviceRow key={device.id} device={device} />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Users tab ── */}
      {tab === 'users' && (
        usersError ? <ErrorBanner msg={usersError} /> :
        usersLoading ? <LoadingSpinner /> :
        users.length === 0 ? (
          <div className="text-sm text-muted text-center py-12">No users found.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  <th className="px-3 py-2 text-left font-medium">User</th>
                  <th className="px-3 py-2 text-left font-medium">Login</th>
                  <th className="px-3 py-2 text-left font-medium">Role</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => <UserRow key={u.id} user={u} />)}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── DNS tab ── */}
      {tab === 'dns' && (
        dnsError ? <ErrorBanner msg={dnsError} /> :
        dnsLoading ? <LoadingSpinner /> :
        !dns ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DnsCard title="MagicDNS">
                <div className={`text-sm font-medium ${dns.magicDNS ? 'text-green-400' : 'text-muted'}`}>
                  {dns.magicDNS ? 'Enabled' : 'Disabled'}
                </div>
              </DnsCard>
              <DnsCard title="Custom Nameservers">
                {dns.nameservers.length === 0
                  ? <span className="text-muted text-xs">None configured</span>
                  : dns.nameservers.map((ns) => (
                    <div key={ns} className="font-mono text-xs text-gray-300">{ns}</div>
                  ))}
              </DnsCard>
              <DnsCard title="Search Domains">
                {dns.searchPaths.length === 0
                  ? <span className="text-muted text-xs">None configured</span>
                  : dns.searchPaths.map((sp) => (
                    <div key={sp} className="font-mono text-xs text-gray-300">{sp}</div>
                  ))}
              </DnsCard>
            </div>
          </div>
        )
      )}

      {/* ── ACL tab ── */}
      {tab === 'acl' && (
        aclLoading ? <LoadingSpinner /> : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Tailscale access controls use{' '}
                <span className="font-mono">HuJSON</span> (JSON with <code className="text-gray-300">// comments</code>).
              </p>
              <div className="flex items-center gap-2">
                {aclSaved && <span className="text-xs text-green-400">Saved!</span>}
                <button
                  onClick={handleSaveAcl}
                  disabled={aclSaving || !acl}
                  className="btn-primary text-xs py-1"
                >
                  {aclSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save ACL'}
                </button>
              </div>
            </div>
            {aclValidationError && (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {aclValidationError}
              </div>
            )}
            {aclError && <ErrorBanner msg={aclError} />}
            <AclEditor value={acl} onChange={setAcl} />
          </div>
        )
      )}
    </div>
  )
}

// ── Device row ────────────────────────────────────────────────────────────────

const EXIT_ROUTES = new Set(['0.0.0.0/0', '::/0'])

function DeviceRow({ device }: { device: TailscaleDevice }) {
  const ipv4 = device.addresses?.find((a) => !a.includes(':')) ?? device.addresses?.[0] ?? '—'
  const lastSeen = device.online ? 'now' : fmtRelativeTime(device.lastSeen)
  const [copied, setCopied] = useState(false)

  const displayName = device.name ? device.name.split('.')[0] : device.hostname
  const showOsHostname = device.hostname && device.hostname !== displayName

  const advertised = device.advertisedRoutes ?? []
  const isExitNode = advertised.some((r) => EXIT_ROUTES.has(r))
  const subnets = advertised.filter((r) => !EXIT_ROUTES.has(r))

  const expiry = device.keyExpiryDisabled
    ? 'Never'
    : device.expires
      ? fmtExpiry(device.expires)
      : '—'

  function copyIp() {
    if (ipv4 === '—') return
    navigator.clipboard.writeText(ipv4).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      {/* Hostname + tags */}
      <td className="px-3 py-2">
        <div className="font-medium text-gray-200">{displayName}</div>
        {showOsHostname && <div className="text-muted text-[10px] font-mono">{device.hostname}</div>}
        {device.tags && device.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {device.tags.map((tag) => (
              <span key={tag} className="px-1 py-0.5 rounded text-[10px] bg-accent-dim/30 text-accent font-mono">
                {tag.replace('tag:', '')}
              </span>
            ))}
          </div>
        )}
      </td>
      {/* IP */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-muted">{ipv4}</span>
          {ipv4 !== '—' && (
            <button onClick={copyIp} title="Copy IP" className="text-muted hover:text-gray-300 transition-colors flex-shrink-0">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </td>
      {/* OS */}
      <td className="px-3 py-2 text-muted capitalize">{device.os || '—'}</td>
      {/* User */}
      <td className="px-3 py-2 text-muted truncate max-w-[140px]" title={device.user}>{device.user || '—'}</td>
      {/* Version */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-muted text-[11px]">{shortVersion(device.clientVersion)}</span>
          {device.updateAvailable && (
            <span title="Update available" className="text-yellow-400">
              <ArrowUpCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </td>
      {/* Routes */}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {isExitNode && (
            <span className="px-1 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 whitespace-nowrap">exit node</span>
          )}
          {subnets.length > 0 && (
            <span className="px-1 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 whitespace-nowrap" title={subnets.join(', ')}>
              {subnets.length} subnet{subnets.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </td>
      {/* Expiry */}
      <td className="px-3 py-2 text-muted whitespace-nowrap text-[11px]">
        {expiry === 'Never'
          ? <span className="text-green-400/80">Never</span>
          : <span>{expiry}</span>
        }
      </td>
      {/* Last seen */}
      <td className="px-3 py-2 text-muted whitespace-nowrap">{lastSeen}</td>
      {/* Status */}
      <td className="px-3 py-2">
        {device.online
          ? <span className="badge-ok">online</span>
          : <span className="badge-muted">offline</span>
        }
      </td>
    </tr>
  )
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user }: { user: TailscaleUser }) {
  const joined = user.created ? fmtRelativeTime(user.created) : '—'
  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {user.profilePicUrl ? (
            <img src={user.profilePicUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-surface-4 flex items-center justify-center flex-shrink-0 text-[10px] text-muted uppercase">
              {user.displayName?.[0] ?? '?'}
            </div>
          )}
          <span className="text-gray-200 font-medium">{user.displayName}</span>
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-muted text-[11px]">{user.loginName}</td>
      <td className="px-3 py-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
          user.role === 'owner' || user.role === 'admin'
            ? 'bg-accent-dim/30 text-accent'
            : 'bg-surface-4 text-muted'
        }`}>
          {user.role}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={user.status === 'active' ? 'badge-ok' : 'badge-muted'}>{user.status}</span>
      </td>
      <td className="px-3 py-2 text-muted text-[11px] whitespace-nowrap">{joined}</td>
    </tr>
  )
}

// ── ACL editor ────────────────────────────────────────────────────────────────

function AclEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineCount = value.split('\n').length

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = value.substring(0, start) + '  ' + value.substring(end)
      onChange(next)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="card flex overflow-hidden font-mono text-xs" style={{ height: '60vh', minHeight: '400px' }}>
      {/* Line numbers */}
      <div className="select-none bg-surface-3 border-r border-surface-4 text-muted text-right px-3 py-3 leading-5 overflow-hidden"
        aria-hidden="true"
        style={{ minWidth: '3rem' }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="flex-1 bg-transparent text-gray-200 resize-none outline-none px-3 py-3 leading-5 overflow-auto"
        style={{ tabSize: 2 }}
      />
    </div>
  )
}

// ── DNS card ──────────────────────────────────────────────────────────────────

function DnsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted mb-2 font-medium uppercase tracking-wide">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

// ── Sort header ───────────────────────────────────────────────────────────────

function Th({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (col: SortKey) => void
}) {
  const active = col === sortKey
  return (
    <th
      className={`px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-gray-200 transition-colors ${active ? 'text-gray-200' : ''}`}
      onClick={() => onSort(col)}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading…
    </div>
  )
}

function shortVersion(v: string): string {
  if (!v) return '—'
  return v.split('-')[0] || v
}

function fmtRelativeTime(iso: string): string {
  if (!iso) return '—'
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (mins > 0) return `${mins}m ago`
    return 'just now'
  } catch { return iso }
}

function fmtExpiry(iso: string): string {
  if (!iso) return '—'
  try {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff < 0) return 'Expired'
    const days = Math.floor(diff / 86_400_000)
    if (days > 30) {
      const months = Math.floor(days / 30)
      return `${months}mo`
    }
    if (days > 0) return `${days}d`
    const hours = Math.floor(diff / 3_600_000)
    return hours > 0 ? `${hours}h` : '< 1h'
  } catch { return iso }
}
