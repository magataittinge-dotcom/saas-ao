// Carte « L'AO en 30 secondes » (bloc 9, tranche 4) — fonction pure, sans JSX.
//
// Elle résume l'AO en quelques faits, calculés SANS appel IA depuis l'analyse déjà
// en base : l'AO (infos du marché), les champs critiques lus dans le RC (chacun avec
// sa source), la checklist des pièces et la fiche de décision. Un fait sans donnée
// n'est pas affiché. Aucun avis ni conseil sur les prix : le montant du marché n'est
// pas repris ici (il n'est affiché nulle part ailleurs) ; les critères de jugement
// sont rapportés tels que le RC les pondère.

import { etatEcheance, type EcheanceSource } from '@/lib/echeance'
import { comptesPieces, libelleComptes, type EntreeStatutPiece } from '@/lib/statutPiece'

export interface SourceFait {
  document: string
  page: number | null
  excerpt: string | null
}

export interface ChampsCritiquesCarte {
  date_limite_remise?: { value: { date: string; heure: string | null } | null; source: SourceFait | null }
  visite_site?: { value: { statut: 'obligatoire' | 'facultative' | 'non_mentionnee'; date: string | null } | null; source: SourceFait | null }
  criteres?: { value: { nom: string; poids: number }[] | null; source: SourceFait | null }
  delai_execution?: { value: string | null; source: SourceFait | null }
}

export interface ProjetCarte {
  name?: string
  deadline?: string | null
  echeance?: EcheanceSource | null
  maitre_ouvrage?: string | null
  selected_lot_name?: string | null
  lots_detectes?: { nom: string }[] | null
  criteres_jugement?: { nom: string; poids: number }[] | null
  infos_marche?: {
    objet?: string | null
    maitre_ouvrage?: string | null
    lots?: string[] | null
    date_limite_reponse?: string | null
    duree_marche?: string | null
  } | null
}

export interface ConditionsCarte {
  /** Conditions relevées dans le DCE (ou qui correspondent au profil). */
  relevees: number
  /** Conditions à confirmer par l'utilisateur. */
  aConfirmer: number
}

export type IdFaitCarte =
  | 'acheteur' | 'objet' | 'lots' | 'remise' | 'visite' | 'pieces' | 'criteres' | 'delai' | 'decision'

export interface FaitCarte {
  id: IdFaitCarte
  libelle: string
  valeur: string
  /** Complément discret : temps restant, date de visite… */
  reste?: string
  /** Source dans le DCE, si elle existe. */
  source?: SourceFait | null
  /** Le fait demande une action de l'utilisateur (ambre). */
  action?: boolean
  /** Fait sur toute la largeur de la carte (texte long). */
  large?: boolean
}

