// Mes AO — la logique de l'écran, sans JSX : le fil réel à 7 étapes, le tri par remise, les comptes du résumé.
// Tout est déterministe (aucune IA) et lit les données de GET /projects. Les verbes viennent de `actionEtape()` (un seul calcul).
import { echeanceAO, etatEcheance, momentLimite, type Echeance } from '@/lib/echeance'
import { etatAO, faitPieces, type EtatAO } from '@/lib/etatAO'
import { jourCourtParis } from '@/lib/dateParis'
import { heureCourteParis, momentParis } from '@/lib/remiseParis'
import { aDecider, aMemoire } from '@/lib/intelligence/action'
import type { AvancementAO, Project } from '@/types'

/** Les étapes d'un AO, dans l'ordre du fil affiché (identique à `STEPS` de components/project/StepProgress.tsx). */
export const FIL_ETAPES = ['Dépôt', 'Lots', 'Décider', 'Pièces', 'Plan', 'Rédiger', 'Export'] as const

type EtatAvancement = Pick<Project, 'current_step' | 'processing_status' | 'completed_steps'>

/**
 * Numéro de l'étape affichée (1 à 7) depuis l'étape tenue par le serveur (1 à 6) : « Plan » et « Rédiger » se rangent toutes deux
 * derrière l'étape 5 du serveur — « Rédiger » dès que la rédaction a commencé ou que le mémoire existe —, « Export » derrière la 6.
 */
export function etapeAffichee(p: EtatAvancement): number {
  const serveur = Math.min(Math.max(Math.round(p.current_step) || 1, 1), 6)
  if (serveur < 5) return serveur
  if (serveur === 6) return 7
  return p.processing_status === 'generating' || aMemoire(p) ? 6 : 5
}

/** « Étape 5 sur 7 · Plan » : la mesure du fil réel (le fil des étapes de l'AO en compte 7, pas 6). */
export function avancementAffiche(p: EtatAvancement) {
  const etape = etapeAffichee(p)
  return { etape, total: FIL_ETAPES.length, nom: FIL_ETAPES[etape - 1], libelle: `Étape ${etape} sur ${FIL_ETAPES.length} · ${FIL_ETAPES[etape - 1]}` }
}

export type EtatPoint = 'fait' | 'cours' | 'avenir'

/** Le fil d'un AO : les 7 étapes, chacune faite, en cours ou à venir. */
export function filDeLAO(p: EtatAvancement): { nom: string; etat: EtatPoint }[] {
  const etape = etapeAffichee(p)
  return FIL_ETAPES.map((nom, i) => ({ nom, etat: i + 1 < etape ? 'fait' : i + 1 === etape ? 'cours' : 'avenir' }))
}

const RANG: Record<Echeance['etat'], number> = { aujourdhui: 0, proche: 0, a_venir: 0, sans_date: 1, passee: 2 }
const RANG_ETAT: Record<EtatAO, number> = { en_cours: 0, a_mettre_a_jour: 1, termine: 2 }

/**
 * Tri « Remise la plus proche » : les AO en cours d'abord (remise la plus proche, puis sans date), puis ceux à mettre à jour
 * (remise passée), les AO terminés ensuite — leurs dates passées ne les placent plus en tête. Départage stable : nom, puis identifiant.
 */
export function comparerParRemise(a: Project, b: Project, maintenant: Date = new Date()): number {
  const ea = etatEcheance(echeanceAO(a), maintenant)
  const eb = etatEcheance(echeanceAO(b), maintenant)
  return RANG_ETAT[etatAO(a, maintenant)] - RANG_ETAT[etatAO(b, maintenant)]
    || RANG[ea.etat] - RANG[eb.etat]
    || (ea.limite?.getTime() ?? 0) - (eb.limite?.getTime() ?? 0)
    // l'ordre naturel des nombres : « n° 21 » avant « n° 197 » (jury, tour 1)
    || a.name.localeCompare(b.name, 'fr', { numeric: true })
    || a.id.localeCompare(b.id)
}

// ── Mes AO : niveau de la remise, résumé, terminés, unités, faits de « À la une » ──
const JOURS_ROUGE = 3

export type Niveau = 'rouge' | 'ambre' | 'neutre'

