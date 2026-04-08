import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'

export function AppLayout() {
  return (
    <div className="flex h-screen p-4 gap-4">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
