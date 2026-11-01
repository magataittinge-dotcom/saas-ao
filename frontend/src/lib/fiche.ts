// Fiches « Mon entreprise » à télécharger (PDF ou Word) : types de l'API, couleurs et lignes libres.
// Les données viennent de GET /api/entreprise/fiches/{rubrique} ; le Word et le PDF sont produits par le serveur
// (services/fiches_entreprise.py) avec la même mise en page que l'aperçu. La palette ci-dessous reprend, valeur pour
// valeur, celle du serveur (services/fiches_donnees.palette + services/visuels/couleurs.Theme) : l'aperçu suit
// la couleur choisie sans attendre un enregistrement (tests/fiche-entreprise.test.tsx compare les deux).

export type RubriqueFiche = 'identite' | 'moyens' | 'certifications'

export const RUBRIQUES_FICHE: { id: RubriqueFiche; libelle: string; court: string }[] = [
  { id: 'identite', libelle: 'Identité', court: 'Identité' },
  { id: 'moyens', libelle: 'Moyens humains et matériels', court: 'Moyens' },
  { id: 'certifications', libelle: 'Certifications et références', court: 'Références' },
]

export const COULEUR_PAR_DEFAUT = '#008cf8' // accent du thème Synorix (palier 500)

export const lienFiche = (rubrique: RubriqueFiche) => `/entreprise/fiche/${rubrique}`

/** Le libellé du lien vers la fiche d'une rubrique (cartes, formulaire, bulles, fil d'Ariane), partout le même. */
export const LIBELLE_FICHE = 'Fiche à télécharger'

export interface FicheLigne { libelle: string; valeur: string }
export interface LigneLibre { section: string; libelle: string; valeur: string }

/** Le serveur termine par « … » tout texte du profil qu'il a dû abréger (`fiches_donnees.MARQUE_ABREGE`). */
export const estAbrege = (texte: string | null | undefined): boolean => typeof texte === 'string' && texte.trimEnd().endsWith('…')
export const INFOBULLE_ABREGE = 'Texte abrégé, modifiable dans Mon entreprise'
export interface FicheTuile { valeur: string; libelle: string }
export interface FicheSection {
  id: string
  titre: string
  lignes: FicheLigne[]
  texte: string
  vide: boolean
  disposition: 'etroit' | 'large' | 'empile'
}
export type ModeIntervention = 'direct' | 'sous_traitance' | 'cotraitance'
export interface FicheReference {
  numero: number
  client: string
  client_adresse: string
  particulier: boolean
  intervention: ModeIntervention | null
  chantier: string
  lieu: string
  travaux: string
  montant: string
}
export interface FicheTableauReferences {
  lignes: FicheReference[]
  total: { chantiers: number; montant: string; sous_traitance: number; donneurs_ordre: number }
  note: string
}
export interface FicheDonnees {
  rubrique: RubriqueFiche
  societe: { nom: string; siret: string; forme: string; adresse: string; contact: string }
  identite_ligne: FicheLigne[]
  tuiles: FicheTuile[]
  lignes_cles: FicheLigne[]
  sections: FicheSection[]
  references: FicheTableauReferences | null
  pied: string
  pages: number
}
export interface FicheBordereau {
  titre: string
  sous_titre: string
  contact: string
  couleur: string
  lignes_libres: LigneLibre[]
  enregistre?: boolean
  logo_url?: string | null
  logo_origine?: 'fiche' | 'entreprise' | null
}
export interface PaletteFiche {
  accent: string
  accent_texte: string
  bandeau: string
  bandeau_texte: string
  accent_pale: string
  accent_clair: string
  encre: string
  texte: string
  discret: string
  filet: string
}
export interface FicheReponse {
  rubrique: RubriqueFiche
  libelle: string
  bordereau: FicheBordereau
  valeurs_par_defaut: { titre: string; sous_titre: string; contact: string; couleur: string }
  sections_libres: string[]
  palette: PaletteFiche
  donnees: FicheDonnees
}

export const INTERVENTIONS: Record<ModeIntervention, string> = {
  direct: 'En direct',
  sous_traitance: 'Sous-traitance',
  cotraitance: 'Cotraitance',
}

export const VIDE_SECTION = 'Précisions sur demande'
export const MAX_LIGNES_LIBRES = 30

