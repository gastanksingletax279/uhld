import { Link, useLocation } from 'react-router-dom'
import { PluginManager } from '../components/Settings/PluginManager'
import { BackupSettings } from '../components/Settings/BackupSettings'
import { Puzzle, Sliders, Database } from 'lucide-react'

interface SettingsPageProps {
  tab?: string
}

export function SettingsPage({ tab }: SettingsPageProps) {
  const location = useLocation()
  const activeTab = tab ?? (
    location.pathname.includes('plugins') ? 'plugins' :
    location.pathname.includes('backup') ? 'backup' :
    'general'
  )

  return (
    <div className="max-w-6xl space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-4 pb-0">
        <TabLink to="/settings" icon={<Sliders className="w-4 h-4" />} label="General" active={activeTab === 'general'} />
        <TabLink to="/settings/plugins" icon={<Puzzle className="w-4 h-4" />} label="Plugins" active={activeTab === 'plugins'} />
        <TabLink to="/settings/backup" icon={<Database className="w-4 h-4" />} label="Backup" active={activeTab === 'backup'} />
      </div>

      {activeTab === 'plugins' && <PluginManager />}
      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'backup' && <BackupSettings />}
    </div>
  )
}

function TabLink({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-muted hover:text-gray-300'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}

function GeneralSettings() {
  return (
    <div className="card p-6 max-w-lg">
      <h3 className="text-sm font-semibold text-gray-200 mb-4">General Settings</h3>
      <p className="text-xs text-muted">No configurable settings yet.</p>
    </div>
  )
}
