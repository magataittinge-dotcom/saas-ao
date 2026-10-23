import { useState, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'
import Header from './Header'
import LegalFooter from './LegalFooter'
import CommandPalette from './CommandPalette'
import { ToastContainer } from '@/components/common/Toast'

// Écrans déjà passés au thème clair « Calque ». La coquille (barre latérale,
// en-tête, palette ⌘K) l'est partout ; les autres écrans gardent Lumen
// (sombre) jusqu'à leur passage.
const PAGES_CALQUE = ['/dashboard']

const CLE_OUVERTURE = 'synorix.barre-laterale'

export default function Layout() {
  const { pathname } = useLocation()
  const calque = PAGES_CALQUE.includes(pathname)

  // 1.11 — la barre latérale s'ouvre par un bouton ; préférence gardée dans
  // ce navigateur (repliée par défaut, comme avant).
  const [ouverte, setOuverte] = useState<boolean>(() => {
    try { return localStorage.getItem(CLE_OUVERTURE) === 'ouverte' } catch { return false }
  })
  const changerOuverture = useCallback((o: boolean) => {
    setOuverte(o)
    try { localStorage.setItem(CLE_OUVERTURE, o ? 'ouverte' : 'repliee') } catch { /* stockage indisponible */ }
  }, [])

  const [palette, setPalette] = useState(false)

  return (
    <SidebarProvider open={ouverte} onOpenChange={changerOuverture} className="h-svh min-h-0 overflow-hidden">
      <Sidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <Header onSearch={() => setPalette(true)} />
        <main
          className={cn(
            'flex flex-1 flex-col overflow-y-auto px-3 py-5 sm:px-4',
            calque ? 'calque bg-papier' : 'bg-[var(--edge-void)]',
          )}
        >
          <div className="flex-1">
            <Outlet />
          </div>
          <LegalFooter calque={calque} />
        </main>
      </SidebarInset>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ToastContainer />
    </SidebarProvider>
  )
}
