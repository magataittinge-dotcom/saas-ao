import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { LogOut } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Pastille } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { CAPITAL, COMPTE, TRAVAIL, estActif, type Entree } from './navigation'
import { QuotaRond } from './QuotaGauge'
import { useUrgents } from './useUrgents'

// Barre d'icônes flottante (bureau, ≥ 769 px) : une colonne en pilule, posée à 16 px du bord, avec son anneau
// (SYSTEME-DESIGN §7, barre de nav). Chaque entrée : icône 20 px au trait de 1,5 px, cible 44 px, infobulle à droite,
// pastille d'état en coin. Les entrées sont celles de la barre latérale d'avant (navigation.ts).
// Au téléphone, c'est BarreOnglets qui prend le relais.

function Rail({ entree, pastille }: { entree: Entree; pastille?: ReactNode }) {
  const { pathname } = useLocation()
  const actif = estActif(pathname, entree.to)
  const Icone = entree.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={entree.to}
          aria-label={entree.label}
          aria-current={actif ? 'page' : undefined}
          className={cn(
            'relative grid size-11 place-items-center rounded-pilule transition-[background-color,color] duration-base ease-lien',
            actif ? 'bg-accent-tint text-accent-text' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
          )}
        >
          <Icone size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          {pastille && <span className="absolute -right-0.5 -top-0.5">{pastille}</span>}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>{entree.label}</TooltipContent>
    </Tooltip>
  )
}

export default function Sidebar() {
  const urgents = useUrgents()
  const handleLogout = useLogout()
  const { user } = useAuthStore()
  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'
  // Photo du compte Clerk ; sans photo, ou si elle ne charge pas, les initiales.
  const { user: compte } = useUser()
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null)
  const photo = compte?.hasImage && compte.imageUrl !== photoEnEchec ? compte.imageUrl : null

  const pastilleUrgents = (e: Entree) => e.to === '/projects' && urgents > 0
    ? <Pastille valeur={urgents} ton="warning" title={`${urgents} AO avec une échéance sous 7 jours`} />
    : undefined

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-4 left-4 top-4 z-40 flex w-16 flex-col items-center gap-1 overflow-y-auto rounded-section bg-surface-1 py-3 shadow-nav max-[768px]:hidden"
    >
      <Link to="/dashboard" aria-label="Synorix — tableau de bord" className="mb-2 grid size-10 shrink-0 place-items-center rounded-pilule bg-accent-fill font-display text-lg font-semibold text-accent-on">
        S
      </Link>

      {TRAVAIL.map((e) => <Rail key={e.to} entree={e} pastille={pastilleUrgents(e)} />)}
      <span role="separator" className="my-1.5 h-px w-7 bg-bord-2" />
      {CAPITAL.map((e) => <Rail key={e.to} entree={e} />)}

      <div className="mt-auto flex flex-col items-center gap-1">
        {COMPTE.map((e) => <Rail key={e.to} entree={e} />)}
        <QuotaRond />
        <span role="separator" className="my-1.5 h-px w-7 bg-bord-2" />
        <Link to="/settings" aria-label={`Paramètres du compte — ${user?.name ?? 'Utilisateur'}`} title={user?.name ?? 'Utilisateur'}
          className="grid size-10 place-items-center overflow-hidden rounded-pilule border border-bord-2 bg-surface-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent-ui">
          {photo
            ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setPhotoEnEchec(photo)} />
            : initials}
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={handleLogout} aria-label="Déconnexion"
              className="grid size-11 place-items-center rounded-pilule text-fg-2 transition-colors duration-base hover:bg-surface-2 hover:text-fg">
              <LogOut size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>Déconnexion</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
