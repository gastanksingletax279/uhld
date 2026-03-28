import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LogOut, User } from 'lucide-react'

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/settings': 'Settings',
  '/settings/plugins': 'Plugins',
}

export function TopNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const pageTitle = ROUTE_LABELS[location.pathname] ?? location.pathname.split('/').pop() ?? 'UHLD'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-surface-1 border-b border-surface-4 flex-shrink-0">
      <h1 className="text-sm font-semibold text-gray-200 capitalize">{pageTitle}</h1>

      {user && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <User className="w-3.5 h-3.5" />
            {user.username}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-100 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </header>
  )
}
