// Mon entreprise — l'avancement de chaque rubrique, calculé depuis les données déjà chargées (aucun appel).
// Une « information » est un renseignement dont une pièce ou un critère courant a besoin (liste de référence :
// INFORMATIONS-ENTREPRISE.md, niveau « indispensable »). Le décompte ne dit jamais « manquant » : « n informations sur m ».
import type { CAEntry, LigneEffectif, LigneHabilitation, LigneMoyen, MemoireConfig, Organization, PosteCle, Qualification, Reference, TeamMember } from '@/types'

export type RubriqueId = 'identite' | 'moyens' | 'certifications'

export const RUBRIQUES: { id: RubriqueId; titre: string; court: string }[] = [
  { id: 'identite', titre: 'Identité', court: 'Identité' },
  { id: 'moyens', titre: 'Moyens humains et matériels', court: 'Moyens' },
  { id: 'certifications', titre: 'Certifications et références', court: 'Certifications' },
]

export const estRubrique = (v: unknown): v is RubriqueId => RUBRIQUES.some((r) => r.id === v)

/** Pièce du coffre-fort, réduite à ce qui compte ici. */
export interface PieceCoffre { id?: string; file_name?: string; type: string; status?: string }

export interface DonneesEntreprise {
  organisation?: Partial<Organization> | null
  profil?: Partial<MemoireConfig> | null
  equipe?: Partial<TeamMember>[] | null
  references?: Partial<Reference>[] | null
  documents?: PieceCoffre[] | null
  qualifications?: Partial<Qualification>[] | null
}

export type Niveau = 'indispensable' | 'utile' | 'option'

export interface Information {
  id: string
  rubrique: RubriqueId
  libelle: string
  niveau: Niveau
  rempli: (d: DonneesEntreprise) => boolean
}

const texte = (v: unknown): boolean => typeof v === 'string' && v.trim() !== ''
const nombre = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)

/** Une pièce du coffre compte tant qu'elle n'est pas à renouveler (« expired ») ni non rangée. */
const pieceValable = (p: PieceCoffre): boolean => p.status === undefined || ['valid', 'expiring_soon', 'unverified'].includes(p.status)
const aPiece = (d: DonneesEntreprise, ...types: string[]): boolean => (d.documents ?? []).some((p) => types.includes(p.type) && pieceValable(p))

const aMoyens = (liste: LigneMoyen[] | null | undefined, repli: unknown): boolean => (Array.isArray(liste) && liste.some((l) => texte(l?.designation))) || texte(repli)
const sansAccent = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const effectif = (l: LigneEffectif[] | null | undefined, categorie: string): boolean => Array.isArray(l) && l.some((x) => x?.categorie === categorie && nombre(x.effectif))
const habilite = (l: LigneHabilitation[] | null | undefined, type: string): boolean => Array.isArray(l) && l.some((x) => x?.type === type && nombre(x.nombre))
/** Une assurance déclarée (famille « assurance ») dont l'intitulé contient l'un des mots. */
const aAssurance = (d: DonneesEntreprise, ...mots: string[]): boolean =>
  (d.qualifications ?? []).some((q) => q.famille === 'assurance' && texte(q.intitule) && mots.some((m) => sansAccent(q.intitule ?? '').includes(m)))

const aUneAnneeRenseignee = (ca: unknown): boolean => Array.isArray(ca) && (ca as CAEntry[]).some((e) => texte(e?.annee) && texte(e?.montant))
const aUnPosteNomme = (p: unknown): boolean => Array.isArray(p) && (p as PosteCle[]).some((e) => texte(e?.nom))

/** Une référence prête à citer : intitulé, maître d'ouvrage, lieu, montant et année renseignés. */
export const referenceRenseignee = (r: Partial<Reference>): boolean =>
  texte(r.intitule) && texte(r.maitre_ouvrage) && texte(r.adresse) && nombre(r.montant_ht) && nombre(r.annee)

