// Pages juridiques (`/legal/:slug`) : la liste des documents et la préparation du Markdown servi par public/legal/*.md.
// Le texte juridique n'est jamais récrit ici. Seule la mise en page change : le titre du document devient le `h1` de la page,
// et un champ que l'éditeur n'a pas encore renseigné (« [À COMPLÉTER…] » dans le fichier) ne s'affiche plus tel quel :
// à sa place, la mention reste lisible. Aucune mention légale n'est inventée.

export type SlugJuridique = 'mentions-legales' | 'cgu' | 'cgv' | 'politique-confidentialite' | 'cookies'

/** `libelle` : le nom court (onglet, pied de page). `titre` : le `h1` de la page, en casse de phrase, le même nom en entier. */
export const DOCUMENTS_JURIDIQUES: readonly { slug: SlugJuridique; libelle: string; titre: string }[] = [
  { slug: 'mentions-legales', libelle: 'Mentions légales', titre: 'Mentions légales' },
  { slug: 'cgu', libelle: 'Conditions d’utilisation', titre: 'Conditions générales d’utilisation' },
  { slug: 'cgv', libelle: 'Conditions de vente', titre: 'Conditions générales de vente' },
  { slug: 'politique-confidentialite', libelle: 'Confidentialité', titre: 'Politique de confidentialité' },
  { slug: 'cookies', libelle: 'Cookies', titre: 'Politique de gestion des cookies' },
]

export const estSlugJuridique = (slug: string | undefined): slug is SlugJuridique => DOCUMENTS_JURIDIQUES.some((d) => d.slug === slug)

export const MENTION_EN_ATTENTE = 'Information en cours d’enregistrement'

const CHAMP = /\[À COMPLÉTER[^\]]*\]/g

/** Remplace chaque champ à renseigner par la mention lisible (en minuscule au milieu d'une phrase). */
export function sansChampsACompleter(markdown: string): string {
  return markdown.replace(CHAMP, (_champ, position: number) => {
    const avant = markdown.slice(0, position).trimEnd().slice(-1)
    const dansLaPhrase = /[a-zà-ÿ,(]/.test(avant)
    return dansLaPhrase ? MENTION_EN_ATTENTE.toLowerCase() : MENTION_EN_ATTENTE
  })
}

/** Les lignes du fichier qui portent encore un champ à renseigner (numéro de ligne et texte), pour le suivi. */
export function champsACompleter(markdown: string): { ligne: number; texte: string }[] {
  return markdown.split('\n').flatMap((texte, i) => (/\[À COMPLÉTER/.test(texte) ? [{ ligne: i + 1, texte: texte.trim() }] : []))
}

/** Le titre du document (sa première ligne « # … ») et le reste, champs à renseigner remplacés. */
export function preparerDocument(markdown: string): { titre: string | null; corps: string } {
  const propre = sansChampsACompleter(markdown.replace(/^﻿/, ''))
  const m = propre.match(/^\s*# +(.+?)\s*(?:\r?\n|$)/)
  return m ? { titre: m[1].trim(), corps: propre.slice(m[0].length) } : { titre: null, corps: propre }
}

/** L'ancre d'un titre d'article (« 4. Offres et prix » → `4-offres-et-prix`) : le sommaire y mène. */
export const ancreDe = (titre: string): string =>
  titre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Le sommaire d'un document : ses titres d'article (« ## … »), dans l'ordre, sans le balisage. */
export function sommaireDe(corps: string): { ancre: string; titre: string }[] {
  return [...corps.matchAll(/^## +(.+?)\s*$/gm)].map((m) => {
    const titre = m[1].replace(/[*_`]/g, '').trim()
    return { ancre: ancreDe(titre), titre }
  })
}

const MISE_A_JOUR = /^\s*\*\*(Dernière mise à jour\s*:[^*\n]*)\*\*\s*$/m
const LIGNE_DEFINITION = /^- \*\*(.+?)\s*:\*\*\s*(.+)$/

export type BlocJuridique = { type: 'texte'; texte: string } | { type: 'definitions'; lignes: { terme: string; valeur: string }[] }

/**
 * Mise en page seulement, aucun mot récrit : la date de mise à jour sort du corps (elle devient la sous-ligne du titre),
 * l'apostrophe droite devient courbe, le pictogramme d'alerte en couleur part (le ton interdit l'alarme, la phrase suffit),
 * et la mention d'attente est balisée pour être dessinée comme un champ et non comme un mot de la phrase.
 */
/**
 * Ce que la mise en page doit au texte sans le récrire (jury, tour 3) : une adresse électronique est un lien, et une référence
 * d'article (« art. L. 123-22 », « art. 6.1.b ») ne se coupe ni à son espace ni à son trait d'union.
 */
export function affinerTexte(texte: string): string {
  return texte
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gm, (_t, avant: string, adresse: string) => avant + '[' + adresse + '](mailto' + ':' + adresse + ')')
    .replace(/\bart\. (?:[LRD]\. )?\d[\d.-]*\w*/g, (ref) => ref.replace(/ /g, '\u00a0').replace(/-/g, '\u2011'))
}

export function mettreEnPage(corps: string): { miseAJour: string | null; corps: string } {
  const m = corps.match(MISE_A_JOUR)
  const sansDate = m ? corps.replace(MISE_A_JOUR, '') : corps
  const propre = sansDate
    .replace(/(?<=\p{L})'(?=\p{L})/gu, '’')
    .replace(/\u26A0\uFE0F?\s*/g, '')
    // devant une ponctuation, le champ se resserre à droite (jury, tour 3 : « [champ] , cf. » se lisait avec une espace)
    .replace(new RegExp(MENTION_EN_ATTENTE, 'gi'), (mention, ...reste) => {
      const [position, tout] = reste.slice(-2) as [number, string]
      return `[${mention}](#en-attente${/^[,.;)]/.test(tout.slice(position + mention.length)) ? '-ponctuation' : ''})`
    })
  return { miseAJour: m ? m[1].replace(/\s*:\s*/, ' : ').trim() : null, corps: propre }
}

/** Une liste « - **Libellé :** valeur » d'au moins trois lignes devient une liste de définitions (valeurs alignées). */
export function decouperDefinitions(texte: string): BlocJuridique[] {
  const blocs: BlocJuridique[] = []
  let courant: string[] = []
  const vider = () => { if (courant.join('').trim() !== '') blocs.push({ type: 'texte', texte: courant.join('\n') }); courant = [] }
  const lignes = texte.split('\n')
  let i = 0
  while (i < lignes.length) {
    const serie: { terme: string; valeur: string }[] = []
    let j = i
    while (j < lignes.length) {
      const d = lignes[j].match(LIGNE_DEFINITION)
      if (d) { serie.push({ terme: d[1].trim(), valeur: d[2].trim() }); j++ }
      else if (serie.length > 0 && /^ {2,}\S/.test(lignes[j])) { serie[serie.length - 1].valeur += ` ${lignes[j].trim()}`; j++ }
      else break
    }
    const finDeListe = j >= lignes.length || !/^- /.test(lignes[j])
    if (serie.length >= 3 && finDeListe) { vider(); blocs.push({ type: 'definitions', lignes: serie }); i = j }
    else { courant.push(lignes[i]); i++ }
  }
  vider()
  return blocs
}
