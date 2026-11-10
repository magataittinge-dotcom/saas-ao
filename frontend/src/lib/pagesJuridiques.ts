// Pages juridiques (`/legal/:slug`) : la liste des documents et la préparation du Markdown servi par public/legal/*.md.
// Le texte juridique n'est jamais récrit ici. Seule la mise en page change : le titre du document devient le `h1` de la page,
// et un champ que l'éditeur n'a pas encore renseigné (« [À COMPLÉTER…] » dans le fichier) ne s'affiche plus tel quel :
// à sa place, la mention reste lisible. Aucune mention légale n'est inventée.

export type SlugJuridique = 'mentions-legales' | 'cgu' | 'cgv' | 'politique-confidentialite' | 'cookies'

export const DOCUMENTS_JURIDIQUES: readonly { slug: SlugJuridique; libelle: string }[] = [
  { slug: 'mentions-legales', libelle: 'Mentions légales' },
  { slug: 'cgu', libelle: 'Conditions d’utilisation' },
  { slug: 'cgv', libelle: 'Conditions de vente' },
  { slug: 'politique-confidentialite', libelle: 'Confidentialité' },
  { slug: 'cookies', libelle: 'Cookies' },
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