const RE_COULEUR = /^#[0-9a-fA-F]{6}$/
export const couleurValide = (v: string): boolean => RE_COULEUR.test(v.trim())

// ─── Palette : même calcul que le serveur ──────────────────────────────────────

type Rgb = [number, number, number]
const rgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const hex = (c: Rgb): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const melange = (a: string, b: string, t: number): string => {
  const [x, y] = [rgb(a), rgb(b)]
  return hex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb)
}
const luminance = (h: string): number => {
  const [r, g, b] = rgb(h).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a: string, b: string): number => {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (haut + 0.05) / (bas + 0.05)
}

/** Couleurs de la fiche dérivées de l'accent : bandeau très assombri, chiffres et numéros à 4,5:1 sur blanc. */
export function paletteFiche(couleur: string | null | undefined): PaletteFiche {
  const brut = couleur && couleurValide(couleur) ? couleur.trim().toLowerCase() : COULEUR_PAR_DEFAUT
  let accent = brut
  while (contraste(accent, '#ffffff') < 4.5) accent = melange(accent, '#000000', 0.08)
  return {
    accent: brut,
    accent_texte: accent,
    bandeau: melange(brut, '#000000', 0.72),
    bandeau_texte: '#ffffff',
    accent_pale: melange(accent, '#ffffff', 0.94),
    accent_clair: melange(accent, '#ffffff', 0.86),
    encre: '#0b1220',
    texte: '#2b3543',
    discret: '#5d6a79',
    filet: '#c9d1db',
  }
}

/** Variables CSS posées sur la feuille : aucune couleur n'est écrite dans les composants. */
export function variablesFiche(p: PaletteFiche): Record<string, string> {
  return {
    '--f-accent': p.accent, '--f-accent-texte': p.accent_texte, '--f-bandeau': p.bandeau,
    '--f-bandeau-texte': p.bandeau_texte, '--f-pale': p.accent_pale, '--f-clair': p.accent_clair,
    '--f-encre': p.encre, '--f-texte': p.texte, '--f-discret': p.discret, '--f-filet': p.filet,
    // pastilles « sous-traitance » (ambre) et « cotraitance » / « particulier » (neutre) : mêmes valeurs que le Word
    '--f-ambre-fond': '#fbebcf', '--f-ambre-texte': '#8a5700', '--f-neutre-fond': '#eef1f5',
    '--f-papier': '#ffffff',
  }
}

/** Lignes d'une section : celles des données, puis les lignes libres du bordereau pour cette section. */
export function lignesDeSection(section: FicheSection, libres: LigneLibre[]): FicheLigne[] {
  return [...section.lignes, ...libres.filter((l) => l.section === section.id).map(({ libelle, valeur }) => ({ libelle, valeur }))]
    .filter(aUneValeur)
}

/** Une ligne sans valeur n'est jamais imprimée : ni libellé seul, ni tiret, ni « À renseigner » (comme dans le PDF et le Word). */
export const aUneValeur = (l: { valeur: string }): boolean => l.valeur.trim() !== '' && l.valeur.trim() !== '—'

/** Les tuiles de chiffres clés qui portent un chiffre ; une tuile sans valeur disparaît. */
export const tuilesAffichees = (tuiles: FicheTuile[]): FicheTuile[] => tuiles.filter((t) => t.valeur.trim() !== '' && t.valeur.trim() !== '—')

/** « 3 informations à renseigner dans Mon entreprise pour compléter cette fiche » ; chaîne vide quand il n'en reste aucune. */
export function phraseARenseigner(n: number): { avant: string; lien: string; apres: string } | null {
  if (!(n > 0)) return null
  return { avant: `${n} information${n > 1 ? 's' : ''} à renseigner dans `, lien: 'Mon entreprise', apres: ' pour compléter cette fiche' }
}

export function pageEstimee(donnees: FicheDonnees, numero = 1): string {
  return `Page ${numero} / ${Math.max(donnees.pages, 1)}`
}

/** Bordereau modifié par rapport à celui du serveur ? (les champs vides valent « valeur par défaut ») */
export function bordereauModifie(a: FicheBordereau, b: FicheBordereau): boolean {
  const cle = (x: FicheBordereau) => JSON.stringify([x.titre, x.sous_titre, x.contact, x.couleur.toLowerCase(), x.lignes_libres])
  return cle(a) !== cle(b)
}
