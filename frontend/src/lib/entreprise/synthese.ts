// Mon entreprise — ce que Synorix sait de l'entreprise, en peu de mots : les six bulles autour du visage et les quatre
// faits clés de chaque carte de rubrique. Fonctions pures, calculées depuis les données déjà chargées (aucun appel).
// Les textes restent positifs : une donnée absente se lit « À renseigner », jamais « manquant ».
import type { CAEntry, LigneEffectif, LigneMoyen, Qualification, Reference } from '@/types'
import type { DonneesEntreprise, RubriqueId } from './avancement'

export const A_RENSEIGNER = 'À renseigner'

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const sansAccent = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const accorder = (n: number, singulier: string, pluriel: string): string => `${n} ${n > 1 ? pluriel : singulier}`

/** « 709 941 € HT » (espaces insécables fines remplacées par des espaces insécables simples, lisibles partout). */
export function euros(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(montant)).replace(/[  ]/g, ' ')} € HT`
}

/** « 2027-06-30 » → « 30/06/2027 » ; autre chose → chaîne vide. */
export function dateFr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** « 12 rue des Exemples, 14000 Caen » → « Caen (14) » ; sans code postal reconnu : chaîne vide. */
export function villeDepuisAdresse(adresse: string | null | undefined): string {
  const m = /\b(\d{5})\s+([^,\d][^,]*)\s*$/.exec(texte(adresse))
  if (!m) return ''
  const dep = /^(97|98)/.test(m[1]) ? m[1].slice(0, 3) : m[1].slice(0, 2)
  return `${m[2].trim()} (${dep})`
}

const aujourdhuiIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface Bulle {
  id: 'identite' | 'effectif' | 'moyens' | 'qualifications' | 'references' | 'assurances'
  /** Rubrique qui s'ouvre au clic. */
  rubrique: RubriqueId
  libelle: string
  valeur: string
  detail: string
  /** Faux : la valeur est « À renseigner » (affichée en accent). */
  renseignee: boolean
  cote: 'gauche' | 'droite'
  /** Point de départ du fil sur le visage, en fraction de sa largeur (x) et de sa hauteur (y). */
  ancre: { x: number; y: number }
}

const estEchafaudage = (l: LigneMoyen): boolean => /echafaud/.test(sansAccent(l.designation ?? ''))
const lignesMoyens = (liste: LigneMoyen[] | null | undefined): LigneMoyen[] => (Array.isArray(liste) ? liste.filter((l) => texte(l?.designation)) : [])
const quantite = (l: LigneMoyen): number => (nombre(l.quantite) && l.quantite > 0 ? l.quantite : 1)

/** Total des effectifs saisis par catégorie ; à défaut, l'effectif moyen du dernier exercice renseigné ; 0 si rien. */
export function effectifTotal(d: DonneesEntreprise): number {
  const lignes = (d.profil?.effectifs_par_categorie ?? []) as LigneEffectif[]
  const somme = lignes.reduce((t, l) => t + (nombre(l?.effectif) ? l.effectif : 0), 0)
  if (somme > 0) return somme
  const ca = ((d.profil?.chiffre_affaires ?? []) as CAEntry[]).find((e) => nombre(e?.effectif_moyen) && e.effectif_moyen! > 0)
  return ca?.effectif_moyen ?? 0
}

const chefsEquipe = (d: DonneesEntreprise): number =>
  ((d.profil?.effectifs_par_categorie ?? []) as LigneEffectif[]).filter((l) => l?.categorie === 'chef_equipe').reduce((t, l) => t + (nombre(l.effectif) ? l.effectif : 0), 0)

const qualifs = (d: DonneesEntreprise, ...familles: Qualification['famille'][]): Partial<Qualification>[] =>
  (d.qualifications ?? []).filter((q) => q.famille && familles.includes(q.famille) && texte(q.intitule))
const aDocument = (d: DonneesEntreprise, ...types: string[]): boolean =>
  (d.documents ?? []).some((p) => types.includes(p.type) && (p.status === undefined || ['valid', 'expiring_soon', 'unverified'].includes(p.status)))

/** Les assurances connues, dans l'ordre d'affichage : déclarées (qualifications) ou au coffre-fort. */
export function assurancesConnues(d: DonneesEntreprise): string[] {
  const declarees = qualifs(d, 'assurance').map((q) => sansAccent(q.intitule ?? ''))
  const decennale = aDocument(d, 'decennale') || declarees.some((i) => i.includes('decennale'))
  const rc = aDocument(d, 'rc_civile') || declarees.some((i) => i.includes('civile') || i.includes('responsabilite'))
  return [decennale && 'Décennale', rc && 'Responsabilité civile'].filter((x): x is string => Boolean(x))
}

const echeances = (liste: Partial<Qualification>[]): string[] => liste.map((q) => texte(q.date_fin).slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()

/** Première date de fin à venir (jour même compris) ; à défaut la plus récente passée. */
function prochaineEcheance(liste: Partial<Qualification>[], aujourdhui: string): { iso: string; passee: boolean } | null {
  const dates = echeances(liste)
  const aVenir = dates.find((x) => x >= aujourdhui)
  if (aVenir) return { iso: aVenir, passee: false }
  return dates.length ? { iso: dates[dates.length - 1], passee: true } : null
}

const nomsMaitresOuvrage = (refs: Partial<Reference>[]): string[] => {
  const vus: string[] = []
  for (const r of refs) {
    const nom = texte(r.maitre_ouvrage)
    if (nom && r.client_type !== 'particulier' && !vus.includes(nom)) vus.push(nom) // un particulier ne se nomme pas (RGPD)
  }
  return vus
}

const montantCumule = (refs: Partial<Reference>[]): number => refs.reduce((t, r) => t + (nombre(r.montant_ht) ? r.montant_ht : 0), 0)

/** Les six bulles, de gauche à droite puis de haut en bas : trois à gauche du visage, trois à droite. */
export function construireBulles(d: DonneesEntreprise, aujourdhui: Date = new Date()): Bulle[] {
  const jour = aujourdhui instanceof Date ? aujourdhui : new Date()
  const iso = aujourdhuiIso(jour)
  const org = d.organisation
  const profil = d.profil

  // Identité
  const raison = [texte(org?.name), texte(org?.forme_juridique)].filter(Boolean).join(' · ')
  const ville = villeDepuisAdresse(org?.address)
  const identite: Bulle = {
    id: 'identite', rubrique: 'identite', libelle: 'Identité', cote: 'gauche', ancre: { x: 0.26, y: 0.3 },
    valeur: raison || A_RENSEIGNER, renseignee: Boolean(raison),
    detail: [texte(org?.siret) ? 'SIRET renseigné' : 'SIRET à renseigner', ville].filter(Boolean).join(' · '),
  }

  // Effectif
  const total = effectifTotal(d)
  const chefs = chefsEquipe(d)
  const personnes = (d.equipe ?? []).length
  const effectif: Bulle = {
    id: 'effectif', rubrique: 'moyens', libelle: 'Effectif', cote: 'gauche', ancre: { x: 0.16, y: 0.5 },
    valeur: total > 0 ? accorder(total, 'salarié', 'salariés') : A_RENSEIGNER, renseignee: total > 0,
    detail: chefs > 0 ? accorder(chefs, "chef d'équipe", "chefs d'équipe")
      : personnes > 0 ? accorder(personnes, 'personne clé', 'personnes clés') : 'Effectifs par catégorie à renseigner',
  }

  // Moyens : véhicules et échafaudage en valeur, machines et gros matériel en détail
  const vehicules = lignesMoyens(profil?.vehicules_liste)
  const materiel = lignesMoyens(profil?.materiel_liste)
  const nbVehicules = vehicules.reduce((t, l) => t + quantite(l), 0)
  const echafaudage = materiel.filter(estEchafaudage)
  const autres = materiel.filter((l) => !estEchafaudage(l))
  const partiesValeur = [
    nbVehicules > 0 && accorder(nbVehicules, 'véhicule', 'véhicules'),
    echafaudage.length > 0 && (() => {
      const unite = texte(echafaudage[0].unite)
      const q = echafaudage.reduce((t, l) => t + quantite(l), 0)
      return unite ? `${q} ${unite} d'échafaudage` : 'échafaudage'
    })(),
  ].filter((x): x is string => Boolean(x))
  const enTexteLibre = texte(profil?.vehicules) || texte(profil?.materiel)
  const moyens: Bulle = {
    id: 'moyens', rubrique: 'moyens', libelle: 'Moyens', cote: 'gauche', ancre: { x: 0.24, y: 0.72 },
    valeur: partiesValeur.join(' · ') || (autres.length > 0 ? accorder(autres.reduce((t, l) => t + quantite(l), 0), 'matériel', 'matériels') : enTexteLibre ? 'Décrits en texte libre' : A_RENSEIGNER),
    renseignee: partiesValeur.length > 0 || autres.length > 0 || Boolean(enTexteLibre),
    detail: autres.length > 0 ? autres.slice(0, 2).map((l) => `${quantite(l)} ${texte(l.designation).toLowerCase()}`).join(' · ') : 'Machines et gros matériel à renseigner',
  }

  // Qualifications
  const quals = qualifs(d, 'qualification', 'rge')
  const intitules = quals.map((q) => texte(q.intitule)).slice(0, 2)
  const auCoffre = aDocument(d, 'qualibat', 'rge')
  const prochaine = prochaineEcheance(quals, iso)
  const qualifications: Bulle = {
    id: 'qualifications', rubrique: 'certifications', libelle: 'Qualifications', cote: 'droite', ancre: { x: 0.74, y: 0.3 },
    valeur: intitules.join(' · ') || (auCoffre ? 'Au coffre-fort' : A_RENSEIGNER), renseignee: intitules.length > 0 || auCoffre,
    detail: prochaine ? (prochaine.passee ? `À renouveler (échue le ${dateFr(prochaine.iso)})` : `Prochaine échéance : ${dateFr(prochaine.iso)}`) : 'Échéance à renseigner',
  }

  // Références
  const refs = d.references ?? []
  const cumule = montantCumule(refs)
  const maitres = nomsMaitresOuvrage(refs).slice(0, 3)
  const references: Bulle = {
    id: 'references', rubrique: 'certifications', libelle: 'Références', cote: 'droite', ancre: { x: 0.84, y: 0.5 },
    valeur: refs.length > 0 ? [accorder(refs.length, 'chantier', 'chantiers'), cumule > 0 && euros(cumule)].filter(Boolean).join(' · ') : A_RENSEIGNER,
    renseignee: refs.length > 0,
    detail: maitres.length > 0 ? maitres.join(' · ') : refs.length > 0 ? "Maîtres d'ouvrage à renseigner" : 'Chantiers terminés de moins de cinq ans',
  }

  // Assurances
  const assurances = assurancesConnues(d)
  const finAssurance = prochaineEcheance(qualifs(d, 'assurance'), iso)
  const bulleAssurances: Bulle = {
    id: 'assurances', rubrique: 'certifications', libelle: 'Assurances', cote: 'droite', ancre: { x: 0.76, y: 0.72 },
    valeur: assurances.join(' · ') || A_RENSEIGNER, renseignee: assurances.length > 0,
    detail: finAssurance ? (finAssurance.passee ? `À renouveler (échues le ${dateFr(finAssurance.iso)})` : `Valables jusqu'au ${dateFr(finAssurance.iso)}`)
      : assurances.length > 0 ? 'Date de validité à renseigner' : 'Décennale et responsabilité civile',
  }

  return [identite, effectif, moyens, qualifications, references, bulleAssurances]
}

