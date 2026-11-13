// B4 — les exigences de contenu technique du règlement, reliées au paragraphe du mémoire qui les traite (serveur :
// services/exigences_memoire.py, bloc `exigences` de GET /projects/:id/memoire/relecture). Recoupement de mots,
// déterministe, sans IA. Ici : le contrat et les mots de l'écran.

export type StatutExigence = 'traitee' | 'a_couvrir'

/** Où l'exigence (ou l'un de ses éléments) est traitée : l'ancre de la partie, son titre, le début du paragraphe. */
export interface LienExigence {
  statut: StatutExigence
  /** « Traitée » ou « À couvrir ». */
  libelle: string
  /** « preambule » ou « sec-<clé> » : les ancres de l'écran du mémoire. */
  ancre: string | null
  section: string | null
  paragraphe: number | null
  extrait: string | null
}

export interface LigneExigence extends LienExigence {
  id: string
  texte: string
  source: { type: 'exigence'; id: string; document?: string | null; page?: number | null } | null
  /** Une exigence qui énumère (« le mémoire présente : a, b, c ») : chaque élément a son état. */
  elements: (LienExigence & { texte: string })[]
}

export interface BlocExigences {
  lignes: LigneExigence[]
  traitees: number
  a_couvrir: number
}

/** « 5 exigences de contenu du règlement : 4 traitées, 1 à couvrir. » ; tout est traité : une phrase sobre. */
export function phraseExigences(b: Pick<BlocExigences, 'traitees' | 'a_couvrir'>): string {
  const total = b.traitees + b.a_couvrir
  if (b.a_couvrir === 0) {
    return total > 1
      ? `Les ${total} exigences de contenu du règlement sont traitées dans le mémoire.`
      : 'L’exigence de contenu du règlement est traitée dans le mémoire.'
  }
  const faits = [
    b.traitees > 0 ? `${b.traitees} ${b.traitees > 1 ? 'traitées' : 'traitée'}` : null,
    `${b.a_couvrir} à couvrir`,
  ].filter(Boolean).join(', ')
  return `${total} ${total > 1 ? 'exigences' : 'exigence'} de contenu du règlement : ${faits}.`
}

/** Ce qui reste à couvrir d'abord, puis ce qui est traité ; dans chaque groupe, l'ordre du règlement. */
export function rangerExigences<T extends { statut: StatutExigence }>(lignes: readonly T[]): T[] {
  return [...lignes.filter((l) => l.statut === 'a_couvrir'), ...lignes.filter((l) => l.statut !== 'a_couvrir')]
}
