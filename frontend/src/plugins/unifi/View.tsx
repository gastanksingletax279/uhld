import { useEffect, useState } from 'react'
import {
  api,
  UniFiClient, UniFiDevice, UniFiPort,
  UniFiNetwork, UniFiWlan, UniFiFirewallRule, UniFiFirewallGroup, UniFiZone,
} from '../../api/client'
import {
  RefreshCw, Wifi, Network, Loader2, AlertCircle,
  RotateCcw, ChevronUp, ChevronDown, ArrowUpCircle,
} from 'lucide-react'

type Tab = 'clients' | 'devices' | 'ports' | 'networks' | 'wlans' | 'firewall'

// ── Generic sort helpers ───────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

function sortedBy<T>(arr: T[], key: (item: T) => string | number, dir: SortDir): T[] {
  return [...arr].sort((a, b) => {
    const av = key(a), bv = key(b)
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortTh({
  label, active, dir, onClick, right,
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void; right?: boolean
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-gray-200 transition-colors whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${active ? 'text-gray-200' : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <ChevronUp className="w-3 h-3 opacity-20" />
        }
      </span>
    </th>
  )
}

// ── Error / Loading helpers ────────────────────────────────────────────────────

function SectionError({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {msg}
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex items-center gap-2 text-muted text-sm py-10 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading…
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function UniFiView({ instanceId = 'default' }: { instanceId?: string }) {
  const unifi = api.unifi(instanceId)
  const [tab, setTab] = useState<Tab>('clients')

  const [clients, setClients] = useState<UniFiClient[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)

  const [devices, setDevices] = useState<UniFiDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [devicesError, setDevicesError] = useState<string | null>(null)

  const [ports, setPorts] = useState<UniFiPort[]>([])
  const [portsLoading, setPortsLoading] = useState(false)
  const [portsError, setPortsError] = useState<string | null>(null)
  const [portsLoaded, setPortsLoaded] = useState(false)

  const [networks, setNetworks] = useState<UniFiNetwork[]>([])
  const [networksLoading, setNetworksLoading] = useState(false)
  const [networksError, setNetworksError] = useState<string | null>(null)
  const [networksLoaded, setNetworksLoaded] = useState(false)

  const [wlans, setWlans] = useState<UniFiWlan[]>([])
  const [wlansLoading, setWlansLoading] = useState(false)
  const [wlansError, setWlansError] = useState<string | null>(null)
  const [wlansLoaded, setWlansLoaded] = useState(false)

  const [fwRules, setFwRules] = useState<UniFiFirewallRule[]>([])
  const [fwGroups, setFwGroups] = useState<UniFiFirewallGroup[]>([])
  const [fwZones, setFwZones] = useState<UniFiZone[]>([])
  const [firewallLoading, setFirewallLoading] = useState(false)
  const [firewallError, setFirewallError] = useState<string | null>(null)
  const [firewallLoaded, setFirewallLoaded] = useState(false)

  async function loadClients() {
    setClientsLoading(true); setClientsError(null)
    try { setClients((await unifi.clients()).clients ?? []) }
    catch (e: unknown) { setClientsError(e instanceof Error ? e.message : 'Failed to load clients') }
    finally { setClientsLoading(false) }
  }

  async function loadDevices() {
    setDevicesLoading(true); setDevicesError(null)
    try { setDevices((await unifi.devices()).devices ?? []) }
    catch (e: unknown) { setDevicesError(e instanceof Error ? e.message : 'Failed to load devices') }
    finally { setDevicesLoading(false) }
  }

  async function loadPorts() {
    setPortsLoading(true); setPortsError(null)
    try { setPorts((await unifi.ports()).ports ?? []); setPortsLoaded(true) }
    catch (e: unknown) { setPortsError(e instanceof Error ? e.message : 'Failed to load ports') }
    finally { setPortsLoading(false) }
  }

  async function loadNetworks() {
    setNetworksLoading(true); setNetworksError(null)
    try { setNetworks((await unifi.networks()).networks ?? []); setNetworksLoaded(true) }
    catch (e: unknown) { setNetworksError(e instanceof Error ? e.message : 'Failed to load networks') }
    finally { setNetworksLoading(false) }
  }

  async function loadWlans() {
    setWlansLoading(true); setWlansError(null)
    try { setWlans((await unifi.wlans()).wlans ?? []); setWlansLoaded(true) }
    catch (e: unknown) { setWlansError(e instanceof Error ? e.message : 'Failed to load WiFi') }
    finally { setWlansLoading(false) }
  }

  async function loadFirewall() {
    setFirewallLoading(true); setFirewallError(null)
    try {
      const r = await unifi.firewall()
      setFwRules(r.rules ?? []); setFwGroups(r.groups ?? []); setFwZones(r.zones ?? [])
      setFirewallLoaded(true)
    }
    catch (e: unknown) { setFirewallError(e instanceof Error ? e.message : 'Failed to load firewall') }
    finally { setFirewallLoading(false) }
  }

  useEffect(() => { loadClients(); loadDevices() }, [])

  useEffect(() => {
    if (tab === 'ports'    && !portsLoaded    && !portsLoading)    loadPorts()
    if (tab === 'networks' && !networksLoaded && !networksLoading) loadNetworks()
    if (tab === 'wlans'    && !wlansLoaded    && !wlansLoading)    loadWlans()
    if (tab === 'firewall' && !firewallLoaded && !firewallLoading) loadFirewall()
  }, [tab])

  function refreshCurrent() {
    if (tab === 'clients')  { loadClients(); loadDevices() }
    else if (tab === 'devices')  loadDevices()
    else if (tab === 'ports')    loadPorts()
    else if (tab === 'networks') loadNetworks()
    else if (tab === 'wlans')    loadWlans()
    else if (tab === 'firewall') loadFirewall()
  }

  const isLoading = tab === 'clients'  ? (clientsLoading || devicesLoading)
    : tab === 'devices'  ? devicesLoading
    : tab === 'ports'    ? portsLoading
    : tab === 'networks' ? networksLoading
    : tab === 'wlans'    ? wlansLoading
    : firewallLoading

  const wifiCount   = clients.filter((c) => !c.is_wired).length
  const wiredCount  = clients.filter((c) =>  c.is_wired).length
  const devOnline   = devices.filter((d) => d.state === 'ONLINE').length

  const TABS: { id: Tab; label: string }[] = [
    { id: 'clients',  label: `Clients (${clients.length})` },
    { id: 'devices',  label: `Devices (${devices.length})` },
    { id: 'ports',    label: 'Ports' },
    { id: 'networks', label: 'Networks' },
    { id: 'wlans',    label: 'WiFi' },
    { id: 'firewall', label: 'Firewall' },
  ]

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wifi className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">UniFi</h2>
          {!clientsLoading && !devicesLoading && (
            <span className="text-xs text-muted">
              {wifiCount} wifi · {wiredCount} wired · {devOnline}/{devices.length} devices
            </span>
          )}
        </div>
        <button onClick={refreshCurrent} disabled={isLoading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-4 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'clients'  && (clientsLoading  ? <SectionLoader /> : clientsError  ? <SectionError msg={clientsError} />  : <ClientsTab  clients={clients}  onRefresh={loadClients} onKick={(id) => unifi.kickClient(id)} />)}
      {tab === 'devices'  && (devicesLoading  ? <SectionLoader /> : devicesError  ? <SectionError msg={devicesError} />  : <DevicesTab  devices={devices} />)}
      {tab === 'ports'    && (portsLoading    ? <SectionLoader /> : portsError    ? <SectionError msg={portsError} />    : <PortsTab    ports={ports} />)}
      {tab === 'networks' && (networksLoading ? <SectionLoader /> : networksError ? <SectionError msg={networksError} /> : <NetworksTab networks={networks} />)}
      {tab === 'wlans'    && (wlansLoading    ? <SectionLoader /> : wlansError    ? <SectionError msg={wlansError} />    : <WlansTab    wlans={wlans} />)}
      {tab === 'firewall' && (firewallLoading ? <SectionLoader /> : firewallError ? <SectionError msg={firewallError} /> : <FirewallTab  rules={fwRules} groups={fwGroups} zones={fwZones} />)}
    </div>
  )
}

// ── Clients tab ───────────────────────────────────────────────────────────────

type ClientSortKey = 'hostname' | 'type' | 'ip' | 'essid' | 'rssi' | 'rx_bytes' | 'tx_bytes' | 'uptime' | 'connected_at'
type ClientFilter  = 'all' | 'wifi' | 'wired' | 'vpn'

function ClientsTab({ clients, onRefresh, onKick }: { clients: UniFiClient[]; onRefresh: () => void; onKick: (id: string) => Promise<unknown> }) {
  const [filter, setFilter]   = useState<ClientFilter>('all')
  const [sortKey, setSortKey] = useState<ClientSortKey>('hostname')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: ClientSortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const FILTERS: { id: ClientFilter; label: string }[] = [
    { id: 'all',     label: `All (${clients.length})` },
    { id: 'wifi',    label: `WiFi (${clients.filter((c) => c.type === 'WIRELESS').length})` },
    { id: 'wired',   label: `Wired (${clients.filter((c) => c.type === 'WIRED').length})` },
    { id: 'vpn',     label: `VPN (${clients.filter((c) => c.type === 'VPN').length})` },
  ]

  const filtered = clients.filter((c) =>
    filter === 'all'   ? true :
    filter === 'wifi'  ? c.type === 'WIRELESS' :
    filter === 'wired' ? c.type === 'WIRED' :
    c.type === 'VPN'
  )

  const sorted = sortedBy(filtered, (c) => {
    switch (sortKey) {
      case 'hostname':     return c.hostname.toLowerCase()
      case 'type':         return c.type
      case 'ip':           return c.ip || ''
      case 'essid':        return c.essid || ''
      case 'rssi':         return c.rssi ?? -999
      case 'rx_bytes':     return c.rx_bytes
      case 'tx_bytes':     return c.tx_bytes
      case 'uptime':       return c.uptime ?? 0
      case 'connected_at': return c.connected_at || ''
      default: return ''
    }
  }, sortDir)

  if (clients.length === 0)
    return <div className="text-sm text-muted text-center py-12">No clients connected.</div>

  const sh = (k: ClientSortKey, label: string, right = false) => (
    <SortTh label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} right={right} />
  )

  // Detect which columns to show based on available data
  const hasBytes     = clients.some((c) => c.rx_bytes > 0 || c.tx_bytes > 0)
  const hasUptime    = clients.some((c) => c.uptime != null)
  const hasConnected = clients.some((c) => c.connected_at)
  const hasRssi      = clients.some((c) => c.rssi != null)

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${filter === f.id ? 'bg-surface-4 text-gray-100' : 'text-muted hover:text-gray-300'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-4 text-muted">
              {sh('hostname', 'Name')}
              {sh('type', 'Type')}
              {sh('ip', 'IP')}
              {hasRssi && sh('rssi', 'Signal', true)}
              {hasBytes && sh('tx_bytes', 'Up', true)}
              {hasBytes && sh('rx_bytes', 'Down', true)}
              {hasUptime    && sh('uptime', 'Uptime', true)}
              {hasConnected && sh('connected_at', 'Connected', true)}
              <th className="px-3 py-2 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <ClientRow key={c.id || c.mac} client={c} onRefresh={onRefresh} onKick={onKick}
                hasBytes={hasBytes} hasUptime={hasUptime} hasConnected={hasConnected} hasRssi={hasRssi} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClientRow({
  client: c, onRefresh, onKick, hasBytes, hasUptime, hasConnected, hasRssi,
}: {
  client: UniFiClient; onRefresh: () => void; onKick: (id: string) => Promise<unknown>
  hasBytes: boolean; hasUptime: boolean; hasConnected: boolean; hasRssi: boolean
}) {
  const [kicking, setKicking] = useState(false)
  const [kickMsg, setKickMsg] = useState<string | null>(null)

  async function bounce() {
    if (!window.confirm(`Bounce ${c.hostname || c.mac}? This will force them to reconnect.`)) return
    setKicking(true); setKickMsg(null)
    try {
      await onKick(c.id || c.mac)
      setKickMsg('done')
      setTimeout(() => { setKickMsg(null); onRefresh() }, 1500)
    } catch (e: unknown) {
      setKickMsg(e instanceof Error ? e.message : 'Error')
    } finally { setKicking(false) }
  }

  return (
    <tr className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
      <td className="px-3 py-2">
        <div className="font-medium text-gray-200">{c.hostname || '—'}</div>
        {c.mac && <div className="font-mono text-muted text-[10px]">{c.mac}</div>}
      </td>
      <td className="px-3 py-2">
        <ClientTypeBadge type={c.type} essid={c.essid} />
      </td>
      <td className="px-3 py-2 font-mono text-muted">{c.ip || '—'}</td>
      {hasRssi && (
        <td className="px-3 py-2 text-right font-mono text-muted">
          {c.rssi != null ? `${c.rssi} dBm` : '—'}
        </td>
      )}
      {hasBytes && (
        <>
          <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(c.tx_bytes)}</td>
          <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(c.rx_bytes)}</td>
        </>
      )}
      {hasUptime    && <td className="px-3 py-2 text-right font-mono text-muted">{c.uptime != null ? fmtUptime(c.uptime) : '—'}</td>}
      {hasConnected && <td className="px-3 py-2 text-right text-muted whitespace-nowrap">{c.connected_at ? fmtRelTime(c.connected_at) : '—'}</td>}
      <td className="px-3 py-2">
        {c.type !== 'WIRED' && (
          <button onClick={bounce} disabled={kicking} title="Bounce (force reconnect)"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
              kickMsg === 'done' ? 'bg-green-900/30 border-green-700/50 text-green-400'
              : kickMsg ? 'bg-red-900/30 border-red-700/50 text-red-400'
              : 'bg-surface-3 border-white/10 text-muted hover:text-gray-200 hover:border-white/20'
            }`}>
            <RotateCcw className={`w-3 h-3 ${kicking ? 'animate-spin' : ''}`} />
            {kickMsg ?? 'bounce'}
          </button>
        )}
      </td>
    </tr>
  )
}

function ClientTypeBadge({ type, essid }: { type: string; essid?: string | null }) {
  if (type === 'WIRELESS') {
    return (
      <div>
        <span className="flex items-center gap-1 text-blue-400"><Wifi className="w-3 h-3" /> wifi</span>
        {essid && <div className="text-muted text-[10px]">{essid}</div>}
      </div>
    )
  }
  if (type === 'VPN') return <span className="badge bg-purple-900/40 text-purple-300">vpn</span>
  return <span className="flex items-center gap-1 text-muted"><Network className="w-3 h-3" /> wired</span>
}

// ── Devices tab ───────────────────────────────────────────────────────────────

type DeviceSortKey = 'name' | 'model' | 'ip' | 'firmware' | 'state' | 'type' | 'uptime'

function DevicesTab({ devices }: { devices: UniFiDevice[] }) {
  const [sortKey, setSortKey] = useState<DeviceSortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: DeviceSortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const hasUptime = devices.some((d) => d.uptime != null)
  const hasType   = devices.some((d) => d.type)

  const sorted = sortedBy(devices, (d) => {
    switch (sortKey) {
      case 'name':     return d.name.toLowerCase()
      case 'model':    return d.model.toLowerCase()
      case 'ip':       return d.ip
      case 'firmware': return d.firmware_version
      case 'state':    return d.state
      case 'type':     return d.type || ''
      case 'uptime':   return d.uptime ?? 0
      default: return ''
    }
  }, sortDir)

  if (devices.length === 0)
    return <div className="text-sm text-muted text-center py-12">No UniFi devices found.</div>

  const sh = (k: DeviceSortKey, label: string, right = false) => (
    <SortTh label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} right={right} />
  )

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            {sh('name', 'Name')}
            {hasType && sh('type', 'Type')}
            {sh('model', 'Model')}
            {sh('ip', 'IP')}
            {sh('firmware', 'Firmware')}
            {hasUptime && sh('uptime', 'Uptime', true)}
            {sh('state', 'Status')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.id || d.mac} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              <td className="px-3 py-2">
                <div className="font-medium text-gray-200">{d.name || d.mac}</div>
                <div className="font-mono text-muted text-[10px]">{d.mac}</div>
              </td>
              {hasType && (
                <td className="px-3 py-2">
                  <span className="badge bg-surface-4 text-muted">{fmtDeviceType(d.type || '')}</span>
                </td>
              )}
              <td className="px-3 py-2 text-muted">{d.model || '—'}</td>
              <td className="px-3 py-2 font-mono text-muted">{d.ip || '—'}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-muted text-[11px]">{d.firmware_version || '—'}</span>
                  {d.firmware_updatable && (
                    <span title="Firmware update available" className="text-yellow-400">
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </td>
              {hasUptime && (
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {d.uptime != null ? fmtUptime(d.uptime) : '—'}
                </td>
              )}
              <td className="px-3 py-2">
                {d.state === 'ONLINE'
                  ? <span className="badge-ok">online</span>
                  : <span className="badge-error">offline</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Ports tab ─────────────────────────────────────────────────────────────────

function PortsTab({ ports }: { ports: UniFiPort[] }) {
  if (ports.length === 0)
    return <div className="text-sm text-muted text-center py-12">No switch ports found. Ports are fetched from adopted switch devices.</div>

  const byDevice = ports.reduce<Record<string, UniFiPort[]>>((acc, p) => {
    ;(acc[p.device_name] ??= []).push(p)
    return acc
  }, {})

  const hasBytes     = ports.some((p) => p.rx_bytes > 0 || p.tx_bytes > 0)
  const hasPoe       = ports.some((p) => p.poe_enabled)
  const hasConnector = ports.some((p) => p.connector)

  return (
    <div className="space-y-4">
      {Object.entries(byDevice).sort(([a], [b]) => a.localeCompare(b)).map(([device, dPorts]) => (
        <div key={device} className="card overflow-x-auto">
          <div className="px-3 py-2 border-b border-surface-4 text-xs font-semibold text-gray-300">{device}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-4 text-muted">
                <th className="px-3 py-2 text-right font-medium w-10">#</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Speed</th>
                <th className="px-3 py-2 text-right font-medium">Max</th>
                {hasConnector && <th className="px-3 py-2 text-left font-medium">Type</th>}
                {hasPoe       && <th className="px-3 py-2 text-left font-medium">PoE</th>}
                <th className="px-3 py-2 text-right font-medium">VLAN</th>
                {hasBytes     && <th className="px-3 py-2 text-right font-medium">TX</th>}
                {hasBytes     && <th className="px-3 py-2 text-right font-medium">RX</th>}
              </tr>
            </thead>
            <tbody>
              {[...dPorts].sort((a, b) => a.idx - b.idx).map((p) => (
                <tr key={`${p.device_id}-${p.idx}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
                  <td className="px-3 py-2 text-right font-mono text-muted">{p.idx}</td>
                  <td className="px-3 py-2">
                    <div className="text-gray-300">{p.description || p.name || `Port ${p.idx}`}</div>
                    {p.description && p.name && p.description !== p.name && (
                      <div className="text-muted text-[10px]">{p.name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {p.state === 'UP'
                      ? <span className="badge-ok">up</span>
                      : <span className="badge bg-surface-4 text-muted">down</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    {p.state === 'UP' && p.speed_mbps > 0 ? fmtSpeed(p.speed_mbps) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    {p.max_speed_mbps > 0 ? fmtSpeed(p.max_speed_mbps) : '—'}
                  </td>
                  {hasConnector && <td className="px-3 py-2 text-muted">{p.connector || '—'}</td>}
                  {hasPoe && (
                    <td className="px-3 py-2">
                      {p.poe_enabled
                        ? <span className={`text-xs ${p.poe_state === 'UP' ? 'text-yellow-400' : 'text-muted'}`}>
                            {p.poe_standard || 'PoE'}
                          </span>
                        : <span className="text-muted">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    {p.tagged_vlans?.length > 0 ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-blue-400 font-semibold">Trunk</span>
                        <span className="text-xs">{p.tagged_vlans.join(', ')}</span>
                      </span>
                    ) : p.vlan > 0 ? p.vlan : '—'}
                  </td>
                  {hasBytes && <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(p.tx_bytes)}</td>}
                  {hasBytes && <td className="px-3 py-2 text-right font-mono text-muted">{fmtBytes(p.rx_bytes)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Networks tab ──────────────────────────────────────────────────────────────

type NetworkSortKey = 'name' | 'vlan_id' | 'management' | 'purpose'

function NetworksTab({ networks }: { networks: UniFiNetwork[] }) {
  const [sortKey, setSortKey] = useState<NetworkSortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: NetworkSortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const hasSubnet = networks.some((n) => n.ip_subnet)
  const hasDhcp   = networks.some((n) => n.dhcpd_enabled)

  const sorted = sortedBy(networks, (n) => {
    switch (sortKey) {
      case 'name':       return n.name.toLowerCase()
      case 'vlan_id':    return n.vlan_id
      case 'management': return n.management || n.purpose || ''
      case 'purpose':    return n.purpose || n.management || ''
      default: return ''
    }
  }, sortDir)

  if (networks.length === 0)
    return <div className="text-sm text-muted text-center py-12">No networks configured.</div>

  const sh = (k: NetworkSortKey, label: string, right = false) => (
    <SortTh label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} right={right} />
  )

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            {sh('name', 'Name')}
            {sh('management', 'Type')}
            {sh('vlan_id', 'VLAN', true)}
            {hasSubnet && <th className="px-3 py-2 text-left font-medium">Subnet</th>}
            {hasDhcp   && <th className="px-3 py-2 text-left font-medium">DHCP Range</th>}
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((n) => (
            <tr key={n.id} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              <td className="px-3 py-2">
                <div className="font-medium text-gray-200">{n.name}</div>
                {n.is_default && <span className="text-[10px] text-muted">default</span>}
              </td>
              <td className="px-3 py-2">
                <span className="badge bg-surface-4 text-muted capitalize">
                  {fmtNetworkType(n.management || n.purpose || '')}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-muted">
                {n.vlan_id > 0 ? n.vlan_id : '—'}
              </td>
              {hasSubnet && <td className="px-3 py-2 font-mono text-muted">{n.ip_subnet || '—'}</td>}
              {hasDhcp   && (
                <td className="px-3 py-2 font-mono text-muted text-[11px]">
                  {n.dhcpd_enabled && n.dhcpd_start ? `${n.dhcpd_start} – ${n.dhcpd_stop}` : '—'}
                </td>
              )}
              <td className="px-3 py-2">
                {n.enabled ? <span className="badge-ok">enabled</span> : <span className="badge-error">disabled</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── WiFi tab ──────────────────────────────────────────────────────────────────

type WlanSortKey = 'name' | 'security_type' | 'network_type'

function WlansTab({ wlans }: { wlans: UniFiWlan[] }) {
  const [sortKey, setSortKey] = useState<WlanSortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: WlanSortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const hasVlan = wlans.some((w) => w.vlan_enabled && w.vlan)

  const sorted = sortedBy(wlans, (w) => {
    switch (sortKey) {
      case 'name':         return w.name.toLowerCase()
      case 'security_type': return w.security_type
      case 'network_type': return w.network_type
      default: return ''
    }
  }, sortDir)

  if (wlans.length === 0)
    return <div className="text-sm text-muted text-center py-12">No WiFi networks configured.</div>

  const sh = (k: WlanSortKey, label: string) => (
    <SortTh label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} />
  )

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            {sh('name', 'SSID')}
            {sh('security_type', 'Security')}
            {sh('network_type', 'Network')}
            {hasVlan && <th className="px-3 py-2 text-right font-medium">VLAN</th>}
            <th className="px-3 py-2 text-left font-medium">Flags</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => (
            <tr key={w.id} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              <td className="px-3 py-2">
                <span className="font-medium text-gray-200">{w.name}</span>
                {w.hide_name && <span className="ml-1.5 text-muted text-[10px]">(hidden)</span>}
              </td>
              <td className="px-3 py-2">
                <span className={`badge ${fmtSecurityColor(w.security_type)}`}>
                  {fmtSecurityType(w.security_type)}
                </span>
              </td>
              <td className="px-3 py-2 text-muted">{fmtNetworkType(w.network_type)}</td>
              {hasVlan && (
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {w.vlan_enabled && w.vlan ? w.vlan : '—'}
                </td>
              )}
              <td className="px-3 py-2">
                <div className="flex gap-1 flex-wrap">
                  {w.is_guest          && <span className="badge bg-orange-900/40 text-orange-300">guest</span>}
                  {w.client_isolation  && <span className="badge bg-blue-900/40 text-blue-300">isolated</span>}
                  {w.scheduled         && <span className="badge bg-surface-4 text-muted">scheduled</span>}
                </div>
              </td>
              <td className="px-3 py-2">
                {w.enabled ? <span className="badge-ok">enabled</span> : <span className="badge-error">disabled</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Firewall tab ──────────────────────────────────────────────────────────────

const RULESET_ORDER = [
  'WAN_IN', 'WAN_OUT', 'WAN_LOCAL',
  'LAN_IN', 'LAN_OUT', 'LAN_LOCAL',
  'GUEST_IN', 'GUEST_OUT', 'GUEST_LOCAL',
]

type FwSortKey = 'name' | 'action' | 'protocol' | 'rule_index'

function FirewallTab({ rules, groups, zones }: { rules: UniFiFirewallRule[]; groups: UniFiFirewallGroup[]; zones: UniFiZone[] }) {
  const [fwTab, setFwTab] = useState<'rules' | 'groups' | 'zones'>('rules')

  if (rules.length === 0 && groups.length === 0 && zones.length === 0)
    return <div className="text-sm text-muted text-center py-12">No firewall data found. Ensure your API key is configured.</div>

  // Group rules by ruleset
  const byRuleset = rules.reduce<Record<string, UniFiFirewallRule[]>>((acc, r) => {
    ;(acc[r.ruleset] ??= []).push(r)
    return acc
  }, {})
  const rulesets = [
    ...RULESET_ORDER.filter((rs) => byRuleset[rs]),
    ...Object.keys(byRuleset).filter((rs) => !RULESET_ORDER.includes(rs)).sort(),
  ]

  const groupById = Object.fromEntries(groups.map((g) => [g._id, g.name]))
  function resolveGroups(ids: string[]) {
    if (!ids?.length) return null
    return ids.map((id) => groupById[id] || id).join(', ')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-surface-4">
        {(['rules', 'groups', 'zones'] as const).map((t) => (
          <button key={t} onClick={() => setFwTab(t)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px capitalize transition-colors ${
              fwTab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
            }`}>
            {t} ({t === 'rules' ? rules.length : t === 'groups' ? groups.length : zones.length})
          </button>
        ))}
      </div>

      {fwTab === 'rules' && (
        <RulesTab rulesets={rulesets} byRuleset={byRuleset} resolveGroups={resolveGroups} />
      )}

      {fwTab === 'groups' && (
        <GroupsTab groups={groups} />
      )}

      {fwTab === 'zones' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-4 text-muted">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Key</th>
                <th className="px-3 py-2 text-right font-medium">Networks</th>
                <th className="px-3 py-2 text-left font-medium">Origin</th>
              </tr>
            </thead>
            <tbody>
              {[...zones].sort((a, b) => a.name.localeCompare(b.name)).map((z) => (
                <tr key={z._id} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-200">{z.name}</td>
                  <td className="px-3 py-2 font-mono text-muted text-[11px]">{z.zone_key || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    {z.network_ids.length === 0
                      ? <span className="text-muted/50">0</span>
                      : z.network_ids.length}
                  </td>
                  <td className="px-3 py-2">
                    {z.auto
                      ? <span className="badge bg-surface-4 text-muted">system</span>
                      : <span className="badge bg-blue-900/30 text-blue-300">custom</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RulesTab({
  rulesets, byRuleset, resolveGroups,
}: {
  rulesets: string[]
  byRuleset: Record<string, UniFiFirewallRule[]>
  resolveGroups: (ids: string[]) => string | null
}) {
  const [sortKey, setSortKey] = useState<FwSortKey>('rule_index')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: FwSortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sh = (k: FwSortKey, label: string, right = false) => (
    <SortTh label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} right={right} />
  )

  return (
    <div className="space-y-4">
      {rulesets.map((rs) => {
        const rows = sortedBy(byRuleset[rs] ?? [], (r) => {
          switch (sortKey) {
            case 'name':       return r.name.toLowerCase()
            case 'action':     return r.action
            case 'protocol':   return r.protocol
            case 'rule_index': return r.rule_index
            default: return 0
          }
        }, sortDir)
        return (
          <div key={rs} className="card overflow-x-auto">
            <div className="px-3 py-2 border-b border-surface-4 text-xs font-semibold text-gray-300 font-mono">{rs}</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  {sh('rule_index', '#', true)}
                  {sh('name', 'Name')}
                  {sh('action', 'Action')}
                  {sh('protocol', 'Proto')}
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Destination</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className={`border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors ${!r.enabled ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 text-right font-mono text-muted">{r.rule_index}</td>
                    <td className="px-3 py-2 font-medium text-gray-200">
                      {r.name}
                      {r.logging && <span className="ml-1.5 text-[10px] text-blue-400">log</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`badge ${
                        r.action === 'accept' ? 'bg-green-900/40 text-green-300'
                        : r.action === 'drop' || r.action === 'reject' ? 'bg-red-900/40 text-red-300'
                        : 'bg-yellow-900/40 text-yellow-300'
                      }`}>{r.action}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted">{r.protocol || 'all'}</td>
                    <td className="px-3 py-2 text-muted text-[11px]">
                      {resolveGroups(r.src_firewallgroup_ids) || r.src_address || 'any'}
                    </td>
                    <td className="px-3 py-2 text-muted text-[11px]">
                      <span>{resolveGroups(r.dst_firewallgroup_ids) || r.dst_address || 'any'}</span>
                      {r.dst_port && <span className="ml-1 font-mono">:{r.dst_port}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.enabled ? <span className="badge-ok">on</span> : <span className="badge-error">off</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

type GroupSortKey = 'name' | 'group_type'

function GroupsTab({ groups }: { groups: UniFiFirewallGroup[] }) {
  const [sortKey, setSortKey] = useState<GroupSortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: GroupSortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = sortedBy(groups, (g) => sortKey === 'name' ? g.name.toLowerCase() : g.group_type, sortDir)

  const sh = (k: GroupSortKey, label: string) => (
    <SortTh label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} />
  )

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            {sh('name', 'Name')}
            {sh('group_type', 'Type')}
            <th className="px-3 py-2 text-left font-medium">Members</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => (
            <tr key={g._id} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              <td className="px-3 py-2 font-medium text-gray-200">{g.name}</td>
              <td className="px-3 py-2">
                <span className="badge bg-surface-4 text-muted">{fmtGroupType(g.group_type)}</span>
              </td>
              <td className="px-3 py-2 text-muted font-mono text-[11px]">
                {g.group_members.length === 0
                  ? <span className="text-muted/50">empty</span>
                  : g.group_members.slice(0, 5).join(', ') + (g.group_members.length > 5 ? ` +${g.group_members.length - 5} more` : '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDeviceType(type: string): string {
  const map: Record<string, string> = { uap: 'AP', usw: 'Switch', ugw: 'Gateway', udm: 'UDM', uxg: 'XG', upoe: 'PoE' }
  return map[type?.toLowerCase()] ?? type ?? '—'
}

function fmtNetworkType(t: string): string {
  const map: Record<string, string> = {
    corporate: 'LAN', guest: 'Guest', 'vlan-only': 'VLAN', wan: 'WAN',
    'remote-user-vpn': 'VPN', DEFAULT: 'Default', GUEST: 'Guest', LAN: 'LAN',
  }
  return map[t] ?? t ?? '—'
}

function fmtSecurityType(sec: string): string {
  const map: Record<string, string> = {
    OPEN: 'Open', open: 'Open',
    WPA: 'WPA', wpapsk: 'WPA',
    WPA2: 'WPA2', wpa2psk: 'WPA2',
    WPA3: 'WPA3', wpa3: 'WPA3',
    WPA2_WPA3: 'WPA2/3',
  }
  return map[sec] ?? sec ?? '—'
}

function fmtSecurityColor(sec: string): string {
  const s = sec?.toUpperCase()
  if (s === 'OPEN' || s === 'open') return 'bg-red-900/40 text-red-300'
  if (s?.includes('WPA3')) return 'bg-green-900/40 text-green-300'
  if (s?.includes('WPA2') || s?.includes('WPA')) return 'bg-blue-900/40 text-blue-300'
  return 'bg-surface-4 text-muted'
}

function fmtGroupType(t: string): string {
  const map: Record<string, string> = {
    'address-group': 'Address', 'port-group': 'Port', 'ipv6-address-group': 'IPv6',
  }
  return map[t] ?? t ?? '—'
}

function fmtSpeed(mbps: number): string {
  if (mbps >= 10000) return '10G'
  if (mbps >= 2500)  return '2.5G'
  if (mbps >= 1000)  return '1G'
  if (mbps >= 100)   return '100M'
  if (mbps >= 10)    return '10M'
  return `${mbps}M`
}

function fmtBytes(bytes: number): string {
  if (!bytes && bytes !== 0) return '—'
  if (bytes === 0) return '0'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}${units[i]}`
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtRelTime(iso: string): string {
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