/** COULEURS.md : rouge à 3 jours ou moins (ou date dépassée), ambre de 4 à 7 jours, sinon neutre. Les mots restent à côté. */
export function niveauRemise(p: Project, maintenant: Date = new Date()): Niveau {
  const e = etatEcheance(echeanceAO(p), maintenant)
  if (e.etat === 'passee' || e.etat === 'aujourdhui') return 'rouge'
  if (e.etat === 'proche') return (e.jours ?? 99) <= JOURS_ROUGE ? 'rouge' : 'ambre'
  return 'neutre'
}

/** Le traitement de fond est en route (lecture, extraction, détection des lots, rédaction) : rien à faire, la jauge parle. */
const TRAITEMENTS = ['processing', 'analyzing', 'extracting_text', 'extracting_zip', 'detecting_lots', 'generating']
export const enTraitement = (p: Pick<Project, 'processing_status'>): boolean => TRAITEMENTS.includes(p.processing_status ?? '')

// Écrits à la main : les abréviations d'Intl varient d'un moteur à l'autre (« nov » ou « nov. »).
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const heure = heureCourteParis
/** « 28 oct. » */
/** « 6 nov. » : le jour à Paris (Q-08). */
export const jourCourt = (d: Date): string => { const m = momentParis(d); return `${m.jour} ${MOIS_COURTS[m.mois - 1]}` }
const jourMois = (iso: string) => jourCourtParis(iso)

/** « ven. 6 nov., 12 h » ; sans heure connue, le jour seul ; null sans date. Espaces insécables : la date ne se coupe jamais
 *  (jury, tour 3 : « jeu. 3 déc., 14 » puis « h » seul à la ligne). */
export function quandCourt(p: Project): string | null {
  const source = echeanceAO(p)
  const limite = momentLimite(source)
  if (!limite) return null
  const m = momentParis(limite)
  const jour = `${JOURS_COURTS[new Date(Date.UTC(m.an, m.mois - 1, m.jour)).getUTCDay()]} ${m.jour} ${MOIS_COURTS[m.mois - 1]}`
  return (source?.heure ? `${jour}, ${heure(limite)}` : jour).replace(/ /g, '\u00a0')
}

export interface ResumeMesAO {
  enCours: number
  /** Parmi les AO en cours, ceux dont le dossier est en lecture ou en rédaction. */
  enLecture: number
  remise7: { n: number; niveau: Niveau; ids: string[]; dates: string[] }
  aDecider: { n: number; premier: Project | null }
}

/** Les trois cartes de comptes : en cours, remise sous 7 jours, à décider. Les listes d'AO sont triées par remise. */
export function resumeMesAO(projets: readonly Project[], maintenant: Date = new Date()): ResumeMesAO {
  const enCours = projets.filter((p) => etatAO(p, maintenant) === 'en_cours').sort((a, b) => comparerParRemise(a, b, maintenant))
  const sous7 = enCours.filter((p) => { const e = etatEcheance(echeanceAO(p), maintenant).etat; return e === 'proche' || e === 'aujourdhui' })
  const niveaux = sous7.map((p) => niveauRemise(p, maintenant))
  const decider = enCours.filter((p) => aDecider(p))
  return {
    enCours: enCours.length,
    enLecture: enCours.filter(enTraitement).length,
    remise7: {
      n: sous7.length,
      niveau: niveaux.includes('rouge') ? 'rouge' : niveaux.includes('ambre') ? 'ambre' : 'neutre',
      ids: sous7.map((p) => p.id),
      dates: sous7.map((p) => (quandCourt(p) ?? '').replace(/,.*$/, '')).filter(Boolean),
    },
    aDecider: { n: decider.length, premier: decider[0] ?? null },
  }
}

export const STATUTS_TERMINES = ['soumis', 'gagné', 'perdu', 'sans_suite'] as const

/** Le décompte des AO terminés par statut, dans l'ordre d'affichage ; les statuts à zéro sont omis. */
export function repartitionTermines(projets: readonly Project[]): [string, number][] {
  return STATUTS_TERMINES.map((s): [string, number] => [s, projets.filter((p) => p.status === s).length]).filter(([, n]) => n > 0)
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** « 1 analyse · 0 mémoire » ; null quand le serveur n'a rien (liste d'ailleurs que Mes AO) ou qu'aucune unité n'est consommée. */
export function texteUnites(a: AvancementAO | null | undefined): string | null {
  if (!a || (a.unites.analyses === 0 && a.unites.memoires === 0)) return null
  return `${pluriel(a.unites.analyses, 'analyse')} · ${pluriel(a.unites.memoires, 'mémoire')}`
}

