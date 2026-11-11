import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/hooks/useProject'
import { useUIStore } from '@/stores/uiStore'
import { Bouton } from '@/components/ui/bouton'
import { STEPS } from '@/components/project/StepProgress'
import NotificationBell from './NotificationBell'
import { CompteTel } from './BarreOnglets'
import { RACCOURCI_PALETTE } from './CommandPalette'

// Le titre court de chaque écran, pour la barre (moins de 15 caractères quand c'est possible). Le nom complet est le h1 de la page.
const ROUTE_LABELS: Record<string, { parent?: string; parentTo?: string; label: string }> = {
  '/dashboard':      { label: 'Accueil' },
  '/projects':       { label: 'Mes AO' },
  '/projects/new':   { parent: 'Mes AO', label: 'Nouvel AO' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/outils':         { parent: 'Paramètres', parentTo: '/settings', label: 'Retenue de garantie' },
  '/memoire-config': { label: 'Mon entreprise' },
  '/company':        { label: 'Mon entreprise' },
  '/entreprise/fiche': { parent: 'Mon entreprise', parentTo: '/company', label: 'Fiche à télécharger' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Abonnement' },
  '/billing':        { label: 'Abonnement' },
  '/settings/billing': { parent: 'Paramètres', parentTo: '/settings', label: 'Abonnement' },
  '/design':         { label: 'Système de design' },
}
// Le nom de chaque étape au fil (source unique : STEPS ; « candidature » est l'ancien nom de Pièces).
export const STEP_LABELS: Record<string, string> = { ...Object.fromEntries(STEPS.map((e) => [e.segment, e.label])), candidature: 'Pièces' }

/**
 * Le petit titre de la barre (VEILLE-DESIGN P10) : caché tant que le h1 de la page est à l'écran, il apparaît en fondu de
 * 100 ms quand le h1 en sort. Il occupe toujours sa place : aucun saut de mise en page. Il ne double jamais le h1.
 */
export function TitreBarre({ titre, montre }: { titre: string; montre: boolean }) {
  return (
    <span data-titre-barre="" aria-hidden={montre ? undefined : true}
      className={cn('truncate text-base font-semibold text-fg transition-opacity duration-fast ease-survol', montre ? 'opacity-100' : 'opacity-0')}>
      {titre}
    </span>
  )
}

const LIEN_PARENT = 'shrink-0 rounded-md text-base text-fg-2 transition-colors duration-fast ease-survol hover:text-fg max-[768px]:inline-flex max-[768px]:min-h-11 max-[768px]:items-center [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center'

interface Props {
  /** Ouvre la palette Ctrl K. */
  onSearch: () => void
  /** Le h1 de l'écran est sorti de l'écran (layout/useTitreSorti.ts). */
  titreSorti?: boolean
}

// Barre du haut (DESIGN.md § Layout). Son contenu est dans LE conteneur de la coquille : son bord gauche est celui du h1 de la
// page. À gauche : dans un AO, le chemin « Mes AO / nom de l'AO » (c'est de la navigation) ; ailleurs le petit titre, qui
// n'apparaît que lorsque le h1 est sorti de l'écran. À droite : la recherche Ctrl K, les notifications (bureau) et « Nouvel appel
// d'offres ». Au téléphone : 56 px ; la recherche, la cloche, « + » (hors d'un AO) et le compte (la photo : thème, déconnexion).
// Un seul aplat d'accent par écran (P1) : dès qu'un écran montre sa propre action principale, ce bouton passe au trait.
export default function Header({ onSearch, titreSorti = false }: Props) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const aplatsEcran = useUIStore((s) => s.aplatsEcran + s.aplatsSuite)

  const idAO = pathname.match(/^\/projects\/(?!new(?:\/|$))([^/]+)/)?.[1]
  const { data: ao } = useProject(idAO ?? '')
  let parent: string | undefined
  let parentTo = '/projects'
  let label = ''
  if (idAO) { parent = 'Mes AO'; label = ao?.name ?? '' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; parentTo = match[1].parentTo ?? '/projects'; label = match[1].label }
  }
  // Dans un AO, l'écran a toujours son action (celle de l'étape, « Réessayer », « Mettre à jour le statut ») : le bouton de la
  // barre y reste au trait, même pendant un chargement ou une erreur (jury, tour 1 : il repassait en aplat sur huit états).
  const auTrait = aplatsEcran > 0 || Boolean(idAO)

  return (
    <header data-coquille="barre-haut" className="sticky top-0 z-30 shrink-0 max-[768px]:border-b max-[768px]:border-bord max-[768px]:bg-surface-0 min-[769px]:bg-transparent">
      <div className="conteneur flex h-14 items-center justify-between gap-3 min-[769px]:h-16">
        <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-2">
          {parent && (
            <>
              <Link to={parentTo} className={LIEN_PARENT}>
                <ChevronLeft size={18} strokeWidth={1.5} aria-hidden className="-ml-1 mr-0.5 shrink-0 min-[769px]:hidden" />
                {parent}
              </Link>
              {(!idAO || label) && <span aria-hidden className="shrink-0 text-fg-3 max-[768px]:hidden">/</span>}
            </>
          )}
          {/* Au téléphone, la barre porte la recherche, la cloche et le compte : il reste la place du retour. Le fil s'y réduit
              au parent, précédé d'un chevron (« ‹ Mes AO », « ‹ Paramètres ») ; la page courante est le h1, juste dessous, et
              dans un AO son nom est écrit en entier sous la barre (routes/Project.tsx). */}
          {/* Un fil d'Ariane se lit en entier (jury, tour 1 : « Mes AO / », « Mon entreprise / » sans suite) : dès qu'il y a
              un parent, la page courante est écrite. Sans parent : le petit titre, quand le h1 est sorti de l'écran. */}
          {idAO || parent
            ? <span data-fil-courant="" className="truncate text-base font-semibold text-fg max-[768px]:hidden" aria-current="page">{label}</span>
            : <TitreBarre titre={label || 'Accueil'} montre={titreSorti} />}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onSearch}
            className="flex h-11 items-center gap-2.5 rounded-pilule border border-bord-champ bg-surface-0 pl-4 pr-2 text-sm text-fg-3 transition-colors duration-fast ease-survol hover:bg-surface-1 hover:text-fg-2 active:scale-[.98] max-[768px]:w-11 max-[768px]:justify-center max-[768px]:border-0 max-[768px]:bg-transparent max-[768px]:px-0 min-[769px]:w-72"
            aria-label="Rechercher un appel d’offres ou une page"
          >
            <Search size={18} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left max-[768px]:hidden">Rechercher un AO…</span>
            <kbd className="chiffres shrink-0 whitespace-nowrap rounded border border-bord bg-surface-1 px-1.5 py-0.5 font-sans text-xs font-semibold text-fg-2 max-[768px]:hidden">{RACCOURCI_PALETTE}</kbd>
          </button>

          {/* la cloche est dans la barre du haut au téléphone aussi (elle était cachée dans le tiroir « Compte ») */}
          <NotificationBell />

          <Bouton coquille variante={auTrait ? 'secondaire' : 'principal'} data-nouvel-ao={auTrait ? 'trait' : 'plein'} onClick={() => navigate('/projects/new')}
            className={cn('rounded-pilule max-sm:w-11 max-sm:px-0', parent && 'max-[768px]:hidden')}>
            <Plus strokeWidth={1.5} aria-hidden />
            <span className="max-sm:sr-only">Nouvel appel d’offres</span>
          </Bouton>

          {/* le compte (la photo) : au pied de la barre latérale au bureau, ici au téléphone */}
          <CompteTel className="min-[769px]:hidden" />
        </div>
      </div>
    </header>
  )
}
