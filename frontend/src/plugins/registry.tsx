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
import { DockerWidget } from './docker/Widget'
import { DockerView } from './docker/View'
import { KubernetesWidget } from './kubernetes/Widget'
import { KubernetesView } from './kubernetes/View'
import { AssetsWidget } from './assets/Widget'
import { AssetsView } from './assets/View'
import { NotificationsWidget } from './notifications/Widget'
import { NotificationsView } from './notifications/View'
import { NetworkToolsWidget } from './network_tools/Widget'
import { NetworkToolsView } from './network_tools/View'
import { RemoteTcpdumpWidget } from './remote_tcpdump/Widget'
import { RemoteTcpdumpView } from './remote_tcpdump/View'
import { LLMAssistantWidget } from './llm_assistant/Widget'
import { LLMAssistantView } from './llm_assistant/View'
import { NginxProxyManagerWidget } from './nginx_proxy_manager/Widget'
import { NginxProxyManagerView } from './nginx_proxy_manager/View'
import { TasksIncidentsWidget } from './tasks_incidents/Widget'
import { TasksIncidentsView } from './tasks_incidents/View'
import { PatchPanelWidget } from './patch_panel/Widget'
import { PatchPanelView } from './patch_panel/View'

export const PLUGIN_WIDGETS: Record<string, React.ComponentType<{ summary: PluginSummary }>> = {
  proxmox: ProxmoxWidget,
  adguard: AdGuardWidget,
  pihole: PiHoleWidget,
  tailscale: TailscaleWidget,
  unifi: UniFiWidget,
  docker: DockerWidget,
  kubernetes: KubernetesWidget,
  assets: AssetsWidget,
  notifications: NotificationsWidget,
  network_tools: NetworkToolsWidget,
  remote_tcpdump: RemoteTcpdumpWidget,
  llm_assistant: LLMAssistantWidget,
  nginx_proxy_manager: NginxProxyManagerWidget,
  tasks_incidents: TasksIncidentsWidget,
  patch_panel: PatchPanelWidget,
}

export const PLUGIN_VIEWS: Record<string, React.ComponentType<{ instanceId?: string }>> = {
  proxmox: ProxmoxView,
  adguard: AdGuardView,
  pihole: PiHoleView,
  tailscale: TailscaleView,
  unifi: UniFiView,
  docker: DockerView,
  kubernetes: KubernetesView,
  assets: AssetsView,
  notifications: NotificationsView,
  network_tools: NetworkToolsView,
  remote_tcpdump: RemoteTcpdumpView,
  llm_assistant: LLMAssistantView,
  nginx_proxy_manager: NginxProxyManagerView,
  tasks_incidents: TasksIncidentsView,
  patch_panel: PatchPanelView,
}
