import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from './Sidebar'
import Header from './Header'
import BarreOnglets from './BarreOnglets'
import BandeauNouveau from './BandeauNouveau'
import LegalFooter from './LegalFooter'
import CommandPalette from './CommandPalette'
import { ToastContainer } from '@/components/common/Toast'
import EcranEnChargement from '@/components/common/EcranEnChargement'

// Écrans refaits sur les jetons clair / nuit : ils suivent le thème choisi. La coquille (barre d'icônes,
// en-tête, onglets du bas, palette Ctrl K) le suit partout ; les autres écrans restent en nuit
// (data-theme="dark" sur <main>) jusqu'à leur passage — phase C, un écran à la fois :
// ajouter ici la route de l'écran dès qu'il ne contient plus de couleur écrite en dur.
export const PAGES_THEMEES = ['/dashboard', '/projects', '/design', '/projects/new', '/vault']
const estThemee = (pathname: string) => PAGES_THEMEES.some((p) => pathname === p) || pathname === '/design'

export default function Layout() {
  const { pathname } = useLocation()
  const themee = estThemee(pathname)
  const [palette, setPalette] = useState(false)

  return (
    <TooltipProvider delayDuration={150}>
      {/* barre d'icônes flottante (bureau) : 16 px de marge + 64 px + 16 px d'air = 96 px à gauche */}
      <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-surface-0 min-[769px]:pl-24">
        <Sidebar />
        <BandeauNouveau />
        <Header onSearch={() => setPalette(true)} />
        <main
          className={cn(
            'flex flex-1 flex-col overflow-y-auto px-3 py-5 sm:px-4',
            themee ? 'bg-surface-0' : 'bg-surface-0 text-fg-2',
          )}
          data-theme={themee ? undefined : 'dark'}
        >
          <div className="flex-1">
            <Suspense fallback={<EcranEnChargement clair={themee} />}>
              <Outlet />
            </Suspense>
          </div>
          <LegalFooter calque={themee} />
        </main>
        <BarreOnglets />
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ToastContainer />
    </TooltipProvider>
  )
}