/** Un fait clé d'une carte : `valeur` nul = à renseigner. */
export interface Fait { libelle: string; valeur: string | null }

const ouNull = (t: string): string | null => (t ? t : null)

/** Les quatre faits clés d'une rubrique. */
export function faitsCles(d: DonneesEntreprise, rubrique: RubriqueId): Fait[] {
  const org = d.organisation
  const profil = d.profil
  if (rubrique === 'identite') {
    return [
      { libelle: 'Raison sociale', valeur: ouNull([texte(org?.name), texte(org?.forme_juridique)].filter(Boolean).join(' · ')) },
      { libelle: 'SIRET', valeur: texte(org?.siret) ? 'Renseigné' : null },
      { libelle: 'Dirigeant', valeur: ouNull(texte(profil?.gerant_nom)) },
      { libelle: "Zone d'intervention", valeur: ouNull(texte(profil?.zone_intervention)) },
    ]
  }
  if (rubrique === 'moyens') {
    const total = effectifTotal(d)
    const chefs = chefsEquipe(d)
    const nbVehicules = lignesMoyens(profil?.vehicules_liste).reduce((t, l) => t + quantite(l), 0)
    return [
      { libelle: 'Effectif', valeur: total > 0 ? accorder(total, 'salarié', 'salariés') : null },
      { libelle: "Chefs d'équipe", valeur: chefs > 0 ? String(chefs) : null },
      { libelle: 'Véhicules', valeur: nbVehicules > 0 ? String(nbVehicules) : texte(profil?.vehicules) ? 'Décrits' : null },
      { libelle: 'Sécurité', valeur: texte(profil?.gestion_securite) ? 'Renseignée' : null },
    ]
  }
  const refs = d.references ?? []
  const cumule = montantCumule(refs)
  const exercices = ((profil?.chiffre_affaires ?? []) as CAEntry[]).filter((e) => texte(e?.annee) && texte(e?.montant)).length
  const quals = qualifs(d, 'qualification', 'rge').map((q) => texte(q.intitule))
  const assurances = assurancesConnues(d)
  return [
    { libelle: 'Qualifications', valeur: ouNull(quals.slice(0, 2).join(' · ')) ?? (aDocument(d, 'qualibat', 'rge') ? 'Au coffre-fort' : null) },
    { libelle: 'Assurances', valeur: ouNull(assurances.join(' · ')) },
    { libelle: 'Chantiers', valeur: refs.length > 0 ? [String(refs.length), cumule > 0 && euros(cumule)].filter(Boolean).join(' · ') : null },
    { libelle: "Chiffre d'affaires", valeur: exercices > 0 ? accorder(exercices, 'exercice', 'exercices') : null },
  ]
}