interface QuotaMesAO {
  plan: string
  analyses: { used: number; limit: number }
  memoires: { used: number; limit: number }
}

/** La carte « Unités du mois » : les analyses et les mémoires cumulés sur le plafond de l'offre ; null tant que le quota n'est pas lu. */
export function uniteMois(q: QuotaMesAO | undefined) {
  if (!q?.analyses || !q.memoires) return null
  // Chaque compteur plafonné à son quota : une organisation au-delà du nouveau quota (Pro 40 → 30, 11/11/2026) lit « 60 sur 60 », jamais « 65 sur 60 ».
  const utilisees = Math.min(q.analyses.used, q.analyses.limit) + Math.min(q.memoires.used, q.memoires.limit)
  const total = q.analyses.limit + q.memoires.limit
  return { utilisees, total, restantes: Math.max(0, total - utilisees), part: total > 0 ? Math.min(1, utilisees / total) : 0 }
}

export interface FaitUne { libelle: string; valeur: string; ton: 'vert' | 'ambre' | 'neutre' }

/** Les quatre faits de « À la une » : seulement ceux que les données connaissent. Rien d'inventé (pas de nombre de pages, pas de « relu »). */
export function faitsALaUne(p: Project, _maintenant: Date = new Date()): FaitUne[] {
  const faits: FaitUne[] = []
  const a = p.avancement
  const pieces = faitPieces(a?.pieces)
  if (pieces) faits.push({ libelle: 'Pièces du coffre-fort', valeur: pieces.valeur, ton: pieces.sens === 'vert' ? 'vert' : 'ambre' })
  if (a?.memoire_ecrit_le) faits.push({ libelle: 'Mémoire technique', valeur: `écrit le ${jourMois(a.memoire_ecrit_le)}`, ton: 'vert' })
  else if (a?.plan_valide_le) faits.push({ libelle: 'Mémoire technique', valeur: `plan validé le ${jourMois(a.plan_valide_le)}`, ton: 'vert' })
  const points = p.infos_marche?.points_a_eclaircir
  if (Array.isArray(points)) faits.push({ libelle: 'Questions à l’acheteur', valeur: points.length === 0 ? 'Aucune à poser' : `${points.length} à poser`, ton: points.length === 0 ? 'vert' : 'ambre' })
  const unites = texteUnites(a)
  if (unites) faits.push({ libelle: 'Unités utilisées', valeur: unites, ton: 'neutre' })
  return faits
}

/** Un lien externe n'est ouvert que s'il est en http ou https (jamais « javascript: »). */
function urlSure(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch { return null }
}

/** L'avis de la veille d'où vient l'AO (identifiant et lien), si le lien est sûr (http ou https). */
export function versAvisOrigine(p: Project): { id: string | null; url: string } | null {
  const s = p.infos_marche?.source_avis
  const url = urlSure(s?.url_avis)
  return url ? { id: s?.id_boamp ?? null, url } : null
}

/** La couleur la plus urgente parmi les AO en cours dont la remise tombe aujourd'hui ou sous 7 jours (pastille de Mes AO dans la barre). */
export function niveauUrgence(projets: readonly Project[], maintenant: Date = new Date()): Niveau {
  return resumeMesAO(projets, maintenant).remise7.niveau
}

/** L'acheteur en court : « Commune de GUEUX » plutôt que l'adresse complète du maître d'ouvrage (DIAGNOSTIC, défaut 10). */
export function acheteurCourt(maitreOuvrage: string | null | undefined): string {
  const brut = (maitreOuvrage ?? '').trim()
  if (!brut) return ''
  return brut.split(/\s[–—-]\s|\s\(|,/)[0].trim()
}

/** « n° 7 » reste d'un seul tenant : l'espace après « n° » (ou « nº ») devient insécable (jury, tour 1 : le numéro tombait seul à la ligne). */
export const lierNumero = (texte: string): string => texte.replace(/\b(n[°º]) (?=\d)/gi, '$1\u00a0')
