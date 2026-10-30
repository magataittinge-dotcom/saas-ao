// Synorix Intelligence — les six bulles « ce qui demande votre attention ».
// Calculées depuis ce que le tableau de bord reçoit déjà (/projects et /dashboard/stats) :
// aucun changement côté serveur, aucun appel IA. Libellés positifs, sans conseil de prix.
import { avancementAO, echeanceAO, estEnCours, etatEcheance, type Echeance } from '@/lib/echeance'
import type { DashboardStats, Project } from '@/types'
import { aDecider, classerParUrgence, ficheDepuisProjet, ficheVide, libelleRemise, prochaineAction, type FicheAction } from './action'

export type IdBulle = 'decision' | 'remise' | 'lot' | 'memoire' | 'piece' | 'expirent'

/** Ordre fixe : il correspond aux six points d'accroche du visage (gauche, droite, gauche, droite…). */
export const ORDRE_BULLES: readonly IdBulle[] = ['decision', 'remise', 'lot', 'memoire', 'piece', 'expirent']

export interface Bulle {
  id: IdBulle
  libelle: string
  /** Pastille : « 1 », « J−5 »… */
  compte: string
  nombre: number
  /** `attention` = ambre ; `calme` = bleu. */
  ton: 'calme' | 'attention'
  /** Rien à faire de ce côté : la bulle reste affichée, atténuée. */
  vide: boolean
  /** Phrase lue par les lecteurs d'écran. */
  aria: string
  fiche: FicheAction
}

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un)

const STATS_VIDES: DashboardStats = {
  projects_en_cours: 0, projects_soumis_ce_mois: 0, projects_gagnes: 0, taux_succes: 0, documents_expires: 0, documents_expirant_bientot: 0,
}

/** La fiche d'une bulle « coffre-fort » (le serveur ne donne que des compteurs). */
function ficheCoffre(etiquette: string, titre: string, texte: string, vide: boolean, attention: boolean): FicheAction {
  return {
    etiquette,
    titre,
    meta: 'Coffre-fort',
    statut: vide ? null : { ton: attention ? 'attention' : 'calme', texte: etiquette },
    quand: null,
    texte,
    cta: { libelle: vide ? 'Ouvrir le coffre-fort' : 'Voir le coffre-fort', vers: '/vault' },
    second: null,
  }
}

function ficheVideAO(etiquette: string, titre: string, texte: string): FicheAction {
  return { etiquette, titre, meta: null, statut: null, quand: null, texte, cta: { libelle: 'Voir mes AO', vers: '/projects' }, second: null }
}

