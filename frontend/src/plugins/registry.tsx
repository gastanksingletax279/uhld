import type { PluginSummary } from '../api/client'
import { ProxmoxWidget } from './proxmox/Widget'
import { ProxmoxView } from './proxmox/View'
import { AdGuardWidget } from './adguard/Widget'
import { AdGuardView } from './adguard/View'
import { PiHoleWidget } from './pihole/Widget'
import { PiHoleView } from './pihole/View'
import { TailscaleWidget } from './tailscale/Widget'
import { TailscaleView } from './tailscale/View'
import { UniFiWidget } from './unifi/Widget'
import { UniFiView } from './unifi/View'

export const PLUGIN_WIDGETS: Record<string, React.ComponentType<{ summary: PluginSummary }>> = {
  proxmox: ProxmoxWidget,
  adguard: AdGuardWidget,
  pihole: PiHoleWidget,
  tailscale: TailscaleWidget,
  unifi: UniFiWidget,
}

export const PLUGIN_VIEWS: Record<string, React.ComponentType<{ instanceId?: string }>> = {
  proxmox: ProxmoxView,
  adguard: AdGuardView,
  pihole: PiHoleView,
  tailscale: TailscaleView,
  unifi: UniFiView,
}
