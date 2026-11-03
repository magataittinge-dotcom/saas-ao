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

/** R9 — lots cités dans le dossier mais non proposés : le serveur donne les comptes, jamais les noms. */
export interface LotsEcartes {
  /** Cités dans le dossier, mais qui ne figurent pas dans la liste des lots du règlement. */
  hors_liste: number
  /** Cités sans intitulé exploitable. */
  sans_intitule: number
  /** Le plafond de lectures assistées de l'entreprise était atteint : la liste vient de la lecture directe des pièces. */
  ia_plafond?: 'jour' | 'mois'
}

/** Une ligne sobre sous le compte des lots (null quand rien n'est écarté). Aucun nom de lot : le serveur n'en donne pas. */
export function phraseLotsEcartes(e: Partial<LotsEcartes> | null | undefined): string | null {
  const horsListe = Math.max(0, Math.trunc(e?.hors_liste ?? 0))
  const sansIntitule = Math.max(0, Math.trunc(e?.sans_intitule ?? 0))
  const phrases: string[] = []
  if (horsListe > 0) {
    phrases.push(horsListe === 1
      ? '1 autre lot cité dans le dossier ne figure pas dans la liste du règlement : il n’est pas proposé.'
      : `${horsListe} autres lots cités dans le dossier ne figurent pas dans la liste du règlement : ils ne sont pas proposés.`)
  }
  if (sansIntitule > 0) {
    phrases.push(sansIntitule === 1
      ? '1 autre lot cité sans intitulé n’est pas proposé.'
      : `${sansIntitule} autres lots cités sans intitulé ne sont pas proposés.`)
  }
  if (e?.ia_plafond === 'jour' || e?.ia_plafond === 'mois') {
    phrases.push(`Le plafond de lectures assistées du ${e.ia_plafond === 'mois' ? 'mois' : 'jour'} est atteint : la liste vient de la lecture directe des pièces. Vous pouvez ajouter un lot à la main.`)
  }
  return phrases.length ? phrases.join(' ') : null
}
