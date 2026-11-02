// L'étape « Décider » : ce que lit l'écran sans rien décider à la place de l'utilisateur — fonctions pures, 0 € API.
//  • `cartesResumeAO` : les quatre cartes de la bande de résumé (remise, visite, pièces, exigences), tirées des faits de
//    « L'AO en 30 secondes » (lib/carteAO.ts) ;
//  • `pointsAVerifier` : « À vérifier avant de vous engager » — délais, visite, variantes, garanties, pénalités (une ligne et un
//    lien : le détail des pénalités vit dans le bloc trésorerie, V3). Jamais un avis ni un chiffre de prix ;
//  • `texteACopier` : la question prête à poser sur le profil d'acheteur.
import type { CarteResume } from '@/components/etape'
import type { FaitCarte, SourceFait, ChampsCritiquesCarte } from '@/lib/carteAO'
import { dateLongue } from '@/lib/carteAO'
import { phraseExigences } from '@/lib/analyseLibelles'
import type { InfosMarche, PointAEclaircir } from '@/types'

const AVERIFIER_RC = 'À vérifier dans le règlement'

/** « RC · page 4 » : la pièce et la page, sans rien inventer. */
export function libelleSource(s: { document: string; page: number | null } | null | undefined): string | null {
  if (!s?.document) return null
  return s.page ? `${s.document} · page ${s.page}` : s.document
}

const vers = (s: SourceFait | null | undefined, voir?: (s: SourceFait) => void) => {
  const libelle = libelleSource(s)
  return s && libelle ? { libelle, onVoir: voir ? () => voir(s) : undefined } : undefined
}

const JOUR_SEMAINE = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+/

export function cartesResumeAO(
  faits: readonly FaitCarte[],
  exigences: { total: number; obligatoires: number } | null,
  voir?: (s: SourceFait) => void,
  questions?: DateQuestions | null,
): CarteResume[] {
  const f = Object.fromEntries(faits.map((x) => [x.id, x])) as Partial<Record<FaitCarte['id'], FaitCarte>>
  const cartes: CarteResume[] = []

  const remise = f.remise
  if (remise) {
    // « vendredi 20 novembre 2026 · 12h00 » : la date en grand, le jour de la semaine, l'heure et le temps restant en dessous
    const [date, ...suite] = remise.valeur.split(' · ')
    const jour = date.match(JOUR_SEMAINE)?.[1]
    cartes.push({
      libelle: 'Remise des offres', valeur: date.replace(JOUR_SEMAINE, ''), etat: remise.action ? 'a-verifier' : 'neutre',
      detail: [jour, ...suite, remise.reste].filter(Boolean).join(' · ') || undefined, source: vers(remise.source, voir),
    })
  } else {
    cartes.push({ libelle: 'Remise des offres', valeur: AVERIFIER_RC, etat: 'a-verifier' })
  }

  // La visite du site est dans « À vérifier avant de vous engager » : ici, la date limite des questions à l'acheteur.
  if (questions !== undefined) {
    const { valeur, precision } = libelleDateQuestions(questions)
    const trouvee = questions?.statut === 'trouvee' && Boolean(questions.date)
    const source = questions?.document ? { document: questions.document, page: null, excerpt: questions.extrait } : null
    cartes.push({
      libelle: 'Questions à l’acheteur jusqu’au', valeur: valeur.replace(JOUR_SEMAINE, ''), etat: trouvee ? 'neutre' : 'a-verifier',
      detail: precision ?? undefined, source: vers(source, voir),
    })
  }

  const pieces = f.pieces
  if (pieces?.comptes) {
    const { pretes, aJoindre } = pieces.comptes
    cartes.push({
      libelle: 'Pièces à joindre', valeur: String(aJoindre), etat: aJoindre > 0 ? 'a-verifier' : 'pret',
      jauge: { rempli: pretes, total: pretes + aJoindre },
      detail: `${pretes} ${pretes > 1 ? 'prêtes' : 'prête'} dans votre coffre-fort`,
    })
  }

  if (exigences && exigences.total > 0) {
    cartes.push({
      libelle: 'Exigences relevées', valeur: String(exigences.total), etat: 'neutre',
      detail: phraseExigences(exigences.total, exigences.obligatoires),
    })
  }
  return cartes
}

// ── À vérifier avant de vous engager ─────────────────────────────────────────

export interface PointAVerifier {
  id: 'penalites' | 'delai' | 'visite' | 'variantes' | 'garanties' | 'validite' | 'assurances'
  libelle: string
  valeur: string
  source: SourceFait | null
  /** Pénalités : l'écran ajoute « Voir les pénalités » (vers le bloc trésorerie) au lieu de les détailler. */
  versTresorerie?: boolean
}

interface ChampsAVerifier extends ChampsCritiquesCarte {
  penalites?: { value: { retard: string | null; plafond: string | null } | null; source: SourceFait | null }
}

