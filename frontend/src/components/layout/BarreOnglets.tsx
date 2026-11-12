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

// Onglets du bas (téléphone, ≤ 768 px) : les CINQ entrées de la barre du bureau, sous les mêmes noms (Accueil, Mes AO, Entreprise,
// Coffre-fort, Paramètres). Dernier élément de la colonne (jamais posés par-dessus le contenu : les barres d'action collées en bas
// restent visibles). Cibles de 56 px de haut. Jury, tour 1 : le cinquième onglet s'appelait « Compte » (« Paramètres » au bureau :
// deux noms pour la même entrée) et cachait la cloche et la déconnexion. Le compte (la photo) est dans la barre du haut, comme
// au bureau il est au pied de la barre : `CompteTel`, plus bas.
// Place prévue pour « Cerveau » (bloc 8) : voir ONGLET_CERVEAU dans navigation.ts.

// Un libellé d'une seule ligne, 11 px / 500, toujours visible (P26). L'onglet actif est neutre : texte plein ; l'icône et le trait
// du haut portent l'accent (P3). Le libellé a sa propre balise : fusionnée avec la couleur de l'onglet, sa taille de 11 px
// était écartée (deux classes `text-…`) et il s'écrivait en 14 px : « Entreprise » et « Coffre-fort » se touchaient à 390.
const ONGLET = 'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-center transition-colors duration-fast ease-survol active:scale-[.98]'
const LIBELLE = 'max-w-full truncate whitespace-nowrap text-micro font-medium'

export default function BarreOnglets() {
  const { pathname } = useLocation()
  const urgents = useUrgents()
  const ton = useTonUrgence()
  const onglets = [...ONGLETS_TEL.map((e) => ({ ...e, cerveau: false })), ...(ONGLET_CERVEAU?.disponible ? [{ ...ONGLET_CERVEAU, cerveau: true }] : [])]

  return (
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
            <span data-libelle-onglet="" className={LIBELLE}>{libelleBarre(e)}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

const RANGEE = 'flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base font-medium text-fg transition-colors duration-fast ease-survol hover:bg-surface-1'

/** « Déconnexion », écrit en toutes lettres. La session (Clerk) n'est lue qu'une fois la feuille ouverte. */
function Deconnexion() {
  const handleLogout = useLogout()
  return (
    <button type="button" onClick={handleLogout} className={RANGEE}>
      <LogOut size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
      Déconnexion
    </button>
  )
}

/**
 * Le compte au téléphone : le rond de la barre du haut ouvre une feuille du bas, jumelle du menu du compte du bureau
 * (MenuCompte.tsx) : qui est connecté, Paramètres, Abonnement, le thème, « Animer le fond », puis « Déconnexion » écrit en
 * toutes lettres. Un seul bord gauche. Les notifications n'y sont plus : la cloche est dans la barre du haut.
 */
export function CompteTel({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const [tiroir, setTiroir] = useState(false)
  const { user, organization } = useAuthStore()
  const prenom = prenomAffichable(user?.name, user?.email)
  return (
    <>
      <button type="button" data-compte-tel="" onClick={() => setTiroir(true)} aria-haspopup="dialog" aria-expanded={tiroir}
        aria-label={prenom ? `Mon compte — ${prenom}` : 'Mon compte'}
        className={cn('grid size-11 shrink-0 place-items-center rounded-pilule border border-bord-champ bg-surface-1 text-fg-2 transition-colors duration-fast ease-survol hover:text-fg active:scale-[.98]', className)}>
        <UserRound size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
      </button>
      <Sheet open={tiroir} onOpenChange={setTiroir}>
        <SheetContent side="bottom" className="rounded-t-section pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="px-3 text-left">
            <SheetTitle className="font-sans">Mon compte</SheetTitle>
            <SheetDescription>{[prenom, raisonSociale(organization), user?.email].filter(Boolean).join(' · ')}</SheetDescription>
          </SheetHeader>
          <ul className="mt-3 grid gap-1 border-t border-bord pt-3">
            {ENTREES_TIROIR.map((e) => (
              <li key={e.to} className="flex items-center gap-1">
                <Link to={e.to} onClick={() => setTiroir(false)} aria-current={pathname === e.to ? 'page' : undefined} className={cn(RANGEE, 'min-w-0 flex-1')}>
                  <e.icon size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
                  {e.label}
                </Link>
                {e.to === '/settings/billing' && <QuotaRond />}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 border-t border-bord px-3 pt-3">
            <p className="text-xs font-medium text-fg-3">Thème</p>
            <BasculeTheme />
            <ReglageAnimerFond />
          </div>
          <div className="mt-3 border-t border-bord pt-3"><Deconnexion /></div>
        </SheetContent>
      </Sheet>
    </>
  )
}