export interface EntreeCarte {
  projet: ProjetCarte
  champs?: ChampsCritiquesCarte | null
  pieces?: readonly EntreeStatutPiece[] | null
  conditions?: ConditionsCarte | null
  maintenant?: Date
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** « vendredi 20 novembre 2026 » à partir d'AAAA-MM-JJ (sans fuseau, sans Intl). */
export function dateLongue(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const jour = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${JOURS[jour.getDay()]} ${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`
}

function tempsRestant(source: EcheanceSource, maintenant: Date): { texte: string; action: boolean } | null {
  const e = etatEcheance(source, maintenant)
  if (e.etat === 'sans_date') return null
  if (e.etat === 'passee') return { texte: 'date de remise passée', action: false }
  if (e.etat === 'aujourdhui') {
    return { texte: source.heure ? `aujourd’hui, avant ${source.heure}` : 'aujourd’hui', action: true }
  }
  const jours = e.jours ?? 0
  return { texte: jours === 1 ? 'demain' : `dans ${jours} jours`, action: e.etat === 'proche' }
}

const texteNet = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim()

export function construireCarteAO(e: EntreeCarte): FaitCarte[] {
  const { projet, champs } = e
  const maintenant = e.maintenant ?? new Date()
  const infos = projet.infos_marche ?? {}
  const faits: FaitCarte[] = []

  const acheteur = texteNet(infos.maitre_ouvrage ?? projet.maitre_ouvrage)
  if (acheteur) faits.push({ id: 'acheteur', libelle: 'Acheteur', valeur: acheteur })

  const objet = texteNet(infos.objet)
  if (objet) faits.push({ id: 'objet', libelle: 'Objet', valeur: objet, large: true })

  const lots = texteNet(projet.selected_lot_name)
    || (infos.lots?.length ? infos.lots.map(texteNet).join(' · ') : '')
    || (projet.lots_detectes?.length ? projet.lots_detectes.map((l) => texteNet(l.nom)).join(' · ') : '')
  if (lots) faits.push({ id: 'lots', libelle: (lots.includes(' · ') ? 'Lots' : 'Lot'), valeur: lots, large: lots.length > 50 })

  // Remise des offres : le champ lu dans le RC (avec sa source) puis l'échéance consolidée de l'AO
  const remise = champs?.date_limite_remise?.value
  const echeance: EcheanceSource | null = remise?.date
    ? { date: remise.date, heure: remise.heure }
    : projet.echeance?.date ? projet.echeance
      : projet.deadline ? { date: projet.deadline }
        : infos.date_limite_reponse ? { date: infos.date_limite_reponse } : null
  if (echeance?.date && /^\d{4}-\d{2}-\d{2}/.test(echeance.date)) {
    const reste = tempsRestant(echeance, maintenant)
    faits.push({
      id: 'remise', libelle: 'Remise des offres',
      valeur: `${dateLongue(echeance.date)}${echeance.heure ? ` · ${echeance.heure}` : ''}`,
      reste: reste?.texte, action: reste?.action,
      source: remise ? champs?.date_limite_remise?.source ?? null : null,
    })
  }

  const visite = champs?.visite_site?.value
  if (visite && visite.statut !== 'non_mentionnee') {
    const obligatoire = visite.statut === 'obligatoire'
    faits.push({
      id: 'visite', libelle: 'Visite du site',
      valeur: obligatoire ? 'Obligatoire' : 'Facultative',
      reste: visite.date ? `le ${dateLongue(visite.date)}` : obligatoire ? 'date à planifier' : undefined,
      action: obligatoire && !visite.date,
      source: champs?.visite_site?.source ?? null,
    })
  } else if (visite) {
    faits.push({ id: 'visite', libelle: 'Visite du site', valeur: 'Non mentionnée dans le DCE' })
  }

  if (e.pieces && e.pieces.length > 0) {
    const { aJoindre, pretes } = comptesPieces(e.pieces, echeance?.date)
    faits.push({ id: 'pieces', libelle: 'Pièces', valeur: libelleComptes(aJoindre, pretes), action: aJoindre > 0 })
  }

  const criteres = (champs?.criteres?.value ?? projet.criteres_jugement ?? []).filter((c) => c && c.nom)
  if (criteres.length > 0) {
    faits.push({
      id: 'criteres', libelle: 'Critères de jugement',
      valeur: criteres.map((c) => `${texteNet(c.nom)} ${c.poids} %`).join(' · '),
      source: champs?.criteres?.source ?? null, large: true,
    })
  }

  const delai = texteNet(champs?.delai_execution?.value) || texteNet(infos.duree_marche)
  if (delai) {
    faits.push({
      id: 'delai', libelle: 'Délai d’exécution', valeur: delai,
      source: champs?.delai_execution?.value ? champs.delai_execution.source : null, large: delai.length > 40,
    })
  }

  if (e.conditions && e.conditions.relevees + e.conditions.aConfirmer > 0) {
    const { relevees, aConfirmer } = e.conditions
    faits.push({
      id: 'decision', libelle: 'Fiche de décision',
      valeur: `${relevees} ${relevees > 1 ? 'conditions relevées' : 'condition relevée'} dans le DCE`,
      reste: aConfirmer > 0 ? `${aConfirmer} à confirmer par vous` : undefined,
    })
  }

  return faits
}