export interface ExigenceCitee { exigence_text: string; source_document?: string | null; source_page?: number | null; source_excerpt?: string | null }

/** La première exigence du dossier qui parle de ce sujet : sa pièce et sa page servent de source. */
export function sourceParMots(exigences: readonly ExigenceCitee[], mots: RegExp): SourceFait | null {
  const e = exigences.find((x) => x.source_document && (mots.test(x.exigence_text) || (x.source_excerpt ? mots.test(x.source_excerpt) : false)))
  return e?.source_document ? { document: e.source_document, page: e.source_page ?? null, excerpt: e.source_excerpt ?? null } : null
}

export function pointsAVerifier(
  champs: ChampsAVerifier | null | undefined, infos: InfosMarche | null | undefined, exigences: readonly ExigenceCitee[],
): PointAVerifier[] {
  const points: PointAVerifier[] = []
  const i = infos ?? {}

  const pen = champs?.penalites?.value
  if (pen?.retard || pen?.plafond || i.penalites_retard) {
    points.push({ id: 'penalites', libelle: 'Pénalités de retard', valeur: 'Le marché prévoit des pénalités de retard.', source: champs?.penalites?.source ?? sourceParMots(exigences, /p[ée]nalit/i), versTresorerie: true })
  }
  const delai = (champs?.delai_execution?.value ?? '').trim() || (i.duree_marche ?? '').trim()
  if (delai) points.push({ id: 'delai', libelle: 'Délai d’exécution', valeur: delai, source: champs?.delai_execution?.value ? champs.delai_execution.source : sourceParMots(exigences, /d[ée]lai d.ex[ée]cution|dur[ée]e du march/i) })

  const v = champs?.visite_site?.value
  if (v && v.statut !== 'non_mentionnee') {
    points.push({
      id: 'visite', libelle: 'Visite du site',
      valeur: v.statut === 'obligatoire' ? (v.date ? `Obligatoire, le ${dateLongue(v.date)}` : 'Obligatoire, date à planifier') : 'Facultative',
      source: champs?.visite_site?.source ?? null,
    })
  }
  if (typeof i.variantes_autorisees === 'boolean') {
    points.push({ id: 'variantes', libelle: 'Variantes', valeur: i.variantes_autorisees ? 'Les variantes sont autorisées.' : 'Les variantes ne sont pas autorisées.', source: sourceParMots(exigences, /variante/i) })
  }
  const garanties: string[] = []
  if (typeof i.retenue_garantie_pct === 'number') garanties.push(`retenue de garantie de ${i.retenue_garantie_pct} %`)
  if (i.caution_remplacante === true) garanties.push('remplaçable par une caution')
  if (garanties.length) points.push({ id: 'garanties', libelle: 'Garanties', valeur: garanties[0].charAt(0).toUpperCase() + garanties.join(', ').slice(1) + '.', source: sourceParMots(exigences, /garantie|caution/i) })
  if (typeof i.validite_offres_jours === 'number') points.push({ id: 'validite', libelle: 'Validité de l’offre', valeur: `${i.validite_offres_jours} jours`, source: sourceParMots(exigences, /validit[ée] des offres|d[ée]lai de validit/i) })
  if (i.assurances_specifiques?.length) points.push({ id: 'assurances', libelle: 'Assurances demandées', valeur: i.assurances_specifiques.join(', '), source: sourceParMots(exigences, /assurance/i) })
  return points
}

// ── Points à éclaircir ───────────────────────────────────────────────────────

/** Le texte à poser sur le profil d'acheteur : la question, sa référence dans le dossier, une formule de politesse. */
export function texteACopier(p: Pick<PointAEclaircir, 'question' | 'source_document' | 'source_page'>): string {
  const ref = p.source_document ? `\n(Référence : ${p.source_document}${p.source_page ? `, page ${p.source_page}` : ''}.)` : ''
  return `Bonjour,\n\n${p.question.trim()}${ref}\n\nMerci par avance de votre réponse.`
}

export interface DateQuestions {
  statut: 'trouvee' | 'a_verifier'
  regle: 'absolue' | 'relative' | null
  date: string | null
  heure: string | null
  jours: number | null
  document: string | null
  extrait: string | null
  motif: string | null
  rappel?: string
}

/** « 12 mars 2027 » ou « À vérifier dans le RC », avec la manière dont la date est obtenue. */
export function libelleDateQuestions(d: DateQuestions | null | undefined): { valeur: string; precision: string | null } {
  if (!d || d.statut !== 'trouvee' || !d.date) return { valeur: AVERIFIER_RC, precision: d?.extrait ? 'Le règlement donne une formule que Synorix ne peut pas calculer seul.' : null }
  const jour = dateLongue(d.date)
  return {
    valeur: d.heure ? `${jour} · ${d.heure}` : jour,
    precision: d.regle === 'relative' && d.jours ? `${d.jours} ${d.jours > 1 ? 'jours' : 'jour'} avant la remise des offres` : null,
  }
}
