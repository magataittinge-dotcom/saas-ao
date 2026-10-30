import { Suspense, useState, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'
import Header from './Header'
import LegalFooter from './LegalFooter'
import CommandPalette from './CommandPalette'
import { ToastContainer } from '@/components/common/Toast'
import EcranEnChargement from '@/components/common/EcranEnChargement'

// Écrans refaits sur les jetons clair / nuit : ils suivent le thème choisi. La coquille
// (barre latérale, en-tête, palette Ctrl K) le suit partout ; les autres écrans restent
// en nuit (data-theme="dark" sur <main>) jusqu'à leur passage — phase C, un écran à la fois.
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
            calque ? 'calque bg-papier' : 'bg-surface-0',
          )}
          data-theme={calque ? undefined : 'dark'}
        >
          <div className="flex-1">
            <Suspense fallback={<EcranEnChargement clair={calque} />}>
              <Outlet />
            </Suspense>
          </div>
          <LegalFooter calque={calque} />
        </main>
      </SidebarInset>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ToastContainer />
    </SidebarProvider>
  )
}
