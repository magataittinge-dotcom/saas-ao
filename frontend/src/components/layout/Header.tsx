import { Link, useLocation, useNavigate } from 'react-router-dom'
import { STEPS } from '@/components/project/StepProgress'
import { ChevronRight, Plus, Search } from 'lucide-react'
import NotificationBell from './NotificationBell'
import BasculeTheme from './BasculeTheme'
import { RACCOURCI_PALETTE } from './CommandPalette'

const ROUTE_LABELS: Record<string, { parent?: string; parentTo?: string; label: string }> = {
  '/dashboard':      { label: 'Accueil' },
  '/projects':       { label: 'Mes AO' },
  '/projects/new':   { parent: 'Mes AO', label: 'Nouvel AO' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/outils':         { label: 'Retenue de garantie' },
  '/memoire-config': { label: 'Mon entreprise' },
  '/company':        { label: 'Mon entreprise' },
  '/entreprise/fiche': { parent: 'Mon entreprise', parentTo: '/company', label: 'Fiche à télécharger' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Facturation' },
  '/billing':        { label: 'Facturation' },
  '/settings/billing': { label: 'Abonnement' },
  '/design':         { label: 'Système de design' },
}
// Le titre de page d'un écran de l'AO est le nom de l'étape au fil (source unique : STEPS ; « candidature » est l'ancien nom de Pièces).
export const STEP_LABELS: Record<string, string> = { ...Object.fromEntries(STEPS.map((e) => [e.segment, e.label])), candidature: 'Pièces' }

interface Props {
  /** Ouvre la palette Ctrl K. */
  onSearch: () => void
}

// En-tête (DESIGN.md § Layout) : fil d'Ariane et titre de la page en Manrope (le h1 serif est dans la page), recherche
// Ctrl K sur une ligne (pilule de 44 px), bascule soleil / lune, notifications, bouton « Nouvel appel d'offres » : le seul
// dégradé de l'écran (le texte se réduit au « + » sous 640 px). Pas de verre : posé sur l'aurore au bureau, plein et
// filet d'un pixel au téléphone. Le Compagnon vit sur les écrans d'un AO, pas ici.
export default function Header({ onSearch }: Props) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  let parent: string | undefined
  let parentTo = '/projects'
  let label = ''
  const projectMatch = pathname.match(/^\/projects\/[^/]+\/(\w+)/)
  if (projectMatch) { parent = 'Mes AO'; label = STEP_LABELS[projectMatch[1]] ?? 'Projet' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; parentTo = match[1].parentTo ?? '/projects'; label = match[1].label }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 px-3 sm:px-6 max-[768px]:border-b max-[768px]:border-bord max-[768px]:bg-surface-0 min-[769px]:h-[72px] min-[769px]:bg-transparent">
      <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-[15px]">
        {parent && (
          <>
            <Link to={parentTo} className="hidden truncate text-fg-3 transition-colors hover:text-fg sm:inline">{parent}</Link>
            <ChevronRight size={14} className="hidden shrink-0 text-fg-3 sm:block" aria-hidden />
          </>
        )}
        <span className="truncate font-sans text-lg font-semibold text-fg max-[768px]:text-base" aria-current="page">{label || 'Accueil'}</span>
      </nav>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-11 items-center gap-2.5 rounded-pilule border border-bord-champ bg-surface-0 pl-4 pr-2 text-sm text-fg-3 transition-[border-color,color] duration-base ease-lien hover:border-accent-ui hover:text-fg-2 max-[768px]:w-11 max-[768px]:justify-center max-[768px]:border-0 max-[768px]:bg-transparent max-[768px]:px-0 min-[769px]:w-72"
          aria-label="Rechercher un appel d'offres ou une page"
        >
          <Search size={18} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left max-[768px]:hidden">Rechercher un AO…</span>
          <kbd className="chiffres shrink-0 whitespace-nowrap rounded-xs border border-bord bg-surface-1 px-1.5 py-0.5 font-sans text-xs font-semibold text-fg-2 max-[768px]:hidden">{RACCOURCI_PALETTE}</kbd>
        </button>

        <BasculeTheme />
        <NotificationBell />

        <button
          type="button"
          onClick={() => navigate('/projects/new')}
          className="ml-1 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent-fill text-sm font-semibold text-accent-on shadow-cta transition-[transform,background-image] duration-base ease-survol hover:-translate-y-px hover:[background-image:var(--accent-fill-hover)] active:translate-y-0 max-sm:w-11 sm:px-5"
        >
          <Plus size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          <span className="max-sm:sr-only">Nouvel appel d&apos;offres</span>
        </button>
      </div>
    </header>
  )
}
