// Retrouver la pièce du DCE citée comme source d'une exigence (1.16).
// Jamais de repli sur « le premier document du dossier » : une source
// introuvable est dite introuvable, au lieu d'ouvrir une autre pièce
// présentée comme la source.

export interface PieceDossier {
  type: string
  file_name: string
}

export const PASSAGE_INTROUVABLE = 'Passage introuvable dans le dossier.'

export function trouverPieceCitee<D extends PieceDossier>(
  sourceDocument: string | null | undefined,
  pieces: readonly D[],
): D | null {
  const source = (sourceDocument || '').toLowerCase().trim()
  const base = source.replace(/\s*p\.?\s*\d+/gi, '').trim()
  if (!base) return null

  return pieces.find((doc) => {
    const type = doc.type.toLowerCase()
    const nom = doc.file_name.toLowerCase()

    if (base === type) return true
    if ((base === 'rc' || base === 'règlement de consultation' || base === 'reglement de consultation')
        && (type === 'rc' || nom.includes('règlement') || nom.includes('reglement') || nom.includes('_rc') || nom.includes(' rc'))) return true
    if (base === 'cctp' && (type === 'cctp' || nom.includes('cctp'))) return true
    if (base === 'ccap' && nom.includes('ccap')) return true
    if (base === 'dpgf' && (type === 'dpgf' || nom.includes('dpgf'))) return true
    if ((base === 'ae' || base === "acte d'engagement" || base === 'acte_engagement' || base === 'attri1' || base === 'attri')
        && (type === 'acte_engagement' || nom.includes('engagement') || nom.includes('attri'))) return true
    if (base === 'dc1' && nom.includes('dc1')) return true
    if (base === 'dc2' && nom.includes('dc2')) return true
    if (base === 'bpu' && nom.includes('bpu')) return true
    if (base === 'cadre de réponse' && nom.includes('cadre')) return true
    if (base.length > 2 && nom.includes(base)) return true

    return false
  }) ?? null
}
