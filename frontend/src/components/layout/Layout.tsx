import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { ToastContainer } from '@/components/common/Toast'

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#FFFFFF' }}>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0 relative z-10">
        <Header onMenuToggle={toggleMobile} />
        <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-5" style={{ background: '#F8FAFC' }}>
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
