import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { usePluginStore } from '../../store/pluginStore'
import { ChangePasswordModal } from '../ChangePasswordModal'
import { LogOut, User, KeyRound, Sun, Moon, Github } from 'lucide-react'

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/settings': 'Settings',
  '/settings/plugins': 'Plugins',
  // Static fallbacks for plugin routes (belt-and-suspenders)
  '/plugins/proxmox': 'Proxmox VE',
  '/plugins/adguard': 'AdGuard Home',
  '/plugins/pihole': 'Pi-hole',
  '/plugins/tailscale': 'Tailscale',
  '/plugins/unifi': 'UniFi',
  '/plugins/docker': 'Docker',
  '/plugins/kubernetes': 'Kubernetes',
  '/plugins/nginx_proxy_manager': 'Nginx Proxy Manager',
  '/plugins/network_tools': 'Network Tools',
  '/plugins/llm_assistant': 'LLM Assistant',
  '/plugins/cloudflare': 'Cloudflare',
  '/plugins/plex': 'Plex Media Server',
  '/plugins/notifications': 'Notifications',
  '/plugins/assets': 'Asset Inventory',
  '/plugins/patch_panel': 'Patch Panel',
  '/plugins/remote_tcpdump': 'Remote Packet Capture',
  '/plugins/tasks_incidents': 'Tasks and Incidents',
  '/plugins/hdhomerun': 'HDHomeRun',
}

const GITHUB_REPO = 'https://github.com/mzac/uhld'

export function TopNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const { plugins } = usePluginStore()
  const [showChangePw, setShowChangePw] = useState(false)

  const pageTitle = (() => {
    if (ROUTE_LABELS[location.pathname]) return ROUTE_LABELS[location.pathname]
    // For /plugins/:pluginId or /plugins/:pluginId/:instanceId, look up display_name
    const pathParts = location.pathname.split('/')
    if (pathParts[1] === 'plugins' && pathParts[2]) {
      const pluginId = pathParts[2]
      const instanceId = pathParts[3]
      // Try to find a matching enabled plugin instance
      const match = plugins.find((p) =>
        p.plugin_id === pluginId &&
        p.enabled &&
        (instanceId ? p.instance_id === instanceId : true)
      )
      if (match) {
        return match.instance_label
          ? `${match.display_name} — ${match.instance_label}`
          : match.display_name
      }
      // Fall back to static route label for the plugin path
      if (ROUTE_LABELS[`/plugins/${pluginId}`]) return ROUTE_LABELS[`/plugins/${pluginId}`]
    }
    return location.pathname.split('/').pop() ?? 'UHLD'
  })()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-surface-1 border-b border-surface-4 flex-shrink-0">
      <h1 className="text-sm font-semibold text-gray-200 capitalize">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-100 transition-colors"
          title="View on GitHub"
        >
          <Github className="w-3.5 h-3.5" />
        </a>
        
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-100 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {user && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <User className="w-3.5 h-3.5" />
              {user.username}
            </div>
            <button
              onClick={() => setShowChangePw(true)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-100 transition-colors"
              title="Change password"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-100 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </header>
  )
}
