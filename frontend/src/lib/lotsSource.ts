// R8 — d'où vient un lot : une phrase que le patron comprend, jamais un mot isolé (« FICHIER »).
// Le serveur note la provenance de chaque lot dans `sources` (backend/services/lot_detector.py).
export const ETIQUETTES_SOURCE_LOT: Readonly<Record<string, string>> = {
  excel: 'Vu dans le tableau des prix',
  rc_table: 'Vu dans le règlement',
  rc_text: 'Vu dans le règlement',
  filename: 'Vu dans le nom d’une pièce',
  ia_fallback: 'Complété par IA',
}

/** Étiquettes distinctes, dans l'ordre d'arrivée, des sources connues (hors filet IA, affiché à part). */
export function etiquettesSourceLot(sources: readonly string[] | null | undefined): string[] {
  const phrases = (sources ?? []).filter((s) => s !== 'ia_fallback').map((s) => ETIQUETTES_SOURCE_LOT[s]).filter(Boolean)
  return [...new Set(phrases)]
}
