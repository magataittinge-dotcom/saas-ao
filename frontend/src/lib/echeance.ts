// Une seule vérité pour l'échéance, l'avancement et « en cours » (1.14) :
// tous les écrans passent par ces fonctions. Le calcul se fait à la minute
// près, heure limite comprise, à l'heure de Paris (Q-08, lib/remiseParis.ts),
// quel que soit le fuseau de l'ordinateur.
// Avant : differenceInDays (tronque) ici, Math.ceil sur minuit UTC ailleurs —
// jusqu'à 48 h après la date limite, un écran pouvait dire « Aujourd'hui »
// ou « À déposer ».

import { heureLimiteParis, joursParis, momentLimiteParis } from './remiseParis'

export type EtatEcheance = 'sans_date' | 'a_venir' | 'proche' | 'aujourdhui' | 'passee'

export interface EcheanceSource {
  /** AAAA-MM-JJ (ou ISO). */
  date: string
  /** « 14h00 », « 14h », « 14:00 »… ; absente = fin de journée. */
  heure?: string | null
}

export interface Echeance {
  etat: EtatEcheance
  /** Jours calendaires jusqu'au jour limite (0 = aujourd'hui, négatif = passé). */
  jours: number | null
  libelle: string
  limite: Date | null
}

export const JOURS_PROCHE = 7

/** Moment limite à l'heure de Paris ; sans heure : 23:59:59 le jour dit (Q-08). */
export function momentLimite(source: EcheanceSource | null | undefined): Date | null {
  return momentLimiteParis(source)
}

export function etatEcheance(source: EcheanceSource | null | undefined, maintenant: Date = new Date()): Echeance {
  const limite = momentLimite(source)
  if (!limite) return { etat: 'sans_date', jours: null, libelle: '—', limite: null }
  // jours du calendrier de Paris : le changement d'heure (23 h ou 25 h entre deux minuits) n'y change rien
  const jours = joursParis(limite, maintenant)
  if (maintenant.getTime() > limite.getTime()) {
    return { etat: 'passee', jours, libelle: 'Date de remise passée', limite }
  }
  if (jours === 0) {
    return { etat: 'aujourdhui', jours, libelle: source?.heure ? `Aujourd’hui, ${heureLimiteParis(limite)}` : "Aujourd’hui", limite }
  }
  return { etat: jours <= JOURS_PROCHE ? 'proche' : 'a_venir', jours, libelle: `J−${jours}`, limite }
}

interface ProjetEcheance {
  deadline?: string | null
  echeance?: EcheanceSource | null
  infos_marche?: { date_limite_reponse?: string | null } | null
}

/** L'échéance d'un AO : celle que le serveur consolide (date saisie ou RC, avec l'heure du RC). */
export function echeanceAO(p: ProjetEcheance): EcheanceSource | null {
  if (p.echeance?.date) return p.echeance
  if (p.deadline) return { date: p.deadline }
  const rc = p.infos_marche?.date_limite_reponse
  return rc ? { date: rc } : null
}

// ── Statuts « ouverts » du serveur. L'ÉTAT d'un AO (« en cours », « à mettre à jour », « terminé ») est dans lib/etatAO.ts :
//    c'est lui que les écrans appellent. `estEnCours` et `estEnCoursOuvert` ne s'importent plus ailleurs (garde-fou). ──
export const STATUTS_EN_COURS: readonly string[] = ['brouillon', 'en_cours', 'analyzed']
export const estEnCours = (statut: string) => STATUTS_EN_COURS.includes(statut)
/**
 * « Vos AO en cours » de l'accueil : en cours ET dont la remise n'est pas passée. Un AO dont la date est dépassée sort de
 * l'accueil (bande et compteur) ; il reste dans Mes AO.
 */
export const estEnCoursOuvert = (p: ProjetEcheance & { status: string }): boolean =>
  estEnCours(p.status) && etatEcheance(echeanceAO(p)).etat !== 'passee'

// ── Avancement : en étapes, la même mesure partout ──
export const ETAPES_AO = ['Dépôt du dossier', 'Lots', 'Décider', 'Pièces', 'Mémoire', 'Export'] as const

export function avancementAO(etapeCourante: number) {
  const etape = Math.min(Math.max(Math.round(etapeCourante) || 1, 1), ETAPES_AO.length)
  return {
    etape,
    total: ETAPES_AO.length,
    nom: ETAPES_AO[etape - 1],
    /** Part des étapes atteintes, pour remplir une jauge (1/6 → 6/6). */
    ratio: etape / ETAPES_AO.length,
    libelle: `Étape ${etape} sur ${ETAPES_AO.length} · ${ETAPES_AO[etape - 1]}`,
  }
}

/** Libellé de la pastille de « Mes AO » : elle compte les AO en cours dont la remise tombe aujourd'hui ou sous 7 jours (R2). */
export function libelleUrgents(n: number): string {
  return `${n} AO en cours à remettre sous 7 jours`
}
