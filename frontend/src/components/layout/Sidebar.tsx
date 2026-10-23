import { useState, useEffect, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import {
  LayoutDashboard, FolderOpen, Building2, Archive, Users, LogOut,
  Settings, Calculator, Briefcase, Plus, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import {
  Sidebar as BarreShadcn, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/authStore'
import { echeanceAO, estEnCours, etatEcheance } from '@/lib/echeance'
import { useLogout } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProject'
import { cn } from '@/lib/utils'
import QuotaGauge from './QuotaGauge'

// B4 — structure cible PRD §4 : [+ Nouvel AO] hors nav · TRAVAIL · MON
// CAPITAL · jauge quota · Paramètres en bas (billing = sous-onglet de
// Paramètres). Le pipeline n'apparaît JAMAIS ici.
const SECTIONS: { label: string; items: { to: string; icon: typeof LayoutDashboard; label: string }[] }[] = [
  {
    label: 'Travail',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
      { to: '/projects',  icon: FolderOpen,      label: 'Mes AO' },
    ],
  },
  {
    label: 'Mon capital',
    items: [
      { to: '/company',        icon: Briefcase,  label: 'Mon entreprise' },
      { to: '/references',     icon: Building2,  label: 'Mes références' },
      { to: '/vault',          icon: Archive,    label: 'Coffre-fort' },
      { to: '/outils',         icon: Calculator, label: 'Calculateurs' },
    ],
  },
]

const BOTTOM_ITEMS = [
  { to: '/team',     icon: Users,    label: 'Équipe' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

// Élément actif : fond bleu de Prusse pâle, texte bleu de Prusse (thème Calque).
const ACTIF = 'data-[active=true]:bg-prusse-50 data-[active=true]:text-prusse-700 data-[active=true]:font-semibold'
const LIEN = cn('h-9 gap-2.5 px-2.5 text-[15px] font-medium text-encre-2 group-data-[collapsible=icon]:mx-auto [&>svg]:size-[18px] [&>svg]:text-encre-3 data-[active=true]:[&>svg]:text-prusse-700', ACTIF)

export default function Sidebar() {
  // 1.11 — la barre s'ouvre par un bouton (plus au survol : le contenu sautait
  // au passage de la souris). La préférence est gardée par Layout (localStorage).
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar()
  const ouverte = state === 'expanded'
  const basculerOuverture = () => setOpen(!ouverte)
  // Le tiroir du téléphone montre toujours la barre dépliée.
  const deplie = ouverte || isMobile

  const handleLogout = useLogout()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuthStore()
  const { data: projects = [] } = useProjects()

  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U'
  // Photo du compte Clerk (Google ou importée) ; sans photo, ou si elle ne
  // charge pas, les initiales restent.
  const { user: compte } = useUser()
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null)
  const photo = compte?.hasImage && compte.imageUrl !== photoEnEchec ? compte.imageUrl : null

  // Badge sur « Mes AO » : AO en cours dont l'échéance est aujourd'hui ou sous
  // 7 jours — même calcul que tous les écrans (1.14).
  const urgentCount = useMemo(() => projects.filter((p) => {
    if (!estEnCours(p.status)) return false
    const etat = etatEcheance(echeanceAO(p)).etat
    return etat === 'aujourdhui' || etat === 'proche'
  }).length, [projects])

  // Sur téléphone, le tiroir se referme quand on change de page.
  useEffect(() => { if (isMobile) setOpenMobile(false) }, [pathname, isMobile, setOpenMobile])

  const estActif = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  const lien = ({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) => (
    <SidebarMenuItem key={to}>
      <SidebarMenuButton asChild isActive={estActif(to)} tooltip={label} className={LIEN}>
        <NavLink to={to}>
          <Icon strokeWidth={1.6} />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
      {to === '/projects' && urgentCount > 0 && (
        <>
          <SidebarMenuBadge
            className="right-2 top-2 rounded-full bg-attention-fond px-1.5 text-xs font-semibold tabular-nums text-attention"
            title={`${urgentCount} AO avec une échéance sous 7 jours`}
          >
            {urgentCount}
          </SidebarMenuBadge>
          {!deplie && (
            <span aria-hidden className="pointer-events-none absolute right-3 top-1.5 hidden size-2 rounded-full bg-attention md:block" />
          )}
        </>
      )}
    </SidebarMenuItem>
  )

  return (
    <BarreShadcn collapsible="icon" className="calque border-ligne">
      {/* ── Marque + [Nouvel AO], hors navigation ─────────────────── */}
      <SidebarHeader className="gap-4 px-3 pb-2 pt-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="grid size-[26px] shrink-0 place-items-center rounded-md bg-encre text-[13px] font-bold text-sur-encre">S</span>
          <span className="text-[17px] font-semibold tracking-tight text-encre group-data-[collapsible=icon]:hidden">Synorix</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Nouvel AO"
              onClick={() => navigate('/projects/new')}
              className="h-9 justify-center gap-2 bg-encre text-sm font-semibold text-sur-encre hover:bg-encre-survol hover:text-sur-encre active:bg-encre-survol active:text-sur-encre group-data-[collapsible=icon]:mx-auto [&>svg]:size-4"
            >
              <Plus strokeWidth={2} />
              <span>Nouvel AO</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Travail / Mon capital ─────────────────────────────────── */}
      <SidebarContent className="gap-1 px-1 group-data-[collapsible=icon]:items-center">
        {SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className="py-1.5">
            <SidebarGroupLabel className="h-7 px-2.5 text-xs font-semibold tracking-wide text-encre-3">
              {section.label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">{section.items.map(lien)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Équipe, Paramètres, offre et quota, compte ────────────── */}
      <SidebarFooter className="gap-0 px-1 pb-3 group-data-[collapsible=icon]:items-center">
        <SidebarGroup className="py-1">
          <SidebarMenu className="gap-0.5">{BOTTOM_ITEMS.map(lien)}</SidebarMenu>
        </SidebarGroup>

        {deplie && (
          <div className="mx-2 border-t border-ligne pt-1">
            <QuotaGauge />
          </div>
        )}

        <div className={cn('mx-2 flex items-center gap-2.5 border-t border-ligne pt-3', !deplie && 'mx-0 flex-col border-t-0 pt-1')}>
          <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-ligne bg-surface-2 text-xs font-semibold text-encre-2">
            {photo
              ? <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setPhotoEnEchec(photo)} />
              : initials}
          </div>
          {deplie && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-encre">{user?.name || 'Utilisateur'}</p>
              <p className="truncate text-xs text-encre-3">{user?.email || ''}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Déconnexion"
            aria-label="Déconnexion"
            className="grid size-8 shrink-0 place-items-center rounded-md text-encre-3 transition-colors hover:bg-surface-2 hover:text-encre"
          >
            <LogOut size={16} strokeWidth={1.6} />
          </button>
        </div>

        {/* ── Déplier / replier (bureau) ── */}
        <button
          onClick={basculerOuverture}
          aria-expanded={ouverte}
          aria-label={ouverte ? 'Replier la barre latérale' : 'Déplier la barre latérale'}
          title={ouverte ? 'Replier' : 'Déplier'}
          className={cn(
            'mx-2 mt-2 hidden h-8 items-center gap-2 rounded-md text-sm text-encre-3 transition-colors hover:bg-surface-2 hover:text-encre md:flex',
            ouverte ? 'px-2' : 'mx-0 w-8 justify-center',
          )}
        >
          {ouverte ? <PanelLeftClose size={16} strokeWidth={1.6} /> : <PanelLeftOpen size={16} strokeWidth={1.6} />}
          {ouverte && <span>Replier</span>}
        </button>
      </SidebarFooter>
    </BarreShadcn>
  )
}
