// Contrôles du Compagnon sur le mémoire généré : uniquement des faits calculés
// sur le texte, jamais une appréciation inventée (1.3).
import type { MemoireContent } from '@/types'
import type { SectionMemoire } from '@/lib/memoireSections'

export type { SectionMemoire }

export interface SectionBreve extends SectionMemoire {
  mots: number
}

export const SEUIL_SECTION_BREVE = 100

/** Nombre de mots d'un texte Markdown (les signes de mise en forme ne comptent pas). */
export function compterMots(texte: string): number {
  return texte
    .replace(/[#>*_`|~[\]()-]+/g, ' ')
    .split(/\s+/)
    .filter((m) => /[\p{L}\p{N}]/u.test(m)).length
}

/** Sections rédigées de moins de `seuil` mots, dans l'ordre du document. */
export function sectionsBreves(
  content: MemoireContent,
  sections: readonly SectionMemoire[],
  seuil = SEUIL_SECTION_BREVE,
): SectionBreve[] {
  const resultat: SectionBreve[] = []
  for (const s of sections) {
    const texte = (content[s.part] as Record<string, string> | undefined)?.[s.cle]
    if (!texte || !texte.trim()) continue
    const mots = compterMots(texte)
    if (mots < seuil) resultat.push({ ...s, mots })
  }
  return resultat
}

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Tout le texte du mémoire, préambule compris. */
export function texteComplet(content: MemoireContent): string {
  const parties = [content.partie_a, content.partie_b, content.partie_c]
    .flatMap((p) => Object.values((p ?? {}) as Record<string, string>))
  return [content.preambule ?? '', ...parties].join('\n')
}

/** Références dont l'intitulé apparaît tel quel dans le texte (casse, accents et ponctuation ignorés). */
export function referencesRetrouvees<R extends { intitule: string }>(
  content: MemoireContent,
  references: readonly R[],
): { retrouvees: R[]; nonRetrouvees: R[] } {
  const texte = ` ${normaliser(texteComplet(content))} `
  const retrouvees: R[] = []
  const nonRetrouvees: R[] = []
  for (const r of references) {
    const intitule = normaliser(r.intitule)
    if (intitule && texte.includes(` ${intitule} `)) retrouvees.push(r)
    else nonRetrouvees.push(r)
  }
  return { retrouvees, nonRetrouvees }
}
