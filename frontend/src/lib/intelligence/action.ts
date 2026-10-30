// Synorix Intelligence — « prochaine action » : une règle déterministe, aucun appel IA, aucun avis sur les prix.
// Règle : parmi les AO en cours, celui dont la date de remise est la plus proche (et pas encore passée)
// et dont une étape reste à faire ; sans date, après les AO datés ; date passée, en dernier.
import { avancementAO, echeanceAO, estEnCours, etatEcheance, type Echeance } from '@/lib/echeance'
import type { Project } from '@/types'

/** Les écrans d'un AO, dans l'ordre des six étapes (comme Project.tsx). */
export const ROUTES_ETAPES = ['upload', 'lots', 'analysis', 'verification', 'memoire', 'export'] as const

export const versEtape = (projetId: string, etape: number): string =>
  `/projects/${projetId}/${ROUTES_ETAPES[Math.min(Math.max(Math.round(etape) || 1, 1), 6) - 1]}`

export type TonFiche = 'attention' | 'calme'

export interface LienAction { libelle: string; vers: string }

export interface FicheAction {
  /** Ce que la fiche présente : « Prochaine action » ou le libellé de la bulle choisie. */
  etiquette: string
  titre: string
  meta: string | null
  statut: { ton: TonFiche; texte: string } | null
  quand: string | null
  texte: string
  cta: LienAction | null
  second: LienAction | null
}

/** Vrai si l'AO attend seulement la fin d'un traitement (rien à faire pour l'utilisateur). */
export const enAttente = (p: Pick<Project, 'processing_status'>): boolean => p.processing_status === 'processing'

/** La décision « on y va ? » : l'analyse est faite, la vérification n'est pas commencée. */
export const aDecider = (p: Pick<Project, 'status' | 'current_step'>): boolean => p.status === 'analyzed' && p.current_step < 4

/** Libellé court de ce qui reste à faire sur un AO (même vocabulaire que le tableau de bord). */
export function verbeEtape(p: Pick<Project, 'status' | 'current_step' | 'processing_status'>): string {
  if (aDecider(p)) return 'Décider : on y va ?'
  switch (avancementAO(p.current_step).etape) {
    case 1: return 'Déposer le DCE'
    case 2: return 'Choisir le lot'
    case 3: return enAttente(p) ? 'Analyse en cours' : "Lancer l'analyse"
    case 4: return 'Vérifier le dossier'
    case 5: return 'Rédiger le mémoire'
    default: return 'Exporter le dossier'
  }
}

/** L'écran où se fait cette étape. */
export function lienEtape(p: Pick<Project, 'id' | 'status' | 'current_step'>): string {
  return aDecider(p) ? versEtape(p.id, 3) : versEtape(p.id, p.current_step)
}

const TEXTES: Record<number, string> = {
  1: 'Déposez le dossier de consultation (ZIP ou PDF) : Synorix lit les pièces et repère les lots.',
  2: 'Synorix a repéré les lots du dossier de consultation. Choisissez le vôtre pour passer à l’analyse.',
  3: 'Le dossier est lu. Lancez l’analyse : chaque exigence sera relevée avec sa source.',
  4: 'Passez en revue les exigences et les pièces de candidature, chacune avec sa source dans le dossier.',
  5: 'Tout est prêt pour la rédaction. Synorix écrit le mémoire technique à partir de votre entreprise et du dossier de consultation.',
  6: 'Toutes les étapes sont faites. Il reste à exporter le dossier, puis à le déposer sur la plateforme de l’acheteur.',
}

function texteEtape(p: Pick<Project, 'status' | 'current_step' | 'processing_status'>): string {
  if (aDecider(p)) return 'L’analyse est terminée. La fiche « On y va ? » rassemble les conditions du marché, chacune avec sa source. La décision vous revient.'
  if (enAttente(p)) return 'L’analyse est en cours. Cet écran se met à jour dès qu’elle est terminée.'
  return TEXTES[avancementAO(p.current_step).etape]
}

