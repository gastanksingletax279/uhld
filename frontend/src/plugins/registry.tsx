import type { PluginSummary } from '../api/client'
import { ProxmoxWidget } from './proxmox/Widget'
import { ProxmoxView } from './proxmox/View'

// Map plugin_id -> compact dashboard widget component
export const PLUGIN_WIDGETS: Record<string, React.ComponentType<{ summary: PluginSummary }>> = {
  proxmox: ProxmoxWidget,
}

// Map plugin_id -> full-page view component
export const PLUGIN_VIEWS: Record<string, React.ComponentType> = {
  proxmox: ProxmoxView,
}
