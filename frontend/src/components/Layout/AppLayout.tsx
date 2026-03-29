import { Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ChangePasswordModal } from '../ChangePasswordModal'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'

export function AppLayout() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {user?.needs_setup && <ChangePasswordModal forced />}
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
