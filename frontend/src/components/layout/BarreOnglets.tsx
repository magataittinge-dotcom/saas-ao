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
import { ENTREES_TIROIR, ONGLETS_TEL, ONGLET_CERVEAU, estActif } from './navigation'
import { QuotaRond } from './QuotaGauge'
import { useTonUrgence, useUrgents } from './useUrgents'
import BasculeTheme from './BasculeTheme'

// Onglets du bas (téléphone, ≤ 768 px) : Accueil, Mes AO, Mon entreprise, Coffre-fort, Compte (la photo). Dernier élément de la colonne
// (jamais posés par-dessus le contenu : les barres d'action collées en bas restent visibles). Cibles de 56 px de haut. « Compte » ouvre un tiroir : Paramètres, le thème, le quota, la déconnexion.
// Place prévue pour « Cerveau » (bloc 8) : voir ONGLET_CERVEAU dans navigation.ts.

const ONGLET = 'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-xs font-medium leading-tight transition-colors duration-base'

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
        className="z-40 hidden shrink-0 border-t border-bord bg-surface-0 pb-[env(safe-area-inset-bottom)] max-[768px]:flex"
      >
        {onglets.map((e) => {
          const actif = estActif(pathname, e.to)
          const Icone = e.icon
          return (
            <NavLink key={e.to} to={e.to} aria-current={actif ? 'page' : undefined} className={cn(ONGLET, actif ? 'text-accent-text' : 'text-fg-2')}>
              {actif && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b-pilule bg-accent-ui" />}
              <span className="relative">
                <Icone size={22} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
                {e.to === '/projects' && urgents > 0 && <Pastille valeur={urgents} ton={ton} className="absolute -right-3 -top-1.5" role="img" aria-label={libelleUrgents(urgents)} title={libelleUrgents(urgents)} />}
              </span>
              {e.label}
            </NavLink>
          )
        })}
        <button type="button" onClick={() => setTiroir(true)} aria-haspopup="dialog" aria-expanded={tiroir}
          className={cn(ONGLET, dansTiroir || tiroir ? 'text-accent-text' : 'text-fg-2')}>
          {(dansTiroir || tiroir) && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-b-pilule bg-accent-ui" />}
          <UserRound size={22} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
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
                  className={cn('flex min-h-12 items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors hover:bg-surface-1', estActif(pathname, e.to) ? 'bg-accent-tint text-accent-text' : 'text-fg')}>
                  <e.icon size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-bord pt-3">
            <div className="flex items-center gap-1"><QuotaRond /><span className="text-sm text-fg-2">Abonnement</span></div>
            <div className="flex items-center gap-1">
              <BasculeTheme />
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