const jourLong = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const heureCourte = (d: Date) => (d.getMinutes() ? `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}` : `${d.getHours()} h`)

/** « Remise dans 5 jours », « Remise aujourd'hui », « Date de remise passée », « Date de remise à préciser ». */
export function libelleRemise(e: Echeance): string {
  switch (e.etat) {
    case 'sans_date': return 'Date de remise à préciser'
    case 'passee': return 'Date de remise passée'
    case 'aujourdhui': return 'Remise aujourd’hui'
    default: return `Remise dans ${e.jours} jour${(e.jours ?? 0) > 1 ? 's' : ''}`
  }
}

/** « Mercredi 28 octobre, 12 h » ; null sans date. */
export function quandRemise(p: Project, e: Echeance = etatEcheance(echeanceAO(p))): string | null {
  if (!e.limite) return null
  const base = jourLong(e.limite).replace(/^\w/, (c) => c.toUpperCase())
  return echeanceAO(p)?.heure ? `${base}, ${heureCourte(e.limite)}` : base
}

const complement = (p: Project): string | null =>
  [p.maitre_ouvrage, p.selected_lot_name].filter(Boolean).join(' · ') || null

/** La fiche d'un AO : son état de remise, ce qu'il reste à faire, le lien vers l'écran concerné. */
export function ficheDepuisProjet(p: Project, maintenant: Date = new Date(), etiquette = 'Prochaine action'): FicheAction {
  const e = etatEcheance(echeanceAO(p), maintenant)
  const proche = e.etat === 'proche' || e.etat === 'aujourdhui'
  return {
    etiquette,
    titre: p.name,
    meta: complement(p),
    statut: { ton: proche ? 'attention' : 'calme', texte: libelleRemise(e) },
    quand: quandRemise(p, e),
    texte: texteEtape(p),
    cta: { libelle: verbeEtape(p), vers: lienEtape(p) },
    second: { libelle: 'Ouvrir l’AO', vers: `/projects/${p.id}` },
  }
}

const RANG: Record<Echeance['etat'], number> = { aujourdhui: 0, proche: 0, a_venir: 0, sans_date: 1, passee: 2 }

/**
 * Classe les AO en cours : remise la plus proche d'abord ; ceux qui attendent seulement un
 * traitement automatique après ceux où l'utilisateur peut agir ; sans date, puis date passée, ensuite.
 * Départage stable : nom, puis identifiant.
 */
export function classerParUrgence(projets: readonly Project[], maintenant: Date = new Date()): Project[] {
  const lignes = projets.filter((p) => estEnCours(p.status)).map((p) => ({ p, e: etatEcheance(echeanceAO(p), maintenant) }))
  lignes.sort((a, b) =>
    Number(enAttente(a.p)) - Number(enAttente(b.p))
    || RANG[a.e.etat] - RANG[b.e.etat]
    || (a.e.limite?.getTime() ?? 0) - (b.e.limite?.getTime() ?? 0)
    || a.p.name.localeCompare(b.p.name, 'fr')
    || a.p.id.localeCompare(b.p.id))
  return lignes.map((l) => l.p)
}

/** L'AO dont l'action est la plus pressée, ou null s'il n'y a aucun AO en cours. */
export function prochaineAction(projets: readonly Project[], maintenant: Date = new Date()): Project | null {
  return classerParUrgence(projets, maintenant)[0] ?? null
}

/** Fiche affichée quand aucun AO n'est en cours : on propose le premier geste. */
export function ficheVide(): FicheAction {
  return {
    etiquette: 'Prochaine action',
    titre: 'Aucun appel d’offres en cours',
    meta: null,
    statut: null,
    quand: null,
    texte: 'Déposez le dossier de consultation (ZIP ou PDF) : Synorix lit les pièces, repère les lots et prépare l’analyse.',
    cta: { libelle: 'Nouvel AO', vers: '/projects/new' },
    second: null,
  }
}
