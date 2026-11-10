// Les liens « Renseigner » de la page « Fiche à télécharger » : /company?rubrique=<r>&champ=<id> ouvre la rubrique de
// « Mon entreprise », fait défiler le champ en vue et lui donne le focus (components/entreprise/useFocusChamp.ts).
//
// Table section de la fiche → champ de Mon entreprise. Les sections viennent de ``fiches_donnees`` (numéro et titre,
// backend/services/fiches_donnees.py) ; chaque entrée dit où la saisir : la rubrique, puis le champ visé, retrouvé dans
// la page par son intitulé (``label``) ou, pour une liste, par le titre de son groupe (``groupe``). Les formulaires ne
// portent aucun identifiant de champ : la recherche se fait sur leurs intitulés, donc sans toucher à leur code.
import type { RubriqueId } from '@/lib/entreprise/avancement'
import { estRubrique } from '@/lib/entreprise/avancement'
import type { RubriqueFiche } from '@/lib/fiche'

export interface CibleChamp {
  rubrique: RubriqueId
  /** Intitulé exact de l'étiquette du champ (``Field label``). */
  label?: string
  /** Titre exact du groupe de champs (``Groupe titre``, ou début du titre) : le focus va à son premier champ. */
  groupe?: string
}

export const CHAMPS: Record<string, CibleChamp> = {
  // Identité
  raison_sociale: { rubrique: 'identite', label: "Nom de l’entreprise" },
  dirigeant: { rubrique: 'identite', label: 'Nom du dirigeant' },
  activites: { rubrique: 'identite', label: 'Activités principales' },
  chiffres: { rubrique: 'certifications', groupe: 'Chiffres demandés dans la' },
  // Moyens
  effectifs: { rubrique: 'moyens', groupe: 'Équipe' },
  informatique: { rubrique: 'moyens', label: 'Moyens informatiques' },
  materiel: { rubrique: 'moyens', groupe: 'Matériel et véhicules' },
  securite: { rubrique: 'moyens', groupe: 'Sécurité, qualité, environnement' },
  habilitations: { rubrique: 'moyens', groupe: 'Équipe : le détail' },
  coffre: { rubrique: 'certifications', groupe: 'Pièces au coffre-fort' },
  // Certifications et références
  qualifications: { rubrique: 'certifications', groupe: 'Qualifications' },
  assurances: { rubrique: 'certifications', groupe: 'Assurances' },
  references: { rubrique: 'certifications', groupe: 'Références' },
}

/** Section (numéro) de chaque fiche → champ de Mon entreprise où la renseigner. */
export const CHAMP_DE_SECTION: Record<RubriqueFiche, Record<string, string>> = {
  identite: { '01': 'raison_sociale', '02': 'dirigeant', '03': 'chiffres', '04': 'activites' },
  moyens: { '01': 'effectifs', '02': 'informatique', '03': 'materiel', '04': 'materiel', '05': 'securite', '06': 'securite', '07': 'coffre' },
  certifications: { '01': 'qualifications', '02': 'assurances', '03': 'habilitations' },
}

/** Le tableau des références de la fiche « Références » : ses lignes viennent de la rubrique Certifications. */
export const CHAMP_DES_REFERENCES = 'references'

/** Adresse de Mon entreprise qui ouvre la rubrique du champ (la rubrique seule si le champ est inconnu). */
export function lienChamp(champ: string | null | undefined, repli: RubriqueFiche): string {
  const cible = champ ? CHAMPS[champ] : undefined
  return cible ? `/company?rubrique=${cible.rubrique}&champ=${champ}` : `/company?rubrique=${repli}`
}

/** Lien d'une section de la fiche ; sans champ précis connu pour elle, la rubrique de la fiche s'ouvre. */
export const lienSection = (rubrique: RubriqueFiche, section: string): string =>
  lienChamp(CHAMP_DE_SECTION[rubrique][section], rubrique)

/** Le champ demandé par l'adresse (``?champ=forme_juridique``), s'il est connu et dans la bonne rubrique. */
export function champDepuisRecherche(recherche: string): string | null {
  const p = new URLSearchParams(recherche)
  const champ = p.get('champ')
  const rubrique = p.get('rubrique')
  if (!champ || !(champ in CHAMPS)) return null
  return estRubrique(rubrique) && CHAMPS[champ].rubrique === rubrique ? champ : null
}

const SANS_ACCENT = /[̀-ͯ]/g
export const normaliser = (t: string | null | undefined): string => (t ?? '').normalize('NFD').replace(SANS_ACCENT, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Le texte de l'élément correspond-il à la cible ? (``label`` : égalité ; ``groupe`` : début du titre.) */
export const intituleCorrespond = (texte: string, cible: CibleChamp, genre: 'label' | 'groupe'): boolean => {
  const voulu = normaliser(genre === 'label' ? cible.label : cible.groupe)
  const lu = normaliser(texte)
  return voulu !== '' && (genre === 'label' ? lu === voulu : lu.startsWith(voulu))
}
