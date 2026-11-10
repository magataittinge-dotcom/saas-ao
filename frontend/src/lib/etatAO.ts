// L'ÉTAT D'UN APPEL D'OFFRES — la seule source, pour tous les écrans (défauts 1 et 2 du fondateur, A5).
//
// Avant : l'Accueil disait « Aucun appel d'offres en cours » au-dessus de trois AO « en cours », Mes AO comptait « en cours »
// un AO dont la remise était passée depuis sept mois et lui proposait « Exporter le dossier », et la phrase « Toutes les
// étapes sont faites » voisinait avec « 0 sur 15 prête ». Chaque écran avait sa définition.
//
// Règles du fondateur :
//   - trois états : « en cours », « à mettre à jour », « terminé » ;
//   - une remise passée sans statut mis à jour = « À mettre à jour », et sa SEULE action est « Mettre à jour le statut »
//     (jamais « Télécharger », jamais « Exporter ») ;
//   - « À la une » = la prochaine remise à venir ; aucune à venir : pas de bloc ;
//   - la phrase et les faits viennent de la même source ; les accords suivent le nombre ;
//   - un seul vocabulaire : étape Pièces = « Réunir les pièces », étape Export = « Télécharger le dossier ».
//
// Tout est déterministe (aucune IA) et lit GET /projects. `estEnCours` et `estEnCoursOuvert` (lib/echeance.ts) ne s'importent
// plus ailleurs qu'ici : garde-fou « etat-ao-hors-module ».
import { echeanceAO, etatEcheance, JOURS_PROCHE, STATUTS_EN_COURS, type Echeance } from '@/lib/echeance'
import { actionEtape, texteEtape } from '@/lib/intelligence/action'
import type { AvancementAO, Project, ProjectStatus } from '@/types'

export type EtatAO = 'en_cours' | 'a_mettre_a_jour' | 'termine'
/** Le sens (couleur d'état) qui accompagne le mot : jamais la couleur seule. */
export type SensAO = 'bleu' | 'vert' | 'ambre' | 'rouge' | 'gris'

type ProjetEtat = Pick<Project, 'status' | 'deadline' | 'echeance' | 'infos_marche'>
type ProjetLu = ProjetEtat & Pick<Project, 'current_step' | 'processing_status' | 'completed_steps'> & Partial<Pick<Project, 'id' | 'name' | 'lots_detectes' | 'avancement'>>

/** L'état d'un AO. Le statut tenu par le serveur est « ouvert » (brouillon, en cours, analysé) ou « fermé » (déposé, gagné,
 *  perdu, sans suite) ; un AO ouvert dont la remise est passée attend que l'utilisateur dise ce qu'il en est. */
export function etatAO(p: ProjetEtat, maintenant: Date = new Date()): EtatAO {
  if (!STATUTS_EN_COURS.includes(p.status)) return 'termine'
  return etatEcheance(echeanceAO(p), maintenant).etat === 'passee' ? 'a_mettre_a_jour' : 'en_cours'
}

export interface ActionAO {
  /** Le verbe du bouton. */
  verbe: string
  /** L'écran de l'AO où l'action se fait (« verification », « export »…) ; null quand l'action ouvre le dialogue de statut. */
  segment: string | null
  /** L'action ouvre « Mettre à jour le statut » (components/common/MettreAJourStatut.tsx). */
  statut: boolean
}

export interface LectureAO {
  etat: EtatAO
  /** « En cours », « À mettre à jour », « Déposé », « Gagné », « Perdu », « Sans suite ». */
  libelle: string
  sens: SensAO
  action: ActionAO
  /** Une phrase qui dit où en est l'AO, tirée des mêmes faits que les chiffres affichés à côté. */
  phrase: string
  echeance: Echeance
}

const FERMES: Record<string, { libelle: string; sens: SensAO; phrase: string }> = {
  soumis: { libelle: 'Déposé', sens: 'bleu', phrase: 'Le dossier est déposé. Indiquez le résultat quand l’acheteur l’annonce.' },
  gagné: { libelle: 'Gagné', sens: 'vert', phrase: 'Ce marché est gagné.' },
  perdu: { libelle: 'Perdu', sens: 'rouge', phrase: 'Ce marché n’a pas été attribué à votre entreprise.' },
  sans_suite: { libelle: 'Sans suite', sens: 'gris', phrase: 'Vous n’avez pas répondu à cet appel d’offres.' },
}

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un)

