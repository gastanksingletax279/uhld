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
