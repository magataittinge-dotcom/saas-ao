import { Suspense, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ThemeEcranProvider, type ThemeForce } from '@/lib/themeEcran'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from './Sidebar'
import Aurore from './Aurore'
import Header from './Header'
import BarreOnglets from './BarreOnglets'
import { useTitreSorti } from './useTitreSorti'
import LegalFooter from './LegalFooter'
import CommandPalette from './CommandPalette'
import { ToastContainer } from '@/components/common/Toast'
import EcranEnChargement from '@/components/common/EcranEnChargement'
import { PorteeSigles } from '@/components/common/Sigle'

// Écrans refaits sur les jetons clair / nuit : ils suivent le thème choisi. La coquille (barre d'icônes,
// en-tête, onglets du bas, palette Ctrl K) le suit partout ; les autres écrans restent en nuit
// (data-theme="dark" sur <main>) jusqu'à leur passage — phase C, un écran à la fois :
// ajouter ici la route de l'écran dès qu'il ne contient plus de couleur écrite en dur.
export const PAGES_THEMEES = ['/dashboard', '/projects', '/design', '/projects/new', '/vault', '/company', '/settings', '/settings/billing', '/outils']
const FICHE_ENTREPRISE = /^\/entreprise\/fiche\/[a-z]+$/ // fiches « Mon entreprise » à télécharger
/** Les écrans refaits (liste tenue pendant la phase C). Tous les écrans de la coquille le sont aujourd'hui. */
export const estRefait = (pathname: string) => PAGES_THEMEES.some((p) => pathname === p) || pathname === '/design' || FICHE_ENTREPRISE.test(pathname) ||
  /^\/projects\/(?!new(\/|$))[^/]+/.test(pathname) // la page d'un AO : /projects/:id/…
/**
 * L'écran suit-il le thème choisi ? Oui, toujours : plus aucun écran de la coquille n'est en nuit forcée. Une adresse absente
 * de la liste (une adresse inconnue, une redirection) s'affichait en nuit dans une coquille claire : un pavé bleu-noir coupé
 * net sous la barre du haut (jury, tour 1 : etat-404-connecte, 6 sur 20).
 */
export const estThemee = (_pathname: string) => true

export default function Layout() {
  const { pathname } = useLocation()
  const themee = estThemee(pathname)
  const [palette, setPalette] = useState(false)
  // le petit titre de la barre n'apparaît que lorsque le h1 de l'écran est sorti de l'écran (P10)
  const main = useRef<HTMLElement>(null)
  const titreSorti = useTitreSorti(main, pathname)
  // Écran en nuit forcée : les fenêtres, infobulles et notifications (portails hors de <main>) la suivent.
  const themeEcran: ThemeForce = themee ? undefined : 'dark'

  return (
    <TooltipProvider delayDuration={150}>
      {/* barre d'icônes flottante (bureau) : 16 px de marge + 76 px + 16 px d'air = 108 px à gauche.
          Le fond de page (givre / ciel polaire) porte l'aurore, posée une fois, derrière tout le contenu.
          Grille (P8) : UN conteneur (.conteneur : 1 200 px, gouttière 16 / 24 / 32), posé ici autour de l'écran et dans la
          barre du haut ; un écran ne pose ni largeur ni marge latérale (il rend <Page>, components/ui/page.tsx). */}
      <div className="isolate flex h-svh min-h-0 flex-col overflow-hidden bg-surface-page min-[769px]:pl-[108px]">
        <Aurore />
        <Sidebar />
        <Header onSearch={() => setPalette(true)} titreSorti={titreSorti} />
        <main
          ref={main}
          className={cn(
            'relative flex flex-1 flex-col overflow-y-auto',
            themee ? 'bg-transparent' : 'bg-surface-0 text-fg-2', // écran refait : l'aurore se devine derrière
          )}
          data-theme={themee ? undefined : 'dark'}
        >
          <ThemeEcranProvider value={themeEcran}>
            <div className="conteneur flex-1 pb-10 pt-2 max-[768px]:pt-5" data-conteneur-page="">
              {/* un écran = une adresse : les sigles y sont développés une fois (lib/lexique.ts) */}
              <PorteeSigles cle={pathname}>
                <Suspense fallback={<EcranEnChargement clair={themee} />}>
                  <Outlet />
                </Suspense>
              </PorteeSigles>
            </div>
            <LegalFooter />
          </ThemeEcranProvider>
        </main>
        <BarreOnglets />
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ToastContainer theme={themeEcran} />
    </TooltipProvider>
  )
}