/** Ce qu'il reste à joindre, d'après le serveur ; null quand il ne le sait pas. */
const piecesAJoindre = (a: AvancementAO | null | undefined): number | null =>
  a?.pieces && a.pieces.total > 0 ? Math.max(0, a.pieces.total - a.pieces.pretes) : null

/** La phrase de l'étape « Télécharger le dossier » : elle dit s'il reste des pièces à joindre (même source que le fait « Pièces »). */
function phraseExport(p: ProjetLu): string {
  const reste = piecesAJoindre(p.avancement)
  if (reste && reste > 0) return `Le mémoire est écrit. ${reste} ${pluriel(reste, 'pièce reste', 'pièces restent')} à joindre avant de télécharger le dossier.`
  return 'Le dossier est prêt : il reste à le télécharger, puis à le déposer sur la plateforme de l’acheteur.'
}

/** Tout ce qu'un écran affiche d'un AO : son état, son mot, son action, sa phrase. UN seul calcul. */
export function lectureAO(p: ProjetLu, maintenant: Date = new Date()): LectureAO {
  const echeance = etatEcheance(echeanceAO(p), maintenant)
  const etat = etatAO(p, maintenant)
  if (etat === 'termine') {
    const f = FERMES[p.status] ?? FERMES.sans_suite
    const action: ActionAO = p.status === 'soumis'
      ? { verbe: 'Indiquer le résultat', segment: null, statut: true }
      : { verbe: 'Ouvrir', segment: '', statut: false }
    return { etat, libelle: f.libelle, sens: f.sens, action, phrase: f.phrase, echeance }
  }
  if (etat === 'a_mettre_a_jour') {
    return {
      etat, libelle: 'À mettre à jour', sens: 'ambre', echeance,
      action: { verbe: 'Mettre à jour le statut', segment: null, statut: true },
      phrase: 'La date de remise est passée. Dites si le dossier a été déposé.',
    }
  }
  const a = actionEtape(p)
  return {
    etat, libelle: 'En cours', sens: 'bleu', echeance,
    action: { verbe: a.verbe, segment: a.segment, statut: false },
    phrase: a.segment === 'export' ? phraseExport(p) : texteEtape(p),
  }
}

/** L'adresse de l'action d'un AO ; la page de l'AO quand l'action est le dialogue de statut. */
export function lienAO(p: ProjetLu & Pick<Project, 'id'>, maintenant: Date = new Date()): string {
  const { action } = lectureAO(p, maintenant)
  return action.segment ? `/projects/${p.id}/${action.segment}` : `/projects/${p.id}`
}

export interface FaitAO { libelle: string; valeur: string; sens: SensAO }

/** Le fait « Pièces », accordé : « 1 sur 15 prête », « 3 sur 15 prêtes », « 15 à joindre » (jamais « 0 sur 15 prête »). */
export function faitPieces(pieces: AvancementAO['pieces'] | null | undefined): FaitAO | null {
  if (!pieces || pieces.total <= 0) return null
  const { total, pretes } = pieces
  if (pretes <= 0) return { libelle: 'Pièces', valeur: `${total} à joindre`, sens: 'ambre' }
  return { libelle: 'Pièces', valeur: `${pretes} sur ${total} ${pluriel(pretes, 'prête', 'prêtes')}`, sens: pretes >= total ? 'vert' : 'ambre' }
}

export interface ComptesAO {
  total: number
  enCours: number
  aMettreAJour: number
  termines: number
  /** Parmi les AO en cours, ceux dont la remise tombe aujourd'hui ou sous 7 jours. */
  remises7: number
  /** Parmi les terminés, ceux qui sont déposés et attendent leur résultat. */
  enAttenteDeResultat: number
}

