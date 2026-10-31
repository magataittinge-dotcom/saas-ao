import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { useCompanionStore } from '@/stores/companionStore'
import { useTheme } from '@/lib/theme'
import NotificationBell from './NotificationBell'
import BasculeTheme from './BasculeTheme'
import { RACCOURCI_PALETTE } from './CommandPalette'
import CompanionOrb from '@/components/ui/CompanionOrb'
import type { CompanionState } from '@/components/ui/CompanionOrb'

const ROUTE_LABELS: Record<string, { parent?: string; label: string }> = {
  '/dashboard':      { label: 'Tableau de bord' },
  '/projects':       { label: 'Mes AO' },
  '/projects/new':   { parent: 'Mes AO', label: 'Nouvel AO' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/outils':         { label: 'Retenue de garantie' },
  '/memoire-config': { label: 'Mon entreprise' },
  '/company':        { label: 'Mon entreprise' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Facturation' },
  '/billing':        { label: 'Facturation' },
  '/settings/billing': { label: 'Abonnement' },
  '/design':         { label: 'Système de design' },
}
const STEP_LABELS: Record<string, string> = { upload: 'Dépôt du dossier', lots: 'Sélection lots', analysis: 'Décider', verification: 'Pièces', candidature: 'Pièces', memoire: 'Mémoire', export: 'Export' }

const COMPANION_LABELS: Record<CompanionState, string> = {
  veille:  'Compagnon Synorix — en veille',
  reveil:  'Compagnon Synorix — réveil',
  analyse: 'Compagnon Synorix — analyse en cours',
  succes:  'Compagnon Synorix — analyse terminée',
  sommeil: 'Compagnon Synorix — repos',
}

interface Props {
  /** Ouvre la palette Ctrl K. */
  onSearch: () => void
}

// En-tête : fil d'Ariane, recherche Ctrl K, bascule soleil / lune, Compagnon, notifications, bouton
// « Nouvel appel d'offres » (le texte se réduit au « + » sous 640 px). Verre dépoli (flou 16 px) sur bureau ; plein au téléphone (≤ 3 flous simultanés).
export default function Header({ onSearch }: Props) {
  const companionState = useCompanionStore((s) => s.state)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [theme] = useTheme()

  let parent: string | undefined
  let label = ''
  const projectMatch = pathname.match(/^\/projects\/[^/]+\/(\w+)/)
  if (projectMatch) { parent = 'Mes AO'; label = STEP_LABELS[projectMatch[1]] ?? 'Projet' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; label = match[1].label }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-bord bg-surface-0 px-3 sm:px-6 min-[769px]:bg-[var(--glass-fill)] min-[769px]:backdrop-blur-md">
      <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-[15px]">
        {parent && (
          <>
            <Link to="/projects" className="hidden truncate text-fg-3 transition-colors hover:text-fg sm:inline">{parent}</Link>
            <ChevronRight size={14} className="hidden shrink-0 text-fg-3 sm:block" aria-hidden />
          </>
        )}
        <span className="truncate font-display text-lg font-semibold text-fg max-[768px]:text-base" aria-current="page">{label || 'Tableau de bord'}</span>
      </nav>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-11 items-center gap-2 rounded-pilule border border-input bg-surface-0 px-3 text-sm text-fg-3 transition-[border-color,color] duration-base hover:border-fg-3 hover:text-fg-2 max-[768px]:w-11 max-[768px]:justify-center max-[768px]:border-0 max-[768px]:bg-transparent max-[768px]:px-0 min-[769px]:w-64"
          aria-label="Rechercher un appel d'offres ou une page"
        >
          <Search size={18} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" aria-hidden />
          <span className="flex-1 text-left max-[768px]:hidden">Rechercher…</span>
          <kbd className="rounded-sm border border-bord-2 bg-surface-1 px-1.5 font-sans text-xs text-fg-2 max-[768px]:hidden">{RACCOURCI_PALETTE}</kbd>
        </button>

        <BasculeTheme />

        {/* Compagnon IA — état piloté par companionStore (analyse SSE, etc.) */}
        <CompanionOrb
          state={companionState}
          size={30}
          fond={theme === 'light' ? 'clair' : 'sombre'}
          title={COMPANION_LABELS[companionState]}
          className="mx-1 max-[768px]:hidden"
        />
        <NotificationBell />

        <button
          type="button"
          onClick={() => navigate('/projects/new')}
          className="ml-1 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent-fill text-sm font-semibold text-accent-on shadow-btn transition-[transform,box-shadow] duration-pop ease-pop hover:[background-image:var(--accent-fill-hover)] hover:shadow-cta active:scale-95 max-sm:w-11 sm:px-5"
        >
          <Plus size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          <span className="max-sm:sr-only">Nouvel appel d&apos;offres</span>
        </button>
      </div>
    </header>
  )
}
