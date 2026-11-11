// Entrées de navigation de la coquille : une seule liste, lue par la barre d'icônes (bureau),
// les onglets du bas (téléphone) et la palette Ctrl K. Structure PRD §4 : [+ Nouvel AO] hors nav ·
// Accueil · Mes AO · Mon entreprise · Coffre-fort · jauge quota · Paramètres. Le pipeline n'apparaît JAMAIS ici.
import {
  Archive, Briefcase, Building2, Calculator, CreditCard, FolderOpen, Home, Settings, Users, type LucideIcon,
} from 'lucide-react'

export interface Entree {
  to: string
  icon: LucideIcon
  /** Le nom complet : titre de la page, aria-label de l'entrée, palette Ctrl K. */
  label: string
  /** Le libellé court des barres (latérale et du bas), quand le nom complet ne tient pas sur UNE ligne (P26). */
  court?: string
}

/** Ce qu'une barre écrit sous l'icône : le libellé court s'il existe, toujours sur une ligne. */
export const libelleBarre = (e: Entree): string => e.court ?? e.label

/** La barre d'icônes (bureau) : cinq entrées, chacune avec son nom écrit sous l'icône. Équipe et Mes références sont des accès de
 *  « Mon entreprise » ; « Retenue de garantie » n'est plus dans la barre (carte de trésorerie, Paramètres, palette Ctrl K). */
export const BARRE_HAUT: Entree[] = [
  { to: '/dashboard', icon: Home, label: 'Accueil' },
  { to: '/projects', icon: FolderOpen, label: 'Mes AO' },
  { to: '/company', icon: Briefcase, label: 'Mon entreprise', court: 'Entreprise' },
  { to: '/vault', icon: Archive, label: 'Coffre-fort' },
]
export const ENTREE_PARAMETRES: Entree = { to: '/settings', icon: Settings, label: 'Paramètres' }
export const BARRE: Entree[] = [...BARRE_HAUT, ENTREE_PARAMETRES]

/** Onglets du bas au téléphone (≤ 768 px) : les cinq entrées de la barre du bureau, sous les mêmes noms (jury, tour 1 : le
 *  cinquième s'appelait « Compte » au téléphone et « Paramètres » au bureau). Le compte (la photo) est dans la barre du haut. */
export const ONGLETS_TEL: Entree[] = BARRE

/** Place prévue pour « Cerveau » (bloc 8) : l'onglet s'insère ici quand la page existe. */
export const ONGLET_CERVEAU: (Entree & { disponible: boolean }) | null = null

/** Entrées de la feuille « Mon compte » (téléphone) : les mêmes que le menu du compte du bureau, dans le même ordre. */
export const ENTREES_TIROIR: Entree[] = [ENTREE_PARAMETRES, { to: '/settings/billing', icon: CreditCard, label: 'Abonnement' }]

export { REDIRECTIONS_ENTREPRISE } from '@/lib/entreprise/redirections'

/** Tout ce que la palette Ctrl K propose sous « Aller à » : la barre, plus les accès qui n'y sont pas ou plus. */
export const ACCES_PALETTE: Entree[] = [
  ...BARRE,
  { to: '/team', icon: Users, label: 'Équipe' },
  { to: '/references', icon: Building2, label: 'Mes références' },
  { to: '/outils', icon: Calculator, label: 'Retenue de garantie' },
  { to: '/settings/billing', icon: CreditCard, label: 'Abonnement' },
]

/** Les pages de « Mon entreprise » hors de /company (fiches à télécharger) gardent son entrée active ; « Retenue de garantie »
 *  (/outils) est un outil de Paramètres : l'entrée « Paramètres » reste active (jury, tour 1 : aucune entrée active, on ne
 *  savait pas où on était). */
const SOUS_PAGES: Readonly<Record<string, readonly string[]>> = { '/company': ['/entreprise/'], '/settings': ['/outils'] }
export const estActif = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`) || (SOUS_PAGES[to] ?? []).some((p) => pathname.startsWith(p))