/** Les six bulles, dans l'ordre fixe. Les AO clos (soumis, gagné, perdu, sans suite) n'y figurent pas. */
export function calculerBulles(
  projets: readonly Project[],
  stats: DashboardStats | null | undefined,
  maintenant: Date = new Date(),
): Bulle[] {
  const s = stats ?? STATS_VIDES
  const urgence = classerParUrgence(projets, maintenant)
  const enCours = urgence.filter((p) => estEnCours(p.status))
  const echeances = new Map<string, Echeance>(enCours.map((p) => [p.id, etatEcheance(echeanceAO(p), maintenant)]))

  // — Décision à prendre
  const aDecision = enCours.filter(aDecider)
  const decision: Bulle = {
    id: 'decision', libelle: pluriel(aDecision.length, 'Décision à prendre', 'Décisions à prendre'),
    compte: String(aDecision.length), nombre: aDecision.length, ton: 'calme', vide: aDecision.length === 0,
    aria: aDecision.length ? `${aDecision.length} ${pluriel(aDecision.length, 'décision à prendre', 'décisions à prendre')}` : 'Aucune décision à prendre',
    fiche: aDecision.length
      ? ficheDepuisProjet(aDecision[0], maintenant, 'Décision à prendre')
      : ficheVideAO('Décision à prendre', 'Aucune décision en attente', 'Quand une analyse sera terminée, la décision « on y va ? » apparaîtra ici.'),
  }

  // — Remise dans N jours : la plus proche des remises à venir sous 7 jours
  const prochaines = enCours.filter((p) => ['aujourdhui', 'proche'].includes(echeances.get(p.id)!.etat))
  const premiere = prochaines[0]
  const e1 = premiere ? echeances.get(premiere.id)! : null
  const remise: Bulle = {
    id: 'remise',
    libelle: e1 ? libelleRemise(e1) : 'Aucune remise sous 7 jours',
    compte: e1 ? `J−${e1.jours}` : '0',
    nombre: prochaines.length, ton: e1 ? 'attention' : 'calme', vide: !e1,
    aria: e1
      ? `${libelleRemise(e1)} : ${premiere.name}${prochaines.length > 1 ? `, et ${prochaines.length - 1} autre${prochaines.length > 2 ? 's' : ''}` : ''}`
      : 'Aucune remise sous 7 jours',
    fiche: premiere
      ? ficheDepuisProjet(premiere, maintenant, libelleRemise(e1!))
      : ficheVideAO('Remises', 'Aucune remise sous 7 jours', 'Les remises à venir apparaîtront ici dès qu’une date sera à moins d’une semaine.'),
  }

  // — Lot à choisir
  const aLots = enCours.filter((p) => avancementAO(p.current_step).etape === 2)
  const lot: Bulle = {
    id: 'lot', libelle: pluriel(aLots.length, 'Lot à choisir', 'Lots à choisir'),
    compte: String(aLots.length), nombre: aLots.length, ton: 'calme', vide: aLots.length === 0,
    aria: aLots.length ? `${aLots.length} ${pluriel(aLots.length, 'lot à choisir', 'lots à choisir')}` : 'Aucun lot à choisir',
    fiche: aLots.length
      ? { ...ficheDepuisProjet(aLots[0], maintenant, 'Lot à choisir'), meta: [aLots[0].maitre_ouvrage, aLots[0].lots_detectes?.length ? `${aLots[0].lots_detectes.length} lots repérés` : null].filter(Boolean).join(' · ') || null }
      : ficheVideAO('Lot à choisir', 'Aucun lot à choisir', 'Le choix du lot apparaîtra ici après le dépôt d’un dossier de consultation à plusieurs lots.'),
  }

  // — Mémoire à rédiger
  const aMemoire = enCours.filter((p) => avancementAO(p.current_step).etape === 5)
  const memoire: Bulle = {
    id: 'memoire', libelle: pluriel(aMemoire.length, 'Mémoire à rédiger', 'Mémoires à rédiger'),
    compte: String(aMemoire.length), nombre: aMemoire.length, ton: 'calme', vide: aMemoire.length === 0,
    aria: aMemoire.length ? `${aMemoire.length} ${pluriel(aMemoire.length, 'mémoire à rédiger', 'mémoires à rédiger')}` : 'Aucun mémoire à rédiger',
    fiche: aMemoire.length
      ? ficheDepuisProjet(aMemoire[0], maintenant, 'Mémoire à rédiger')
      : ficheVideAO('Mémoire à rédiger', 'Aucun mémoire à rédiger', 'Le mémoire technique se prépare une fois le dossier vérifié.'),
  }

  // — Pièces du coffre-fort (compteurs du serveur)
  const nPiece = Math.max(0, s.documents_expires || 0)
  const piece: Bulle = {
    id: 'piece', libelle: pluriel(nPiece, 'Pièce à renouveler', 'Pièces à renouveler'),
    compte: String(nPiece), nombre: nPiece, ton: nPiece ? 'attention' : 'calme', vide: nPiece === 0,
    aria: nPiece ? `${nPiece} ${pluriel(nPiece, 'pièce à renouveler', 'pièces à renouveler')}` : 'Aucune pièce à renouveler',
    fiche: nPiece
      ? ficheCoffre('Pièce à renouveler', `${nPiece} ${pluriel(nPiece, 'pièce', 'pièces')} du coffre-fort ${pluriel(nPiece, 'est à renouveler', 'sont à renouveler')}`,
        'Déposez la nouvelle version dans le coffre-fort.', false, true)
      : ficheCoffre('Pièce à renouveler', 'Toutes les pièces sont valables', 'Aucune pièce du coffre-fort n’est arrivée à échéance.', true, false),
  }

  const nBientot = Math.max(0, s.documents_expirant_bientot || 0)
  const expirent: Bulle = {
    id: 'expirent', libelle: pluriel(nBientot, 'Expire bientôt', 'Expirent bientôt'),
    compte: String(nBientot), nombre: nBientot, ton: 'calme', vide: nBientot === 0,
    aria: nBientot ? `${nBientot} ${pluriel(nBientot, 'pièce expire bientôt', 'pièces expirent bientôt')}` : 'Aucune pièce n’expire bientôt',
    fiche: nBientot
      ? ficheCoffre('Expirent bientôt', `${nBientot} ${pluriel(nBientot, 'pièce expire bientôt', 'pièces expirent bientôt')}`,
        'Rien d’urgent. Vous pouvez déjà déposer les nouvelles versions dans le coffre-fort.', false, false)
      : ficheCoffre('Expirent bientôt', 'Aucune échéance proche', 'Aucune pièce du coffre-fort n’arrive à échéance prochainement.', true, false),
  }

  return [decision, remise, lot, memoire, piece, expirent]
}

/** La fiche à montrer : celle de la bulle choisie, sinon la prochaine action (ou la fiche vide sans AO en cours). */
export function ficheAffichee(
  choix: string | null,
  bulles: readonly Bulle[],
  projets: readonly Project[],
  maintenant: Date = new Date(),
): FicheAction {
  const choisie = choix ? bulles.find((b) => b.id === choix) : undefined
  if (choisie) return choisie.fiche
  const p = prochaineAction(projets, maintenant)
  return p ? ficheDepuisProjet(p, maintenant) : ficheVide()
}
