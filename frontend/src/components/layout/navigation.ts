// Entrées de navigation de la coquille : une seule liste, lue par la barre d'icônes (bureau),
// les onglets du bas (téléphone) et la palette Ctrl K. Structure PRD §4 : [+ Nouvel AO] hors nav ·
// TRAVAIL · MON CAPITAL · jauge quota · Paramètres. Le pipeline n'apparaît JAMAIS ici.
import {
  Archive, Briefcase, Building2, Calculator, FolderOpen, Home, LayoutDashboard, Settings, Users, type LucideIcon,
} from 'lucide-react'

export interface Entree {
  to: string
  icon: LucideIcon
  label: string
}

export const TRAVAIL: Entree[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/projects', icon: FolderOpen, label: 'Mes AO' },
]

export const CAPITAL: Entree[] = [
  { to: '/company', icon: Briefcase, label: 'Mon entreprise' },
  { to: '/references', icon: Building2, label: 'Mes références' },
  { to: '/vault', icon: Archive, label: 'Coffre-fort' },
  { to: '/outils', icon: Calculator, label: 'Retenue de garantie' },
]

export const COMPTE: Entree[] = [
  { to: '/team', icon: Users, label: 'Équipe' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

/** Onglets du bas au téléphone (≤ 768 px). « Compte » ouvre un tiroir qui liste le reste des entrées. */
export const ONGLETS_TEL: Entree[] = [
  { to: '/dashboard', icon: Home, label: 'Accueil' },
  { to: '/projects', icon: FolderOpen, label: 'Mes AO' },
  { to: '/vault', icon: Archive, label: 'Coffre-fort' },
]

/** Place prévue pour « Cerveau » (bloc 8) : l'onglet s'insère ici quand la page existe. */
export const ONGLET_CERVEAU: (Entree & { disponible: boolean }) | null = null

/** Entrées du tiroir « Compte » (téléphone) : tout ce que la barre d'icônes montre et que les onglets n'ont pas. */
export const ENTREES_TIROIR: Entree[] = [
  { to: '/company', icon: Briefcase, label: 'Mon entreprise' },
  { to: '/references', icon: Building2, label: 'Mes références' },
  { to: '/outils', icon: Calculator, label: 'Retenue de garantie' },
  { to: '/team', icon: Users, label: 'Équipe' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

export const estActif = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)
