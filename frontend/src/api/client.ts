const BASE = ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? `Request failed: ${res.status}`)
    }
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }

  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON but got ${contentType || 'unknown content type'}`)
  }
  return res.json()
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ message: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<User>('/api/auth/me'),

  // Plugins
  listPlugins: () => request<PluginListItem[]>('/api/plugins/'),

  getPlugin: (id: string) => request<PluginDetail>(`/api/plugins/${id}`),

  enablePlugin: (id: string, config: Record<string, unknown>) =>
    request<{ message: string }>(`/api/plugins/${id}/enable`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),

  disablePlugin: (id: string) =>
    request<{ message: string }>(`/api/plugins/${id}/disable`, { method: 'POST' }),

  updatePluginConfig: (id: string, config: Record<string, unknown>) =>
    request<{ message: string }>(`/api/plugins/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  checkPluginHealth: (id: string) =>
    request<{ status: string; message: string }>(`/api/plugins/${id}/health`),

  clearPlugin: (id: string) =>
    request<{ message: string }>(`/api/plugins/${id}/clear`, { method: 'POST' }),

  // Dashboard
  dashboardSummary: () => request<{ plugins: PluginSummary[] }>('/api/dashboard/summary'),

  // Proxmox
  proxmox: {
    nodes: () => request<{ nodes: ProxmoxNode[] }>('/api/plugins/proxmox/nodes'),
    allVms: () => request<{ vms: ProxmoxVM[] }>('/api/plugins/proxmox/vms'),
    nodeVms: (node: string) => request<{ vms: ProxmoxVM[] }>(`/api/plugins/proxmox/nodes/${node}/vms`),
    storage: () => request<{ storage: ProxmoxStorage[] }>('/api/plugins/proxmox/storage'),
    startVm: (node: string, vmid: number, type = 'qemu') =>
      request<{ task: string }>(`/api/plugins/proxmox/nodes/${node}/vms/${vmid}/start?vm_type=${type}`, { method: 'POST' }),
    stopVm: (node: string, vmid: number, type = 'qemu') =>
      request<{ task: string }>(`/api/plugins/proxmox/nodes/${node}/vms/${vmid}/stop?vm_type=${type}`, { method: 'POST' }),
    shutdownVm: (node: string, vmid: number, type = 'qemu') =>
      request<{ task: string }>(`/api/plugins/proxmox/nodes/${node}/vms/${vmid}/shutdown?vm_type=${type}`, { method: 'POST' }),
    rebootVm: (node: string, vmid: number, type = 'qemu') =>
      request<{ task: string }>(`/api/plugins/proxmox/nodes/${node}/vms/${vmid}/reboot?vm_type=${type}`, { method: 'POST' }),
  },

  // AdGuard Home
  adguard: {
    stats: () => request<AdGuardStats>('/api/plugins/adguard/stats'),
    status: () => request<AdGuardStatus>('/api/plugins/adguard/status'),
    querylog: (limit = 100) => request<AdGuardQueryLog>(`/api/plugins/adguard/querylog?limit=${limit}`),
    setProtection: (enabled: boolean) =>
      request<{ message: string }>('/api/plugins/adguard/protection', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
  },

  // Pi-hole
  pihole: {
    stats: () => request<PiHoleStats>('/api/plugins/pihole/stats'),
    querylog: (limit = 100) => request<PiHoleQueryLog>(`/api/plugins/pihole/querylog?limit=${limit}`),
    setBlocking: (enabled: boolean) =>
      request<{ message: string }>('/api/plugins/pihole/blocking', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
  },

  // Tailscale
  tailscale: {
    devices: () => request<{ devices: TailscaleDevice[] }>('/api/plugins/tailscale/devices'),
  },

  // UniFi
  unifi: {
    clients: () => request<{ clients: UniFiClient[] }>('/api/plugins/unifi/clients'),
    kickClient: (clientId: string) =>
      request<{ message: string }>(`/api/plugins/unifi/clients/${encodeURIComponent(clientId)}/kick`, { method: 'POST' }),
    devices: () => request<{ devices: UniFiDevice[] }>('/api/plugins/unifi/devices'),
    ports: () => request<{ ports: UniFiPort[] }>('/api/plugins/unifi/ports'),
    networks: () => request<{ networks: UniFiNetwork[] }>('/api/plugins/unifi/networks'),
    wlans: () => request<{ wlans: UniFiWlan[] }>('/api/plugins/unifi/wlans'),
    firewall: () => request<{ rules: UniFiFirewallRule[]; groups: UniFiFirewallGroup[]; zones: UniFiZone[] }>('/api/plugins/unifi/firewall'),
  },

  // Settings
  getSettings: () => request<SettingItem[]>('/api/settings/'),

  updateSettings: (items: SettingItem[]) =>
    request<{ message: string }>('/api/settings/', {
      method: 'PUT',
      body: JSON.stringify(items),
    }),
}

// --- Types ---

export interface User {
  id: number
  username: string
  is_admin: boolean
}

export interface PluginListItem {
  plugin_id: string
  display_name: string
  description: string
  version: string
  icon: string
  category: string
  enabled: boolean
  health_status: string | null
  health_message: string | null
  poll_interval: number
}

export interface PluginDetail extends PluginListItem {
  config_schema: Record<string, unknown>
  config: Record<string, unknown> | null
}

export interface PluginSummary {
  plugin_id: string
  status: string
  [key: string]: unknown
}

export interface SettingItem {
  key: string
  value: string | null
}

// --- Proxmox types ---

export interface ProxmoxNode {
  node: string
  status: string
  cpu: number       // fraction 0–1
  maxcpu: number
  mem: number       // bytes
  maxmem: number    // bytes
  disk: number      // bytes
  maxdisk: number   // bytes
  uptime: number    // seconds
}

export interface ProxmoxVM {
  vmid: number
  name: string
  status: string    // "running" | "stopped" | "paused"
  type: string      // "qemu" | "lxc"
  node: string
  cpu: number       // fraction 0–1
  cpus: number
  mem: number       // bytes
  maxmem: number    // bytes
  uptime: number    // seconds
}

export interface ProxmoxStorage {
  storage: string
  node: string
  type: string
  content: string
  used: number
  avail: number
  total: number
  active: number
  enabled: number
}

// --- AdGuard Home types ---
export interface AdGuardStats {
  dns_queries: number[]
  blocked_filtering: number[]
  avg_processing_time: number
  [key: string]: unknown
}
export interface AdGuardStatus {
  protection_enabled: boolean
  running: boolean
  version: string
  [key: string]: unknown
}
export interface AdGuardQueryLogEntry {
  time: string
  question: { name: string; type: string }
  client: string
  status: string
  reason: string
  answer?: string
}
export interface AdGuardQueryLog {
  data: AdGuardQueryLogEntry[]
}

// --- Pi-hole types ---
export interface PiHoleStats {
  blocking: boolean
  dns_queries_today: number
  ads_blocked_today: number
  ads_percentage_today: number
  domains_on_blocklist: number
  [key: string]: unknown
}
export interface PiHoleQueryLogEntry {
  time: string
  client: string
  domain: string
  query_type: string
  status: string
}
export interface PiHoleQueryLog {
  data: PiHoleQueryLogEntry[]
}

// --- Tailscale types ---
export interface TailscaleDevice {
  id: string
  hostname: string
  name: string
  addresses: string[]
  os: string
  clientVersion: string
  lastSeen: string
  online: boolean              // normalized from connectedToControl by the backend
  connectedToControl: boolean  // raw Tailscale field (requires ?fields=all)
  user: string
  authorized: boolean
  updateAvailable: boolean     // requires ?fields=all
  tags?: string[]
}

// --- UniFi types ---
export interface UniFiClient {
  id: string            // UUID (integration API) or MAC (session API)
  mac: string
  hostname: string
  ip: string
  type: string          // "WIRED" | "WIRELESS" | "VPN"
  is_wired: boolean
  connected_at: string
  access_type: string
  // Session API extras (may be absent with integration API)
  essid?: string
  rssi?: number
  rx_bytes: number
  tx_bytes: number
  uptime?: number
}

export interface UniFiDevice {
  id: string
  mac: string
  name: string
  model: string
  ip: string
  state: string         // "ONLINE" | "OFFLINE"
  firmware_version: string
  firmware_updatable: boolean
  features: string[]
  has_ports: boolean
  // Session API extras
  type?: string
  uptime?: number
}

export interface UniFiPort {
  device_id: string
  device_name: string
  idx: number
  name: string
  state: string         // "UP" | "DOWN"
  connector: string
  speed_mbps: number
  max_speed_mbps: number
  poe_enabled: boolean
  poe_standard: string
  poe_state: string
  // Session API extras
  vlan: number
  rx_bytes: number
  tx_bytes: number
  full_duplex: boolean
}

export interface UniFiNetwork {
  id: string
  name: string
  enabled: boolean
  vlan_id: number
  management: string
  is_default: boolean
  // Session API extras
  purpose?: string
  ip_subnet?: string
  dhcpd_enabled?: boolean
  dhcpd_start?: string
  dhcpd_stop?: string
}

export interface UniFiWlan {
  id: string
  name: string
  enabled: boolean
  security_type: string  // "OPEN" | "WPA" | "WPA2" | "WPA3"
  network_type: string
  hide_name: boolean
  client_isolation: boolean
  is_guest: boolean
  scheduled: boolean
  // Session API extras
  wpa_mode?: string
  vlan?: number
  vlan_enabled?: boolean
}

export interface UniFiFirewallRule {
  _id: string
  name: string
  ruleset: string
  rule_index: number
  action: string
  protocol: string
  enabled: boolean
  src_address: string
  dst_address: string
  src_firewallgroup_ids: string[]
  dst_firewallgroup_ids: string[]
  dst_port: string
  logging: boolean
}

export interface UniFiFirewallGroup {
  _id: string
  name: string
  group_type: string
  group_members: string[]
}

export interface UniFiZone {
  _id: string
  name: string
  zone_key: string
  network_ids: string[]
  auto: boolean
}
