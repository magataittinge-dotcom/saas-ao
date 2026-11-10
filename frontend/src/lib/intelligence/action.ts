// Synorix Intelligence — « prochaine action » : une règle déterministe, aucun appel IA, aucun avis sur les prix.
// Règle : parmi les AO en cours, celui dont la date de remise est la plus proche (et pas encore passée)
// et dont une étape reste à faire ; sans date, après les AO datés ; date passée, en dernier.
import { avancementAO, echeanceAO, etatEcheance, type Echeance } from '@/lib/echeance'
import { etatAO } from '@/lib/etatAO'
import { lotUniqueDuDossier } from '@/lib/lotUnique'
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

/**
 * Le mémoire existe : le serveur marque l'étape 5 faite à la fin de la rédaction (routers/memoire.py).
 * Les étapes d'affichage « Plan » et « Rédiger » se rangent toutes deux derrière l'étape 5 du serveur.
 */
export const aMemoire = (p: Pick<Project, 'completed_steps'>): boolean => p.completed_steps?.['5'] === true
const enRedaction = (p: Pick<Project, 'processing_status'>): boolean => p.processing_status === 'generating'

type EtatEtape = Pick<Project, 'status' | 'current_step' | 'processing_status' | 'completed_steps'> & Partial<Pick<Project, 'name' | 'lots_detectes'>>

/**
 * Prochaine action d'un AO EN COURS : le verbe, l'écran. Les écrans passent par `lectureAO` (lib/etatAO.ts), qui sait aussi qu'une
 * remise passée n'a qu'une action, « Mettre à jour le statut ». Un seul vocabulaire (A5) : étape Pièces = « Réunir les pièces »,
 * étape Export = « Télécharger le dossier ». UN seul calcul (sans IA) pour l'accueil, Mes AO, la bande « Vos AO en cours »,
 * la palette Ctrl K et la fiche du Compagnon. À l'étape 5 du serveur : pas de mémoire → « Préparer le plan du mémoire » (écran
 * Plan) ; rédaction en cours ou mémoire écrit → l'écran Rédiger.
 */
export function actionEtape(p: EtatEtape): { verbe: string; segment: string } {
  if (aDecider(p)) return { verbe: 'Décider : on y va ?', segment: ROUTES_ETAPES[2] }
  const etape = avancementAO(p.current_step).etape
  switch (etape) {
    case 1: return { verbe: "Déposer le dossier de l’acheteur", segment: ROUTES_ETAPES[0] }
    case 2:
      // Un seul lot (ou un marché unique) : rien à choisir, la lecture se lance depuis l'écran de dépôt, au clic.
      if (lotUniqueDuDossier(p)) return { verbe: 'Analyser le dossier', segment: ROUTES_ETAPES[0] }
      return { verbe: 'Choisir le lot', segment: ROUTES_ETAPES[1] }
    case 3: return { verbe: enAttente(p) ? 'Analyse en cours' : 'Analyser le dossier', segment: ROUTES_ETAPES[2] }
    case 4: return { verbe: 'Réunir les pièces', segment: ROUTES_ETAPES[3] }
    case 5:
      if (enRedaction(p)) return { verbe: 'Rédaction du mémoire en cours', segment: 'memoire' }
      if (aMemoire(p)) return { verbe: 'Relire le mémoire', segment: 'memoire' }
      return { verbe: 'Préparer le plan du mémoire', segment: 'plan' }
    default: return { verbe: 'Télécharger le dossier', segment: ROUTES_ETAPES[5] }
  }
}

/** Libellé court de ce qui reste à faire sur un AO (même vocabulaire partout). */
export const verbeEtape = (p: EtatEtape): string => actionEtape(p).verbe

/** L'écran où se fait cette étape. */
export const lienEtape = (p: EtatEtape & Pick<Project, 'id'>): string => `/projects/${p.id}/${actionEtape(p).segment}`

const TEXTES: Record<number, string> = {
  1: 'Déposez le dossier de consultation (ZIP ou PDF) : Synorix lit les pièces et repère les lots.',
  2: 'Synorix a repéré les lots du dossier de consultation. Choisissez le vôtre pour passer à l’analyse.',
  3: 'Les lots sont choisis. Lancez l’analyse du dossier : chaque exigence sera relevée avec sa source.',
  4: 'Passez en revue les exigences et les pièces de candidature, chacune avec sa source dans le dossier.',
  5: 'Le dossier est analysé. Choisissez ses parties, puis Synorix le rédige à partir de votre entreprise et du dossier de consultation.',
  6: 'Le dossier est prêt : il reste à le télécharger, puis à le déposer sur la plateforme de l’acheteur.',
}

/** La phrase d'une étape. Pour l'étape « Télécharger le dossier », `lectureAO` la complète avec les pièces restant à joindre. */
export function texteEtape(p: EtatEtape): string {
  if (aDecider(p)) return 'L’analyse est terminée. La fiche « On y va ? » rassemble les conditions du marché, chacune avec sa source. La décision vous revient.'
  if (enAttente(p)) return 'L’analyse est en cours. Cet écran se met à jour dès qu’elle est terminée.'
  if (avancementAO(p.current_step).etape === 5) {
    if (enRedaction(p)) return 'Le mémoire est en cours de rédaction. Cet écran se met à jour dès qu’il est prêt.'
    if (aMemoire(p)) return 'Le mémoire est rédigé. Relisez-le, retouchez ce qui doit l’être, puis passez à l’export.'
  }
  if (avancementAO(p.current_step).etape === 2 && lotUniqueDuDossier(p)) return 'Le dossier n’a qu’un lot. Lancez l’analyse depuis l’écran de dépôt : chaque exigence sera relevée avec sa source.'
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
 * Classe les AO en cours (lib/etatAO.ts : une remise passée n'est plus « en cours ») : remise la plus proche d'abord ; ceux qui
 * attendent seulement un traitement automatique après ceux où l'utilisateur peut agir ; sans date ensuite.
 * Départage stable : nom, puis identifiant.
 */
export function classerParUrgence(projets: readonly Project[], maintenant: Date = new Date()): Project[] {
  const lignes = projets.filter((p) => etatAO(p, maintenant) === 'en_cours').map((p) => ({ p, e: etatEcheance(echeanceAO(p), maintenant) }))
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
    texte: 'Déposez le dossier de consultation (ZIP ou PDF) : Synorix lit les pièces, repère les lots et prépare la décision.',
    cta: { libelle: 'Nouvel AO', vers: '/projects/new' },
    second: null,
  }
}