/** Les comptes d'une liste d'AO : les mêmes sur l'Accueil, sur Mes AO, dans la barre et dans Ctrl K. */
export function comptesAO(projets: readonly ProjetEtat[], maintenant: Date = new Date()): ComptesAO {
  const c: ComptesAO = { total: projets.length, enCours: 0, aMettreAJour: 0, termines: 0, remises7: 0, enAttenteDeResultat: 0 }
  for (const p of projets) {
    const etat = etatAO(p, maintenant)
    if (etat === 'termine') { c.termines += 1; if (p.status === 'soumis') c.enAttenteDeResultat += 1; continue }
    if (etat === 'a_mettre_a_jour') { c.aMettreAJour += 1; continue }
    c.enCours += 1
    const e = etatEcheance(echeanceAO(p), maintenant)
    if (e.etat === 'aujourdhui' || (e.etat === 'proche' && (e.jours ?? 99) <= JOURS_PROCHE)) c.remises7 += 1
  }
  return c
}

/** Les AO d'un état, dans l'ordre reçu. */
export const aoDansEtat = <P extends ProjetEtat>(projets: readonly P[], etat: EtatAO, maintenant: Date = new Date()): P[] =>
  projets.filter((p) => etatAO(p, maintenant) === etat)

/** « À la une » : l'AO en cours dont la remise est la prochaine à venir. Aucune remise à venir : null (pas de bloc). */
export function aLaUne<P extends ProjetEtat>(projets: readonly P[], maintenant: Date = new Date()): P | null {
  let meilleur: { p: P; t: number } | null = null
  for (const p of projets) {
    if (etatAO(p, maintenant) !== 'en_cours') continue
    const limite = etatEcheance(echeanceAO(p), maintenant).limite
    if (!limite) continue
    if (!meilleur || limite.getTime() < meilleur.t) meilleur = { p, t: limite.getTime() }
  }
  return meilleur?.p ?? null
}

// ── « Mettre à jour le statut » ──────────────────────────────────────────────────────────────────────────────────────
/** Les changements de statut que le dialogue propose : un sous-ensemble de ce que le serveur accepte
 *  (backend/routers/projects.py, _STATUS_TRANSITIONS ; un test compare les deux). */
export const STATUTS_SERVEUR: Readonly<Record<string, readonly ProjectStatus[]>> = {
  brouillon: ['soumis', 'sans_suite'],
  en_cours: ['soumis', 'sans_suite'],
  analyzed: ['soumis', 'sans_suite'],
  soumis: ['gagné', 'perdu', 'en_cours'],
  sans_suite: ['en_cours'],
  gagné: [],
  perdu: [],
}

export interface ChoixStatut { statut: ProjectStatus; libelle: string; aide?: string }

const CHOIX: Record<string, ChoixStatut> = {
  soumis: { statut: 'soumis', libelle: 'Je l’ai déposé', aide: 'L’appel d’offres passe dans les terminés, en attente du résultat.' },
  sans_suite: { statut: 'sans_suite', libelle: 'Je n’ai pas répondu', aide: 'L’appel d’offres est classé sans suite.' },
  gagné: { statut: 'gagné', libelle: 'Gagné' },
  perdu: { statut: 'perdu', libelle: 'Perdu' },
}

/** Les choix du dialogue, selon le statut de l'AO. « Je l'ai déposé » et « Je n'ai pas répondu » se défont ; « Gagné » et
 *  « Perdu » sont définitifs (le serveur n'accepte aucun retour) : le dialogue le dit avant de confirmer. */
export function choixStatut(statut: ProjectStatus): ChoixStatut[] {
  if (statut === 'soumis') return [CHOIX.gagné, CHOIX.perdu, { statut: 'en_cours', libelle: 'Je ne l’ai finalement pas déposé', aide: 'L’appel d’offres revient parmi ceux à suivre.' }]
  if (statut === 'sans_suite') return [{ statut: 'en_cours', libelle: 'Reprendre cet appel d’offres', aide: 'Il revient parmi ceux à suivre.' }]
  if (STATUTS_EN_COURS.includes(statut)) return [CHOIX.soumis, CHOIX.sans_suite]
  return []
}

/** Un choix définitif : le dialogue prévient avant d'enregistrer. */
export const choixDefinitif = (statut: ProjectStatus): boolean => statut === 'gagné' || statut === 'perdu'
