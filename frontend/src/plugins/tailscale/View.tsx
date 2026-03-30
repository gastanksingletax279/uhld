import { useEffect, useRef, useState } from 'react'
import {
  api, TailscaleDevice, TailscaleUser, TailscaleDNS, TailscaleLocalStatus,
  TailscaleKey, TailscaleTailnetSettings, TailscaleDeviceRoutes,
} from '../../api/client'
import {
  RefreshCw, Network, Loader2, AlertCircle, Copy, Check,
  ArrowUpCircle, Users, Globe, Shield, Wifi, Server,
  Container, Home, Key, Tv, Cpu, Router, Cloud, Lock,
  MonitorSmartphone, Wrench, Tag, Trash2, Timer, ShieldCheck,
  Settings, CheckCircle2, MoreVertical, Pencil, X,
} from 'lucide-react'
import { getViewState, setViewState } from '../../store/viewStateStore'

type Tab = 'devices' | 'users' | 'dns' | 'acl' | 'keys' | 'settings'
type SortKey = 'hostname' | 'os' | 'user' | 'lastSeen' | 'online' | 'clientVersion'
type SortDir = 'asc' | 'desc'

export function TailscaleView({ instanceId = 'default' }: { instanceId?: string }) {
  const tailscale = api.tailscale(instanceId)
  const _key = `tailscale:${instanceId}`
  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'devices') as Tab)
  function setTab(t: Tab) { setViewState(`${_key}:tab`, t); setTabRaw(t) }

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
  const [aclValidating, setAclValidating] = useState(false)
  const [aclValidateResult, setAclValidateResult] = useState<{ valid: boolean; message: string } | null>(null)

  // Keys
  const [keys, setKeys] = useState<TailscaleKey[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [keysLoaded, setKeysLoaded] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)

  // Tailnet settings
  const [tsSettings, setTsSettings] = useState<TailscaleTailnetSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // Device actions
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null)
  const [deviceActionError, setDeviceActionError] = useState<string | null>(null)

  // Device edit modal
  type DeviceModal =
    | { type: 'rename';  device: TailscaleDevice; value: string }
    | { type: 'set-ip';  device: TailscaleDevice; value: string }
    | { type: 'routes';  device: TailscaleDevice; routes: TailscaleDeviceRoutes | null; loading: boolean; enabled: Set<string> }
    | { type: 'tags';    device: TailscaleDevice; tags: string[]; input: string }
  const [deviceModal, setDeviceModal] = useState<DeviceModal | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

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

  async function loadKeys() {
    setKeysLoading(true); setKeysError(null)
    try {
      const data = await tailscale.keys()
      setKeys(data.keys ?? [])
      setKeysLoaded(true)
    } catch (e: unknown) {
      setKeysError(e instanceof Error ? e.message : 'Failed to load keys')
    } finally { setKeysLoading(false) }
  }

  async function loadSettings() {
    setSettingsLoading(true); setSettingsError(null)
    try {
      const data = await tailscale.tailnetSettings()
      setTsSettings(data)
      setSettingsLoaded(true)
    } catch (e: unknown) {
      setSettingsError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally { setSettingsLoading(false) }
  }

  async function handleValidateAcl() {
    setAclValidating(true); setAclValidateResult(null); setAclError(null)
    try {
      const result = await tailscale.validateAcl(acl)
      setAclValidateResult(result)
    } catch (e: unknown) {
      setAclError(e instanceof Error ? e.message : 'Validation failed')
    } finally { setAclValidating(false) }
  }

  async function handleDeviceAction(
    action: 'delete' | 'expire' | 'authorize' | 'toggle-expiry',
    deviceId: string,
    extra?: unknown,
  ) {
    setDeviceActionLoading(`${action}:${deviceId}`)
    setDeviceActionError(null)
    try {
      if (action === 'delete') {
        if (!window.confirm('Delete this device from your tailnet? This cannot be undone.')) return
        await tailscale.deleteDevice(deviceId)
        setDevices((prev) => prev.filter((d) => d.id !== deviceId))
      } else if (action === 'expire') {
        await tailscale.expireDeviceKey(deviceId)
        setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, keyExpiryDisabled: false } : d))
      } else if (action === 'authorize') {
        await tailscale.authorizeDevice(deviceId)
        setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, authorized: true } : d))
      } else if (action === 'toggle-expiry') {
        const disabled = extra as boolean
        await tailscale.setKeyExpiry(deviceId, disabled)
        setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, keyExpiryDisabled: disabled } : d))
      }
    } catch (e: unknown) {
      setDeviceActionError(e instanceof Error ? e.message : 'Action failed')
    } finally { setDeviceActionLoading(null) }
  }

  async function openDeviceModal(action: 'rename' | 'set-ip' | 'routes' | 'tags', device: TailscaleDevice) {
    setModalError(null)
    if (action === 'rename') {
      const current = device.name ? device.name.split('.')[0] : device.hostname
      setDeviceModal({ type: 'rename', device, value: current })
    } else if (action === 'set-ip') {
      const ipv4 = device.addresses?.find((a) => !a.includes(':')) ?? ''
      setDeviceModal({ type: 'set-ip', device, value: ipv4 })
    } else if (action === 'routes') {
      setDeviceModal({ type: 'routes', device, routes: null, loading: true, enabled: new Set(device.enabledRoutes ?? []) })
      try {
        const r = await tailscale.getDeviceRoutes(device.id)
        setDeviceModal({ type: 'routes', device, routes: r, loading: false, enabled: new Set(r.enabledRoutes ?? []) })
      } catch (e: unknown) {
        setModalError(e instanceof Error ? e.message : 'Failed to load routes')
        setDeviceModal((m) => m?.type === 'routes' ? { ...m, loading: false } : m)
      }
    } else if (action === 'tags') {
      setDeviceModal({ type: 'tags', device, tags: [...(device.tags ?? [])], input: '' })
    }
  }

  async function saveDeviceModal() {
    if (!deviceModal) return
    setModalSaving(true); setModalError(null)
    try {
      const { device } = deviceModal
      if (deviceModal.type === 'rename') {
        await tailscale.renameDevice(device.id, deviceModal.value)
        setDevices((prev) => prev.map((d) => d.id === device.id ? { ...d, name: deviceModal.value } : d))
        setDeviceModal(null)
      } else if (deviceModal.type === 'set-ip') {
        await tailscale.setDeviceIp(device.id, deviceModal.value)
        setDeviceModal(null)
      } else if (deviceModal.type === 'routes') {
        const result = await tailscale.setDeviceRoutes(device.id, [...deviceModal.enabled])
        setDevices((prev) => prev.map((d) => d.id === device.id ? { ...d, enabledRoutes: result.enabledRoutes, advertisedRoutes: result.advertisedRoutes } : d))
        setDeviceModal(null)
      } else if (deviceModal.type === 'tags') {
        await tailscale.setDeviceTags(device.id, deviceModal.tags)
        setDevices((prev) => prev.map((d) => d.id === device.id ? { ...d, tags: deviceModal.tags } : d))
        setDeviceModal(null)
      }
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Save failed')
    } finally { setModalSaving(false) }
  }

  useEffect(() => {
    loadDevices()
    // Also fetch local sidecar status silently — no error display if unavailable
    tailscale.localStatus().then(setLocalStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'users'    && !usersLoaded    && !usersLoading)    loadUsers()
    if (tab === 'dns'      && !dnsLoaded      && !dnsLoading)      loadDns()
    if (tab === 'acl'      && !aclLoaded      && !aclLoading)      loadAcl()
    if (tab === 'keys'     && !keysLoaded     && !keysLoading)     loadKeys()
    if (tab === 'settings' && !settingsLoaded && !settingsLoading) loadSettings()
  }, [tab])

  function refresh() {
    if      (tab === 'devices')  loadDevices()
    else if (tab === 'users')    { setUsersLoaded(false);    loadUsers() }
    else if (tab === 'dns')      { setDnsLoaded(false);      loadDns() }
    else if (tab === 'acl')      { setAclLoaded(false);      loadAcl() }
    else if (tab === 'keys')     { setKeysLoaded(false);     loadKeys() }
    else if (tab === 'settings') { setSettingsLoaded(false); loadSettings() }
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleSaveAcl() {
    setAclValidationError(null)
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
    : tab === 'users'    ? usersLoading
    : tab === 'dns'      ? dnsLoading
    : tab === 'acl'      ? aclLoading
    : tab === 'keys'     ? keysLoading
    : settingsLoading

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'devices',  label: 'Devices',        icon: <Server className="w-3.5 h-3.5" /> },
    { id: 'users',    label: 'Users',           icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'dns',      label: 'DNS',             icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'acl',      label: 'Access Control',  icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'keys',     label: 'Keys',            icon: <Key className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Settings',        icon: <Settings className="w-3.5 h-3.5" /> },
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
          <div className="space-y-2">
            {deviceActionError && <ErrorBanner msg={deviceActionError} />}
            {/* Updates available banner */}
            {(() => {
              const needsUpdate = devices.filter((d) => d.updateAvailable)
              if (needsUpdate.length === 0) return null
              return (
                <div className="flex items-start gap-2 p-3 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
                  <ArrowUpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{needsUpdate.length} device{needsUpdate.length > 1 ? 's have' : ' has'} a Tailscale client update available: </span>
                    <span className="text-yellow-200/70">{needsUpdate.map((d) => d.name ? d.name.split('.')[0] : d.hostname).join(', ')}</span>
                    <div className="mt-1 text-yellow-300/60">Updates must be applied directly on each device — the Tailscale API does not support remote client upgrades.</div>
                  </div>
                </div>
              )
            })()}
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
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      actionLoading={deviceActionLoading}
                      onAction={handleDeviceAction}
                      onMenuAction={openDeviceModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Subnet Routers section */}
            {devices.some((d) => (d.advertisedRoutes ?? []).some((r) => !EXIT_ROUTES.has(r))) && (
              <SubnetRoutersPanel devices={devices} />
            )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <DnsCard title="MagicDNS">
                <BoolBadge on={dns.magicDNS} />
              </DnsCard>
              <DnsCard title="Override Local DNS">
                <BoolBadge on={dns.overrideLocalDNS} />
                <p className="text-[10px] text-muted mt-1">Tailscale resolvers take precedence over OS DNS when enabled.</p>
              </DnsCard>
              {dns.tailnetDomain && (
                <DnsCard title="Tailnet Domain">
                  <div className="font-mono text-xs text-gray-300">{dns.tailnetDomain}</div>
                </DnsCard>
              )}
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
            {Object.keys(dns.splitDns ?? {}).length > 0 && (
              <div>
                <div className="text-xs text-muted mb-2 font-medium uppercase tracking-wide">Split DNS</div>
                <div className="card overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-surface-4 text-muted">
                        <th className="px-3 py-2 text-left font-medium">Domain</th>
                        <th className="px-3 py-2 text-left font-medium">Resolvers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(dns.splitDns).map(([domain, resolvers]) => (
                        <tr key={domain} className="border-b border-surface-4/50">
                          <td className="px-3 py-2 font-mono text-gray-300">{domain}</td>
                          <td className="px-3 py-2 font-mono text-muted">
                            {resolvers.length === 0 ? <span className="italic">none (blocked)</span> : resolvers.join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
                  onClick={handleValidateAcl}
                  disabled={aclValidating || !acl}
                  className="btn-ghost text-xs py-1"
                >
                  {aclValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Validate'}
                </button>
                <button
                  onClick={handleSaveAcl}
                  disabled={aclSaving || !acl}
                  className="btn-primary text-xs py-1"
                >
                  {aclSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save ACL'}
                </button>
              </div>
            </div>
            {aclValidateResult && (
              <div className={`flex items-center gap-2 text-xs rounded px-3 py-2 ${
                aclValidateResult.valid
                  ? 'text-green-400 bg-green-500/10 border border-green-500/30'
                  : 'text-warning bg-warning/10 border border-warning/30'
              }`}>
                {aclValidateResult.valid
                  ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {aclValidateResult.message}
              </div>
            )}
            {aclValidationError && (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {aclValidationError}
              </div>
            )}
            {aclError && <ErrorBanner msg={aclError} />}
            <AclEditor value={acl} onChange={(v) => { setAcl(v); setAclValidateResult(null) }} />
          </div>
        )
      )}
      {/* ── Keys tab ── */}
      {tab === 'keys' && (
        keysError ? <ErrorBanner msg={keysError} /> :
        keysLoading ? <LoadingSpinner /> :
        keys.length === 0 ? (
          <div className="text-sm text-muted text-center py-12">No keys found.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Capabilities</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2 text-left font-medium">Expires</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => <KeyRow key={k.id} k={k} />)}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Settings tab ── */}
      {tab === 'settings' && (
        settingsError ? <ErrorBanner msg={settingsError} /> :
        settingsLoading ? <LoadingSpinner /> :
        !tsSettings ? null : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <SettingCard title="Device Approval" value={tsSettings.devicesApprovalOn} />
            <SettingCard title="User Approval" value={tsSettings.usersApprovalOn} />
            <SettingCard title="Device Auto-Updates" value={tsSettings.devicesAutoUpdatesOn} />
            <SettingCard title="HTTPS Certificates" value={tsSettings.httpsEnabled} />
            <SettingCard title="Network Flow Logging" value={tsSettings.networkFlowLoggingOn} />
            <SettingCard title="Device Posture Collection" value={tsSettings.postureIdentityCollectionOn} />
            <SettingCard title="Regional Routing" value={tsSettings.regionalRoutingOn} />
            {tsSettings.devicesKeyDurationDays != null && (
              <DnsCard title="Key Expiry Duration">
                <div className="text-sm font-medium text-gray-200">{tsSettings.devicesKeyDurationDays} days</div>
              </DnsCard>
            )}
            {tsSettings.aclsExternallyManagedOn != null && (
              <DnsCard title="ACL Management">
                {tsSettings.aclsExternallyManagedOn ? (
                  <div className="space-y-1">
                    <span className="badge bg-yellow-500/20 text-yellow-300">Externally managed</span>
                    {tsSettings.aclsExternalLink && (
                      <div className="font-mono text-[10px] text-muted truncate">{tsSettings.aclsExternalLink}</div>
                    )}
                  </div>
                ) : (
                  <span className="badge bg-surface-4 text-muted">Admin console</span>
                )}
              </DnsCard>
            )}
          </div>
        )
      )}

      {/* ── Device edit modal ── */}
      {deviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeviceModal(null)}>
          <div className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-sm">
                {deviceModal.type === 'rename'  && 'Rename Machine'}
                {deviceModal.type === 'set-ip'  && 'Set IPv4 Address'}
                {deviceModal.type === 'routes'  && 'Edit Route Settings'}
                {deviceModal.type === 'tags'    && 'Edit ACL Tags'}
              </h3>
              <button onClick={() => setDeviceModal(null)} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>

            {deviceModal.type === 'rename' && (
              <input
                className="input w-full mb-4"
                value={deviceModal.value}
                onChange={(e) => setDeviceModal({ ...deviceModal, value: e.target.value })}
                placeholder="machine-name"
                autoFocus
              />
            )}

            {deviceModal.type === 'set-ip' && (
              <div className="mb-4 space-y-1">
                <input
                  className="input w-full"
                  value={deviceModal.value}
                  onChange={(e) => setDeviceModal({ ...deviceModal, value: e.target.value })}
                  placeholder="100.x.x.x"
                  autoFocus
                />
                <p className="text-xs text-muted">Changing the IP will break existing connections to this machine.</p>
              </div>
            )}

            {deviceModal.type === 'routes' && (
              <div className="mb-4">
                {deviceModal.loading ? (
                  <div className="flex items-center gap-2 text-muted text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading routes…</div>
                ) : !deviceModal.routes?.advertisedRoutes?.length ? (
                  <p className="text-sm text-muted py-2">This device has no advertised routes.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted mb-2">Enable or disable advertised subnet routes and exit node:</p>
                    {deviceModal.routes.advertisedRoutes.map((route) => (
                      <label key={route} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deviceModal.enabled.has(route)}
                          onChange={(e) => {
                            const next = new Set(deviceModal.enabled)
                            if (e.target.checked) next.add(route)
                            else next.delete(route)
                            setDeviceModal({ ...deviceModal, enabled: next })
                          }}
                          className="accent-accent"
                        />
                        <span className="font-mono text-xs text-gray-300">{route}</span>
                        {EXIT_ROUTES.has(route) && <span className="text-[10px] text-purple-300 bg-purple-500/20 px-1 rounded">exit node</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {deviceModal.type === 'tags' && (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap gap-1 min-h-[28px]">
                  {deviceModal.tags.length === 0 && <span className="text-muted text-xs">No tags</span>}
                  {deviceModal.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-surface-3 text-gray-300">
                      {tag}
                      <button onClick={() => setDeviceModal({ ...deviceModal, tags: deviceModal.tags.filter((t) => t !== tag) })} className="text-muted hover:text-danger ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    value={deviceModal.input}
                    onChange={(e) => setDeviceModal({ ...deviceModal, input: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && deviceModal.input.trim()) {
                        const tag = deviceModal.input.trim().startsWith('tag:') ? deviceModal.input.trim() : `tag:${deviceModal.input.trim()}`
                        if (!deviceModal.tags.includes(tag)) setDeviceModal({ ...deviceModal, tags: [...deviceModal.tags, tag], input: '' })
                        else setDeviceModal({ ...deviceModal, input: '' })
                      }
                    }}
                    placeholder="tag:name (Enter to add)"
                  />
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => {
                      if (!deviceModal.input.trim()) return
                      const tag = deviceModal.input.trim().startsWith('tag:') ? deviceModal.input.trim() : `tag:${deviceModal.input.trim()}`
                      if (!deviceModal.tags.includes(tag)) setDeviceModal({ ...deviceModal, tags: [...deviceModal.tags, tag], input: '' })
                      else setDeviceModal({ ...deviceModal, input: '' })
                    }}
                  >Add</button>
                </div>
                <p className="text-xs text-muted">Tags must exist in your ACL policy file.</p>
              </div>
            )}

            {modalError && <div className="text-xs text-danger mb-3">{modalError}</div>}

            <div className="flex justify-end gap-2">
              <button className="btn-ghost text-xs" onClick={() => setDeviceModal(null)}>Cancel</button>
              <button
                className="btn-primary text-xs"
                onClick={saveDeviceModal}
                disabled={modalSaving || (deviceModal.type === 'routes' && deviceModal.loading)}
              >
                {modalSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tag badge ─────────────────────────────────────────────────────────────────

type TagStyle = { bg: string; text: string; icon: React.ReactNode }

const TAG_KEYWORD_MAP: { keywords: string[]; style: TagStyle }[] = [
  {
    keywords: ['k8s', 'kubernetes', 'kube'],
    style: { bg: 'bg-blue-500/20', text: 'text-blue-300', icon: <Container className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['home', 'house', 'local'],
    style: { bg: 'bg-green-500/20', text: 'text-green-300', icon: <Home className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['vpn', 'exit', 'relay'],
    style: { bg: 'bg-purple-500/20', text: 'text-purple-300', icon: <Lock className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['server', 'host', 'node', 'nas'],
    style: { bg: 'bg-orange-500/20', text: 'text-orange-300', icon: <Server className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['router', 'gateway', 'net', 'switch'],
    style: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', icon: <Router className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['pi', 'raspberry', 'arm'],
    style: { bg: 'bg-red-500/20', text: 'text-red-300', icon: <Cpu className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['cloud', 'aws', 'gcp', 'azure', 'vps', 'remote'],
    style: { bg: 'bg-sky-500/20', text: 'text-sky-300', icon: <Cloud className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['media', 'plex', 'jellyfin', 'tv', 'stream'],
    style: { bg: 'bg-pink-500/20', text: 'text-pink-300', icon: <Tv className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['phone', 'mobile', 'android', 'ios', 'iphone', 'tablet'],
    style: { bg: 'bg-violet-500/20', text: 'text-violet-300', icon: <MonitorSmartphone className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['dev', 'test', 'lab', 'build', 'ci'],
    style: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', icon: <Wrench className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['ssh', 'admin', 'key', 'auth', 'mgmt'],
    style: { bg: 'bg-amber-500/20', text: 'text-amber-300', icon: <Key className="w-2.5 h-2.5" /> },
  },
  {
    keywords: ['wifi', 'wireless', 'ap', 'wlan'],
    style: { bg: 'bg-teal-500/20', text: 'text-teal-300', icon: <Wifi className="w-2.5 h-2.5" /> },
  },
]

const DEFAULT_TAG_STYLE: TagStyle = {
  bg: 'bg-surface-4',
  text: 'text-muted',
  icon: <Tag className="w-2.5 h-2.5" />,
}

function getTagStyle(tag: string): TagStyle {
  const lower = tag.toLowerCase()
  for (const { keywords, style } of TAG_KEYWORD_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return style
  }
  return DEFAULT_TAG_STYLE
}

function TagBadge({ tag }: { tag: string }) {
  const label = tag.replace(/^tag:/, '')
  const { bg, text, icon } = getTagStyle(label)
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${bg} ${text}`}>
      {icon}
      {label}
    </span>
  )
}

// ── Device row ────────────────────────────────────────────────────────────────

const EXIT_ROUTES = new Set(['0.0.0.0/0', '::/0'])

function DeviceRow({ device, actionLoading, onAction, onMenuAction }: {
  device: TailscaleDevice
  actionLoading: string | null
  onAction: (action: 'delete' | 'expire' | 'authorize' | 'toggle-expiry', deviceId: string, extra?: unknown) => void
  onMenuAction: (action: 'rename' | 'set-ip' | 'routes' | 'tags', device: TailscaleDevice) => void
}) {
  const ipv4 = device.addresses?.find((a) => !a.includes(':')) ?? device.addresses?.[0] ?? '—'
  const lastSeen = device.online ? 'now' : fmtRelativeTime(device.lastSeen)
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  function menuItem(label: string, icon: React.ReactNode, onClick: () => void, danger = false) {
    return (
      <button
        key={label}
        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-surface-3 transition-colors ${danger ? 'text-danger' : 'text-gray-300'}`}
        onClick={() => { setMenuOpen(false); onClick() }}
      >
        {icon}{label}
      </button>
    )
  }

  const isLoading = !!actionLoading && actionLoading.includes(device.id)

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      {/* Hostname + tags */}
      <td className="px-3 py-2">
        <div className="font-medium text-gray-200">{displayName}</div>
        {showOsHostname && <div className="text-muted text-[10px] font-mono">{device.hostname}</div>}
        {device.tags && device.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {device.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
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
            <div className="relative group">
              <span className="px-1 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 whitespace-nowrap cursor-default">
                {subnets.length} subnet{subnets.length > 1 ? 's' : ''}
              </span>
              <div className="absolute left-0 top-5 z-50 hidden group-hover:block bg-surface-2 border border-surface-4 rounded shadow-lg p-2 min-w-[160px]">
                <div className="text-[10px] text-muted mb-1 font-medium uppercase tracking-wide">Advertised Subnets</div>
                {subnets.map((s) => (
                  <div key={s} className="font-mono text-[11px] text-gray-300 py-0.5">{s}</div>
                ))}
              </div>
            </div>
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
      {/* Three-dot menu */}
      <td className="px-2 py-2">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            disabled={isLoading}
            className="text-muted hover:text-gray-300 transition-colors p-0.5 rounded"
            title="Device actions"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <MoreVertical className="w-4 h-4" />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-40 bg-surface-2 border border-surface-4 rounded shadow-lg min-w-[180px] py-1">
              {menuItem('Edit machine name',  <Pencil className="w-3.5 h-3.5" />, () => onMenuAction('rename', device))}
              {menuItem('Edit machine IPv4',  <Pencil className="w-3.5 h-3.5" />, () => onMenuAction('set-ip', device))}
              {menuItem('Edit route settings',<Router className="w-3.5 h-3.5" />, () => onMenuAction('routes', device))}
              {menuItem('Edit ACL tags',      <Tag    className="w-3.5 h-3.5" />, () => onMenuAction('tags', device))}
              {menuItem(
                device.keyExpiryDisabled ? 'Enable key expiry' : 'Disable key expiry',
                <Key className="w-3.5 h-3.5" />,
                () => onAction('toggle-expiry', device.id, !device.keyExpiryDisabled),
              )}
              {!device.authorized && menuItem('Authorize', <ShieldCheck className="w-3.5 h-3.5" />, () => onAction('authorize', device.id))}
              <div className="border-t border-surface-4 my-1" />
              {menuItem('Expire key now', <Timer  className="w-3.5 h-3.5" />, () => onAction('expire', device.id))}
              {menuItem('Remove',         <Trash2 className="w-3.5 h-3.5" />, () => onAction('delete', device.id), true)}
            </div>
          )}
        </div>
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

// ── Key row ───────────────────────────────────────────────────────────────────

function KeyRow({ k }: { k: TailscaleKey }) {
  const isExpired = k.expires ? new Date(k.expires) < new Date() : false
  const isRevoked = !!k.revoked
  const isInvalid = k.invalid || isExpired || isRevoked
  const caps = k.capabilities?.devices?.create

  const keyTypeColors: Record<string, string> = {
    auth:      'bg-blue-500/20 text-blue-300',
    api:       'bg-purple-500/20 text-purple-300',
    client:    'bg-orange-500/20 text-orange-300',
    federated: 'bg-teal-500/20 text-teal-300',
  }

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate" title={k.description || k.id}>
        {k.description || <span className="font-mono text-muted text-[10px]">{k.id}</span>}
      </td>
      <td className="px-3 py-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${keyTypeColors[k.keyType] ?? 'bg-surface-4 text-muted'}`}>
          {k.keyType}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {caps?.reusable      && <span className="badge bg-surface-4 text-muted">reusable</span>}
          {caps?.ephemeral     && <span className="badge bg-surface-4 text-muted">ephemeral</span>}
          {caps?.preauthorized && <span className="badge bg-green-500/20 text-green-300">pre-auth</span>}
          {k.scopes?.map((s) => (
            <span key={s} className="badge bg-surface-4 text-muted">{s}</span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-muted whitespace-nowrap">{k.created ? fmtRelativeTime(k.created) : '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {k.expires
          ? <span className={isExpired ? 'text-danger' : daysUntil(k.expires) <= 7 ? 'text-yellow-400' : 'text-muted'}>
              {isExpired ? 'Expired' : fmtExpiry(k.expires)}
            </span>
          : <span className="text-muted">—</span>
        }
      </td>
      <td className="px-3 py-2">
        {isRevoked
          ? <span className="badge-danger">revoked</span>
          : isExpired
            ? <span className="badge-danger">expired</span>
            : <span className="badge-ok">valid</span>
        }
      </td>
    </tr>
  )
}

// ── Subnet Routers Panel ──────────────────────────────────────────────────────

function SubnetRoutersPanel({ devices }: { devices: TailscaleDevice[] }) {
  // Build subnet → advertisers map
  const subnetMap = new Map<string, TailscaleDevice[]>()
  for (const device of devices) {
    for (const route of (device.advertisedRoutes ?? []).filter((r) => !EXIT_ROUTES.has(r))) {
      if (!subnetMap.has(route)) subnetMap.set(route, [])
      subnetMap.get(route)!.push(device)
    }
  }
  const entries = [...subnetMap.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))

  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Subnet Routers</div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-4 text-muted">
              <th className="px-3 py-2 text-left font-medium">Subnet</th>
              <th className="px-3 py-2 text-left font-medium">Advertised By</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([subnet, advertisers]) => (
              <tr key={subnet} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
                <td className="px-3 py-2 font-mono text-gray-300">{subnet}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {advertisers.map((d) => {
                      const name = d.name ? d.name.split('.')[0] : d.hostname
                      const enabled = (d.enabledRoutes ?? []).includes(subnet)
                      return (
                        <span key={d.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${d.online ? 'bg-surface-3 text-gray-300' : 'bg-surface-3 text-muted'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.online ? 'bg-green-400' : 'bg-surface-4'}`} />
                          {name}
                          {!enabled && <span className="text-yellow-400/70 ml-0.5" title="Route advertised but not enabled">!</span>}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {advertisers.some((d) => (d.enabledRoutes ?? []).includes(subnet))
                    ? <span className="badge-ok">enabled</span>
                    : <span className="bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium">advertised only</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

// ── Setting card ──────────────────────────────────────────────────────────────

function SettingCard({ title, value }: { title: string; value: boolean | null | undefined }) {
  return (
    <DnsCard title={title}>
      {value == null
        ? <span className="text-muted text-xs">Unknown</span>
        : <BoolBadge on={value} />
      }
    </DnsCard>
  )
}

function BoolBadge({ on }: { on: boolean }) {
  return on
    ? <span className="text-sm font-medium text-green-400">Enabled</span>
    : <span className="text-sm font-medium text-muted">Disabled</span>
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
