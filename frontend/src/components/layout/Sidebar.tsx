import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Pastille } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { libelleUrgents } from '@/lib/echeance'
import Logo from './Logo'
import { BARRE, BARRE_HAUT, ENTREE_PARAMETRES, estActif, type Entree } from './navigation'
import { QuotaRond } from './QuotaGauge'
import { useTonUrgence, useUrgents } from './useUrgents'
import MenuCompte from './MenuCompte'

// Barre d'icônes flottante (bureau, ≥ 769 px), DESIGN.md § Layout : une colonne de 76 px posée à 16 px du bord, trait de
// 1 px et ombre « flottant » (pas d'anneau épais). Cinq entrées, chacune avec son nom écrit sous l'icône en 11 px (visible
// sans survol, donc sur tablette aussi) : icône 20 px au trait de 1,5 px, cible d'au moins 56 px de haut, pastille d'état
// en coin. Entrée active : fond bleu doux, texte bleu, et une barre de 3 px posée hors du bloc, contre le bord gauche.
// La déconnexion est dans le menu du compte (la photo). Les entrées viennent de navigation.ts.
// Au téléphone, c'est BarreOnglets qui prend le relais.

function Rail({ entree, pastille }: { entree: Entree; pastille?: ReactNode }) {
  const { pathname } = useLocation()
  const actif = estActif(pathname, entree.to)
  const Icone = entree.icon
  return (
    <Link
      to={entree.to}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 transition-[background-color,color] duration-survol ease-survol',
        actif ? 'bg-bleu-soft text-bleu-ink' : 'text-fg-2 hover:bg-surface-1 hover:text-fg',
      )}
    >
      {actif && <span aria-hidden className="absolute -left-1 top-3 bottom-3 w-[3px] rounded-r-pilule bg-accent-ui" />}
      <Icone size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
      <span className="text-micro font-medium leading-[1.15] text-center">{entree.label}</span>
      {pastille && <span className="absolute right-2 top-1">{pastille}</span>}
    </Link>
  )
}

/** Les entrées de la barre (sans Clerk ni quota : se rend telle quelle dans les tests). */
export function EntreesBarre({ entrees = BARRE }: { entrees?: Entree[] }) {
  const urgents = useUrgents()
  const ton = useTonUrgence()
  return (
    <>
      {entrees.map((e) => (
        <Rail key={e.to} entree={e}
          pastille={e.to === '/projects' && urgents > 0
            ? <Pastille valeur={urgents} ton={ton} role="img" aria-label={libelleUrgents(urgents)} title={libelleUrgents(urgents)} />
            : undefined} />
      ))}
    </>
  )
}

export default function Sidebar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-4 left-4 top-4 z-40 flex w-[76px] flex-col items-center gap-1 overflow-y-auto overflow-x-hidden rounded-carte border border-bord bg-surface-0 px-1 py-3 shadow-flottant max-[768px]:hidden"
    >
      {/* logo provisoire : l'arc d'aurore (Logo.tsx), à l'encre du thème, et le nom dessous en 11 px */}
      <Link to="/dashboard" aria-label="Synorix — accueil" className="mb-3 flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 pb-1 pt-0.5 text-fg transition-colors duration-survol hover:bg-surface-1">
        <Logo className="size-8" />
        <span aria-hidden className="text-micro font-semibold leading-none tracking-[-0.01em]">Synorix</span>
      </Link>

      <EntreesBarre entrees={BARRE_HAUT} />

      <div className="mt-auto flex w-full flex-col items-center gap-1">
        <EntreesBarre entrees={[ENTREE_PARAMETRES]} />
        <QuotaRond masquerIllimite />
        <span role="separator" className="my-1.5 h-px w-7 bg-bord" />
        <MenuCompte />
      </div>
    </nav>
  )
}