export const INFORMATIONS: Information[] = [
  // ── Identité ──
  { id: 'I01', rubrique: 'identite', libelle: 'Raison sociale', niveau: 'indispensable', rempli: (d) => texte(d.organisation?.name) },
  { id: 'I02', rubrique: 'identite', libelle: 'SIRET', niveau: 'indispensable', rempli: (d) => texte(d.organisation?.siret) },
  { id: 'I03', rubrique: 'identite', libelle: 'Forme juridique', niveau: 'indispensable', rempli: (d) => texte(d.organisation?.forme_juridique) },
  { id: 'I08', rubrique: 'identite', libelle: 'Adresse du siège', niveau: 'indispensable', rempli: (d) => texte(d.organisation?.address) },
  { id: 'I09', rubrique: 'identite', libelle: 'Dirigeant : nom', niveau: 'indispensable', rempli: (d) => texte(d.profil?.gerant_nom) },
  { id: 'I10', rubrique: 'identite', libelle: 'Dirigeant : fonction', niveau: 'indispensable', rempli: (d) => texte(d.profil?.gerant_titre) },
  { id: 'I11', rubrique: 'identite', libelle: "E-mail de l'entreprise", niveau: 'indispensable', rempli: (d) => texte(d.organisation?.email_contact) },
  { id: 'I12', rubrique: 'identite', libelle: 'Téléphone', niveau: 'indispensable', rempli: (d) => texte(d.organisation?.telephone) },
  { id: 'I16', rubrique: 'identite', libelle: 'Activités principales', niveau: 'indispensable', rempli: (d) => texte(d.profil?.activites) },
  { id: 'I18', rubrique: 'identite', libelle: "Zone d'intervention", niveau: 'indispensable', rempli: (d) => texte(d.profil?.zone_intervention) },
  { id: 'I20', rubrique: 'identite', libelle: "Chiffre d'affaires des derniers exercices", niveau: 'indispensable', rempli: (d) => aUneAnneeRenseignee(d.profil?.chiffre_affaires) },
  { id: 'I23', rubrique: 'identite', libelle: 'Effectif moyen annuel', niveau: 'indispensable', rempli: (d) => Array.isArray(d.profil?.chiffre_affaires) && (d.profil!.chiffre_affaires as CAEntry[]).some((e) => nombre(e?.effectif_moyen)) },
  // ── Moyens humains et matériels ──
  { id: 'M02', rubrique: 'moyens', libelle: 'Postes clés', niveau: 'indispensable', rempli: (d) => aUnPosteNomme(d.profil?.postes_cles) },
  { id: 'M03', rubrique: 'moyens', libelle: 'Personne clé : spécialité et expérience', niveau: 'indispensable', rempli: (d) => (d.equipe ?? []).some((m) => texte(m.name) && texte(m.specialite) && nombre(m.experience_years)) },
  { id: 'M06', rubrique: 'moyens', libelle: "Effectif d'encadrement", niveau: 'indispensable', rempli: (d) => effectif(d.profil?.effectifs_par_categorie, 'encadrement') },
  { id: 'M07', rubrique: 'moyens', libelle: "Chefs d'équipe", niveau: 'indispensable', rempli: (d) => effectif(d.profil?.effectifs_par_categorie, 'chef_equipe') },
  { id: 'M10', rubrique: 'moyens', libelle: 'Secouristes (SST)', niveau: 'indispensable', rempli: (d) => habilite(d.profil?.habilitations, 'sst') },
  { id: 'M13', rubrique: 'moyens', libelle: 'Matériel', niveau: 'indispensable', rempli: (d) => aMoyens(d.profil?.materiel_liste, d.profil?.materiel) },
  { id: 'M15', rubrique: 'moyens', libelle: 'Véhicules', niveau: 'indispensable', rempli: (d) => aMoyens(d.profil?.vehicules_liste, d.profil?.vehicules) },
  { id: 'M21', rubrique: 'moyens', libelle: 'Organisation de la sécurité', niveau: 'indispensable', rempli: (d) => texte(d.profil?.gestion_securite) },
  { id: 'M22', rubrique: 'moyens', libelle: 'Gestion des déchets', niveau: 'indispensable', rempli: (d) => texte(d.profil?.traitement_dechets) },
  // ── Certifications et références ──
  { id: 'C01', rubrique: 'certifications', libelle: 'Qualification professionnelle', niveau: 'indispensable', rempli: (d) => aPiece(d, 'qualibat', 'rge') || (d.qualifications ?? []).some((q) => q.famille === 'qualification' && texte(q.intitule)) },
  { id: 'C04', rubrique: 'certifications', libelle: 'Assurance responsabilité civile', niveau: 'indispensable', rempli: (d) => aPiece(d, 'rc_civile') || aAssurance(d, 'civile', 'responsabilite') },
  { id: 'C05', rubrique: 'certifications', libelle: 'Assurance décennale', niveau: 'indispensable', rempli: (d) => aPiece(d, 'decennale') || aAssurance(d, 'decennale') },
  { id: 'C19', rubrique: 'certifications', libelle: 'Extrait Kbis', niveau: 'indispensable', rempli: (d) => aPiece(d, 'kbis') },
  { id: 'C20', rubrique: 'certifications', libelle: 'Attestation de vigilance URSSAF', niveau: 'indispensable', rempli: (d) => aPiece(d, 'urssaf') },
  { id: 'C21', rubrique: 'certifications', libelle: 'Attestation de régularité fiscale', niveau: 'indispensable', rempli: (d) => aPiece(d, 'fiscal') },
  { id: 'C07', rubrique: 'certifications', libelle: 'Références de chantiers', niveau: 'indispensable', rempli: (d) => (d.references ?? []).some(referenceRenseignee) },
]

