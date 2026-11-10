import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Pastille } from '@/components/ui/badge'
import { useLogout } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { libelleUrgents } from '@/lib/echeance'
import { prenomAffichable } from '@/lib/prenom'
import { raisonSociale } from '@/lib/raisonSociale'
import { ENTREES_TIROIR, ONGLETS_TEL, ONGLET_CERVEAU, estActif, libelleBarre } from './navigation'
import { QuotaRond } from './QuotaGauge'
import { useTonUrgence, useUrgents } from './useUrgents'
import BasculeTheme, { ReglageAnimerFond } from './BasculeTheme'
import NotificationBell from './NotificationBell'

// Onglets du bas (téléphone, ≤ 768 px) : Accueil, Mes AO, Mon entreprise, Coffre-fort, Compte (la photo). Dernier élément de la colonne
// (jamais posés par-dessus le contenu : les barres d'action collées en bas restent visibles). Cibles de 56 px de haut. « Compte » ouvre un tiroir : Paramètres, le thème, le quota, la déconnexion.
// Place prévue pour « Cerveau » (bloc 8) : voir ONGLET_CERVEAU dans navigation.ts.

// Un libellé d'une seule ligne, 11 px / 500, toujours visible (P26). L'onglet actif est neutre : texte plein ; l'icône et le trait
// du haut portent l'accent (P3).
const ONGLET = 'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap px-0.5 text-center text-micro font-medium transition-colors duration-fast ease-survol active:scale-[.98]'

export default function BarreOnglets() {
  const { pathname } = useLocation()
  const urgents = useUrgents()
  const ton = useTonUrgence()
  const [tiroir, setTiroir] = useState(false)
  const { user, organization } = useAuthStore()
  const prenom = prenomAffichable(user?.name, user?.email)
  const handleLogout = useLogout()
  const dansTiroir = ENTREES_TIROIR.some((e) => estActif(pathname, e.to)) || estActif(pathname, '/settings')
  const onglets = [...ONGLETS_TEL.map((e) => ({ ...e, cerveau: false })), ...(ONGLET_CERVEAU?.disponible ? [{ ...ONGLET_CERVEAU, cerveau: true }] : [])]

  return (
    <>
      <nav
        aria-label="Navigation principale"
        data-coquille="barre-bas"
        className="z-40 hidden shrink-0 border-t border-bord bg-surface-0 pb-[env(safe-area-inset-bottom)] max-[768px]:flex"
      >
        {onglets.map((e) => {
          const actif = estActif(pathname, e.to)
          const Icone = e.icon
          return (
            <NavLink key={e.to} to={e.to} aria-current={actif ? 'page' : undefined} aria-label={e.court ? e.label : undefined} className={cn(ONGLET, actif ? 'text-fg' : 'text-fg-2')}>
              {actif && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b-pilule bg-accent-ui" />}
              <span className={cn('relative', actif && 'text-accent-ui')}>
                <Icone size={22} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
                {e.to === '/projects' && urgents > 0 && <Pastille valeur={urgents} ton={ton} className="absolute -right-3 -top-1.5" role="img" aria-label={libelleUrgents(urgents)} />}
              </span>
              {libelleBarre(e)}
            </NavLink>
          )
        })}
        <button type="button" onClick={() => setTiroir(true)} aria-haspopup="dialog" aria-expanded={tiroir}
          className={cn(ONGLET, dansTiroir || tiroir ? 'text-fg' : 'text-fg-2')}>
          {(dansTiroir || tiroir) && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-b-pilule bg-accent-ui" />}
          <UserRound size={22} strokeWidth={1.5} absoluteStrokeWidth aria-hidden className={dansTiroir || tiroir ? 'text-accent-ui' : undefined} />
          Compte
        </button>
      </nav>

      <Sheet open={tiroir} onOpenChange={setTiroir}>
        <SheetContent side="bottom" className="rounded-t-section pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left">
            <SheetTitle className="font-sans">Mon compte</SheetTitle>
            <SheetDescription>{[prenom, raisonSociale(organization), user?.email].filter(Boolean).join(' · ')}</SheetDescription>
          </SheetHeader>
          <ul className="mt-3 grid gap-1">
            {ENTREES_TIROIR.map((e) => (
              <li key={e.to}>
                <Link to={e.to} onClick={() => setTiroir(false)}
                  className={cn('flex min-h-12 items-center gap-3 rounded-md px-3 text-base font-medium transition-colors hover:bg-surface-1', estActif(pathname, e.to) ? 'bg-surface-1 text-fg' : 'text-fg')}>
                  <e.icon size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 border-t border-bord pt-3">
            <p className="px-1 text-xs font-medium text-fg-3">Thème</p>
            <BasculeTheme />
            <ReglageAnimerFond className="px-1" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-bord pt-3">
            <div className="flex items-center gap-1"><QuotaRond /><span className="text-sm text-fg-2">Abonnement</span></div>
            <div className="flex items-center gap-1">
              <NotificationBell versLeHaut />
              <button type="button" onClick={handleLogout} aria-label="Déconnexion"
                className="grid size-11 place-items-center rounded-pilule text-fg-2 transition-colors hover:bg-surface-1 hover:text-fg">
                <LogOut size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
