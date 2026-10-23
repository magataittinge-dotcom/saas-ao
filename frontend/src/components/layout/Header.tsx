import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { ChevronRight, Search } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/authStore'
import { useCompanionStore } from '@/stores/companionStore'
import NotificationBell from './NotificationBell'
import { RACCOURCI_PALETTE } from './CommandPalette'
import CompanionOrb from '@/components/ui/CompanionOrb'
import type { CompanionState } from '@/components/ui/CompanionOrb'

const ROUTE_LABELS: Record<string, { parent?: string; label: string }> = {
  '/dashboard':      { label: 'Tableau de bord' },
  '/projects':       { label: 'Mes AO' },
  '/projects/new':   { parent: 'Mes AO', label: 'Nouvel AO' },
  '/vault':          { label: 'Coffre-fort' },
  '/references':     { label: 'Références' },
  '/outils':         { label: 'Calculateurs' },
  '/memoire-config': { label: 'Mon entreprise' },
  '/company':        { label: 'Mon entreprise' },
  '/team':           { label: 'Équipe' },
  '/settings':       { label: 'Paramètres' },
  '/pricing':        { label: 'Facturation' },
  '/billing':        { label: 'Facturation' },
  '/settings/billing': { label: 'Abonnement' },
}
const STEP_LABELS: Record<string, string> = { upload: 'Dépôt du DCE', lots: 'Sélection lots', analysis: 'Analyse IA', verification: 'Vérification', candidature: 'Vérification', memoire: 'Mémoire', export: 'Export' }

const COMPANION_LABELS: Record<CompanionState, string> = {
  veille:  'Compagnon Synorix — en veille',
  reveil:  'Compagnon Synorix — réveil',
  analyse: 'Compagnon Synorix — analyse en cours',
  succes:  'Compagnon Synorix — analyse terminée',
  sommeil: 'Compagnon Synorix — repos',
}

interface Props {
  /** Ouvre la palette ⌘K. */
  onSearch: () => void
}

export default function Header({ onSearch }: Props) {
  const { user } = useAuthStore()
  const companionState = useCompanionStore((s) => s.state)
  const { pathname } = useLocation()

  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'
  const displayName = user?.name ?? 'Utilisateur'
  // La photo du compte, comme en bas de la barre latérale (1.17) ; sans photo,
  // ou si elle ne charge pas, les initiales.
  const { user: compte } = useUser()
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null)
  const photo = compte?.hasImage && compte.imageUrl !== photoEnEchec ? compte.imageUrl : null

  let parent: string | undefined
  let label = ''
  const projectMatch = pathname.match(/^\/projects\/[^/]+\/(\w+)/)
  if (projectMatch) { parent = 'Mes AO'; label = STEP_LABELS[projectMatch[1]] ?? 'Projet' }
  else {
    const match = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length).find(([r]) => pathname.startsWith(r))
    if (match) { parent = match[1].parent; label = match[1].label }
  }

  return (
    <header className="calque sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ligne bg-papier px-4 sm:px-6">
      {/* Gauche : tiroir (téléphone) + fil d'Ariane */}
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="size-9 text-encre-3 hover:bg-surface-2 hover:text-encre md:hidden" aria-label="Ouvrir la navigation" />
        <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-[15px]">
          {parent && (
            <>
              <Link to="/projects" className="hidden truncate text-encre-3 transition-colors hover:text-encre sm:inline">{parent}</Link>
              <ChevronRight size={14} className="hidden shrink-0 text-encre-4 sm:block" aria-hidden />
            </>
          )}
          <span className="truncate font-medium text-encre" aria-current="page">{label || 'Tableau de bord'}</span>
        </nav>
      </div>

      {/* Droite : recherche ⌘K, Compagnon, notifications, compte */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          onClick={onSearch}
          className="flex h-9 items-center gap-2 rounded-md border border-ligne-forte bg-surface px-3 text-sm text-encre-3 transition-colors hover:border-ligne-champ hover:text-encre-2 sm:w-64"
          aria-label="Rechercher un appel d'offres ou une page"
        >
          <Search size={16} strokeWidth={1.6} className="shrink-0" />
          <span className="hidden flex-1 text-left sm:inline">Rechercher…</span>
          <kbd className="hidden rounded border border-ligne bg-surface-2 px-1.5 font-sans text-xs text-encre-3 sm:inline">{RACCOURCI_PALETTE}</kbd>
        </button>

        {/* Compagnon IA — état piloté par companionStore (analyse SSE, etc.) */}
        <CompanionOrb
          state={companionState}
          size={30}
          fond="clair"
          title={COMPANION_LABELS[companionState]}
          className="mx-1"
        />
        {/* Notifications (C23) */}
        <NotificationBell />

        <Link
          to="/settings"
          title={displayName}
          aria-label={`Paramètres du compte — ${displayName}`}
          className="ml-1 grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-ligne bg-surface-2 text-xs font-semibold text-encre-2 transition-shadow hover:shadow-[0_0_0_2px_var(--calque-ligne-forte)]"
        >
          {photo
            ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setPhotoEnEchec(photo)} />
            : initials}
        </Link>
      </div>
    </header>
  )
}