export interface Avancement { rempli: number; total: number }

/** Les informations indispensables d'une rubrique, renseignées sur le total. */
export function avancement(d: DonneesEntreprise, rubrique: RubriqueId, informations: Information[] = INFORMATIONS): Avancement {
  const liste = informations.filter((i) => i.rubrique === rubrique && i.niveau === 'indispensable')
  return { rempli: liste.filter((i) => i.rempli(d)).length, total: liste.length }
}

/** « 11 informations sur 14 » (« 1 information sur 14 » au singulier ; « 0 information » quand rien n'est saisi). */
export function libelleAvancement({ rempli, total }: Avancement): string {
  return `${rempli} information${rempli > 1 ? 's' : ''} sur ${total}`
}

/** Les informations de la rubrique encore à renseigner, pour l'infobulle et les lecteurs d'écran. */
export function aRenseigner(d: DonneesEntreprise, rubrique: RubriqueId, informations: Information[] = INFORMATIONS): string[] {
  return informations.filter((i) => i.rubrique === rubrique && i.niveau === 'indispensable' && !i.rempli(d)).map((i) => i.libelle)
}

// ─── Pièces du coffre-fort suivies dans « Certifications et références » ───

export const PIECES_SUIVIES: { id: string; libelle: string; types: string[] }[] = [
  { id: 'C01', libelle: 'Qualification professionnelle', types: ['qualibat', 'rge'] },
  { id: 'C04', libelle: 'Assurance responsabilité civile', types: ['rc_civile'] },
  { id: 'C05', libelle: 'Assurance décennale', types: ['decennale'] },
  { id: 'C19', libelle: 'Extrait Kbis', types: ['kbis'] },
  { id: 'C20', libelle: 'Attestation de vigilance URSSAF', types: ['urssaf'] },
  { id: 'C21', libelle: 'Attestation de régularité fiscale', types: ['fiscal'] },
]

export type EtatPiece = 'au_coffre' | 'a_renouveler' | 'a_joindre'

/** Où en est une pièce : au coffre-fort, à renouveler (date dépassée), ou à joindre. */
export function etatPiece(documents: PieceCoffre[] | null | undefined, types: string[]): EtatPiece {
  const siennes = (documents ?? []).filter((p) => types.includes(p.type))
  if (siennes.some(pieceValable)) return 'au_coffre'
  return siennes.some((p) => p.status === 'expired') ? 'a_renouveler' : 'a_joindre'
}

export const LIBELLE_ETAT_PIECE: Record<EtatPiece, string> = {
  au_coffre: 'Au coffre-fort',
  a_renouveler: 'À renouveler',
  a_joindre: 'À joindre',
}
