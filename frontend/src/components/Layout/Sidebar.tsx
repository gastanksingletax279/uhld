import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { usePluginStore } from '../../store/pluginStore'
import { Server, LayoutDashboard, Settings, Puzzle, Activity } from 'lucide-react'
import { PluginIcon } from '../PluginIcon'

const CATEGORY_ORDER = [
  'virtualization', 'containers', 'monitoring', 'network', 'storage', 'media', 'arr', 'security', 'automation', 'other',
]

export function Sidebar() {
  const { plugins, fetchPlugins } = usePluginStore()
  const location = useLocation()

  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  const enabled = plugins.filter((p) => p.enabled)
  const byCategory: Record<string, typeof enabled> = {}
  for (const p of enabled) {
    const cat = p.category || 'other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(p)
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-surface-4 flex flex-col">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 px-4 py-3.5 border-b border-surface-4 hover:bg-surface-2 transition-colors">
        <div className="w-7 h-7 bg-accent-dim rounded flex items-center justify-center">
          <Server className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm text-white">UHLD</span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 text-sm">
        {/* Core links */}
        <SidebarLink to="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" exact />

        {/* Plugin sections */}
        {CATEGORY_ORDER.filter((c) => byCategory[c]).map((cat) => (
          <div key={cat} className="mt-3">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted/60">
              {cat}
            </div>
            {byCategory[cat].map((p) => (
              <SidebarLink
                key={`${p.plugin_id}:${p.instance_id}`}
                to={p.instance_id === 'default' ? `/plugins/${p.plugin_id}` : `/plugins/${p.plugin_id}/${p.instance_id}`}
                icon={<PluginIcon name={p.icon} className="w-4 h-4" />}
                label={p.instance_id === 'default'
                  ? p.display_name
                  : `${p.display_name} — ${p.instance_label || p.instance_id}`}
                healthStatus={p.health_status}
              />
            ))}
          </div>
        ))}

        {/* Bottom links */}
        <div className="mt-3 border-t border-surface-4 pt-2">
          <SidebarLink to="/settings/plugins" icon={<Puzzle className="w-4 h-4" />} label="Plugins" />
          <SidebarLink to="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
        </div>
      </nav>
    </aside>
  )
}

function SidebarLink({
  to,
  icon,
  label,
  exact = false,
  healthStatus,
}: {
  to: string
  icon: React.ReactNode
  label: string
  exact?: boolean
  healthStatus?: string | null
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-1.5 mx-1 rounded transition-colors ${
          isActive
            ? 'bg-accent-dim/20 text-accent'
            : 'text-gray-400 hover:text-gray-100 hover:bg-surface-3'
        }`
      }
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {healthStatus === 'error' && (
        <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" title="Error" />
      )}
      {healthStatus === 'ok' && (
        <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
      )}
    </NavLink>
  )
}
