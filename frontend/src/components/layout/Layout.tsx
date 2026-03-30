import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { ToastContainer } from '@/components/common/Toast'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080B12' }}>
      {/* Ambient background gradients (Glassmorphism Admin) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute w-full h-full" style={{
          backgroundImage: [
            'radial-gradient(ellipse 80% 80% at 20% 80%, rgba(59,130,246,0.07) 0%, transparent 50%)',
            'radial-gradient(ellipse 60% 60% at 80% 20%, rgba(6,182,212,0.05) 0%, transparent 50%)',
            'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(59,130,246,0.03) 0%, transparent 60%)',
          ].join(', '),
          backgroundAttachment: 'fixed',
        }} />
      </div>

      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0 relative z-10">
        <Header />
        <main className="flex-1 overflow-y-auto px-4 py-5">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
