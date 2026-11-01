// Entrées de navigation de la coquille : une seule liste, lue par la barre d'icônes (bureau),
// les onglets du bas (téléphone) et la palette Ctrl K. Structure PRD §4 : [+ Nouvel AO] hors nav ·
// Accueil · Mes AO · Mon entreprise · Coffre-fort · jauge quota · Paramètres. Le pipeline n'apparaît JAMAIS ici.
import {
  Archive, Briefcase, Building2, Calculator, CreditCard, FolderOpen, Home, Settings, Users, type LucideIcon,
} from 'lucide-react'

export interface Entree {
  to: string
  icon: LucideIcon
  label: string
}

/** La barre d'icônes (bureau) : cinq entrées, chacune avec son nom écrit sous l'icône. Équipe et Mes références sont des accès de
 *  « Mon entreprise » ; « Retenue de garantie » n'est plus dans la barre (carte de trésorerie, Paramètres, palette Ctrl K). */
export const BARRE_HAUT: Entree[] = [
  { to: '/dashboard', icon: Home, label: 'Accueil' },
  { to: '/projects', icon: FolderOpen, label: 'Mes AO' },
  { to: '/company', icon: Briefcase, label: 'Mon entreprise' },
  { to: '/vault', icon: Archive, label: 'Coffre-fort' },
]
export const ENTREE_PARAMETRES: Entree = { to: '/settings', icon: Settings, label: 'Paramètres' }
export const BARRE: Entree[] = [...BARRE_HAUT, ENTREE_PARAMETRES]

/** Onglets du bas au téléphone (≤ 768 px). « Compte » (la photo) ouvre un tiroir : Paramètres, le quota, le thème, la déconnexion. */
export const ONGLETS_TEL: Entree[] = [
  { to: '/dashboard', icon: Home, label: 'Accueil' },
  { to: '/projects', icon: FolderOpen, label: 'Mes AO' },
  { to: '/company', icon: Briefcase, label: 'Mon entreprise' },
  { to: '/vault', icon: Archive, label: 'Coffre-fort' },
]

/** Place prévue pour « Cerveau » (bloc 8) : l'onglet s'insère ici quand la page existe. */
export const ONGLET_CERVEAU: (Entree & { disponible: boolean }) | null = null

/** Entrées du tiroir « Compte » (téléphone) : ce que les onglets n'ont pas. */
export const ENTREES_TIROIR: Entree[] = [ENTREE_PARAMETRES]

export { REDIRECTIONS_ENTREPRISE } from '@/lib/entreprise/redirections'

/** Tout ce que la palette Ctrl K propose sous « Aller à » : la barre, plus les accès qui n'y sont pas ou plus. */
export const ACCES_PALETTE: Entree[] = [
  ...BARRE,
  { to: '/team', icon: Users, label: 'Équipe' },
  { to: '/references', icon: Building2, label: 'Mes références' },
  { to: '/outils', icon: Calculator, label: 'Retenue de garantie' },
  { to: '/settings/billing', icon: CreditCard, label: 'Abonnement' },
]

/** Les pages de « Mon entreprise » hors de /company (fiches à télécharger) gardent son entrée active. */
const SOUS_PAGES: Readonly<Record<string, readonly string[]>> = { '/company': ['/entreprise/'] }
export const estActif = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`) || (SOUS_PAGES[to] ?? []).some((p) => pathname.startsWith(p))
