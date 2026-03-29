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

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  // Plugins
  listPlugins: () => request<PluginListItem[]>('/api/plugins/'),

  getPlugin: (id: string, instanceId = 'default') =>
    request<PluginDetail>(`/api/plugins/${id}?instance_id=${instanceId}`),

  enablePlugin: (id: string, config: Record<string, unknown>, instanceId = 'default', instanceLabel?: string) =>
    request<{ message: string }>(`/api/plugins/${id}/enable`, {
      method: 'POST',
      body: JSON.stringify({ config, instance_id: instanceId, instance_label: instanceLabel }),
    }),

  disablePlugin: (id: string, instanceId = 'default') =>
    request<{ message: string }>(`/api/plugins/${id}/disable?instance_id=${instanceId}`, { method: 'POST' }),

  updatePluginConfig: (id: string, config: Record<string, unknown>, instanceId = 'default') =>
    request<{ message: string }>(`/api/plugins/${id}/config?instance_id=${instanceId}`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  checkPluginHealth: (id: string, instanceId = 'default') =>
    request<{ status: string; message: string }>(`/api/plugins/${id}/health?instance_id=${instanceId}`),

  clearPlugin: (id: string, instanceId = 'default') =>
    request<{ message: string }>(`/api/plugins/${id}/clear?instance_id=${instanceId}`, { method: 'POST' }),

  // Multi-instance management
  listInstances: (id: string) =>
    request<PluginListItem[]>(`/api/plugins/${id}/instances`),

  createInstance: (id: string, instanceId: string, instanceLabel: string | null, config: Record<string, unknown>) =>
    request<{ message: string }>(`/api/plugins/${id}/instances`, {
      method: 'POST',
      body: JSON.stringify({ instance_id: instanceId, instance_label: instanceLabel, config }),
    }),

  deleteInstance: (id: string, instanceId: string) =>
    request<{ message: string }>(`/api/plugins/${id}/instances/${instanceId}`, { method: 'DELETE' }),

  updateInstanceConfig: (id: string, instanceId: string, config: Record<string, unknown>) =>
    request<{ message: string }>(`/api/plugins/${id}/instances/${instanceId}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  // Dashboard
  dashboardSummary: () => request<{ plugins: PluginSummary[] }>('/api/dashboard/summary'),

  // Proxmox — instance-aware factory
  proxmox: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/proxmox' : `/api/plugins/proxmox/${instanceId}`
    return {
      nodes: () => request<{ nodes: ProxmoxNode[] }>(`${p}/nodes`),
      allVms: () => request<{ vms: ProxmoxVM[] }>(`${p}/vms`),
      nodeVms: (node: string) => request<{ vms: ProxmoxVM[] }>(`${p}/nodes/${node}/vms`),
      storage: () => request<{ storage: ProxmoxStorage[] }>(`${p}/storage`),
      startVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/start?vm_type=${type}`, { method: 'POST' }),
      stopVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/stop?vm_type=${type}`, { method: 'POST' }),
      shutdownVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/shutdown?vm_type=${type}`, { method: 'POST' }),
      rebootVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/reboot?vm_type=${type}`, { method: 'POST' }),
    }
  },

  // AdGuard Home — instance-aware factory
  adguard: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/adguard' : `/api/plugins/adguard/${instanceId}`
    return {
      stats: () => request<AdGuardStats>(`${p}/stats`),
      status: () => request<AdGuardStatus>(`${p}/status`),
      querylog: (limit = 100) => request<AdGuardQueryLog>(`${p}/querylog?limit=${limit}`),
      setProtection: (enabled: boolean) =>
        request<{ message: string }>(`${p}/protection`, {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        }),
    }
  },

  // Pi-hole — instance-aware factory
  pihole: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/pihole' : `/api/plugins/pihole/${instanceId}`
    return {
      stats: () => request<PiHoleStats>(`${p}/stats`),
      querylog: (limit = 100) => request<PiHoleQueryLog>(`${p}/querylog?limit=${limit}`),
      setBlocking: (enabled: boolean) =>
        request<{ message: string }>(`${p}/blocking`, {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        }),
    }
  },

  // Tailscale — instance-aware factory
  tailscale: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/tailscale' : `/api/plugins/tailscale/${instanceId}`
    return {
      devices: () => request<{ devices: TailscaleDevice[] }>(`${p}/devices`),
      users:   () => request<{ users: TailscaleUser[] }>(`${p}/users`),
      dns:     () => request<TailscaleDNS>(`${p}/dns`),
      acl:     () => fetch(`${p}/acl`, { credentials: 'include' }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.detail ?? 'Failed to load ACL')))
        return r.text()
      }),
      saveAcl: (acl: string) => request<{ message: string }>(`${p}/acl`, {
        method: 'POST',
        body: JSON.stringify({ acl }),
      }),
      localStatus: () => request<TailscaleLocalStatus>(`${p}/status`),
    }
  },

  // UniFi — instance-aware factory
  unifi: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/unifi' : `/api/plugins/unifi/${instanceId}`
    return {
      clients: () => request<{ clients: UniFiClient[] }>(`${p}/clients`),
      kickClient: (clientId: string) =>
        request<{ message: string }>(`${p}/clients/${encodeURIComponent(clientId)}/kick`, { method: 'POST' }),
      devices: () => request<{ devices: UniFiDevice[] }>(`${p}/devices`),
      ports: () => request<{ ports: UniFiPort[] }>(`${p}/ports`),
      networks: () => request<{ networks: UniFiNetwork[] }>(`${p}/networks`),
      wlans: () => request<{ wlans: UniFiWlan[] }>(`${p}/wlans`),
      firewall: () => request<{ rules: UniFiFirewallRule[]; groups: UniFiFirewallGroup[]; zones: UniFiZone[] }>(`${p}/firewall`),
    }
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
  needs_setup: boolean
}

export interface PluginListItem {
  plugin_id: string
  instance_id: string
  instance_label: string | null
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
  instance_id: string
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
  keyExpiryDisabled: boolean
  expires?: string
  advertisedRoutes?: string[]
  enabledRoutes?: string[]
}

export interface TailscaleUser {
  id: string
  loginName: string
  displayName: string
  profilePicUrl?: string
  created?: string
  role: string
  status: string
  type?: string
}

export interface TailscaleDNS {
  nameservers: string[]
  searchPaths: string[]
  magicDNS: boolean
  domains: string[]
}

export interface TailscaleLocalStatus {
  available: boolean
  backend_state?: string
  ipv4?: string | null
  ipv6?: string | null
  hostname?: string
  dns_name?: string
  online: boolean
  tailscale_ips: string[]
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
  description: string
  state: string         // "UP" | "DOWN"
  connector: string
  speed_mbps: number
  max_speed_mbps: number
  poe_enabled: boolean
  poe_standard: string
  poe_state: string
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
