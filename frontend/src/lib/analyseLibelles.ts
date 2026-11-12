// Phrases de l'écran d'analyse (R16) : ce que sont les exigences, et pourquoi tous les documents du DCE ne sont pas analysés.
// La répartition des documents reprend la règle du serveur (services/document_tagger.py, get_documents_for_lot) :
// pièces communes (« all », lot 0, sans étiquette) et pièces du lot choisi analysées ; pièces « info » (plans,
// diagnostics…) et pièces d'autres lots écartées.

interface PieceEtiquetee { related_lots?: string[] | null }

const normaliser = (s: string) => {
  let t = s.trim().toLowerCase()
  if (t.startsWith('lot')) t = t.slice(3).replace(/^[_\- ]+/, '')
  return t.replace(/^0+(?=\d)/, '')
}

/** Même règle que `rattache_au_lot` : « 01a » se rattache au lot 01 si le RC ne définit pas 01a comme lot. */
function rattache(etiquette: string, cible: string, lotsDuRc: readonly string[] | null): boolean {
  const t = normaliser(etiquette)
  if (t === cible) return true
  const sousLot = /^(\d+)[a-z]$/.exec(t)
  if (!sousLot || sousLot[1] !== cible || lotsDuRc === null) return false
  return !lotsDuRc.some((l) => l && normaliser(l) === t)
}

export function repartirDocuments<T extends PieceEtiquetee>(documents: readonly T[], lotChoisi: string, lotsDuRc: readonly string[] | null = null) {
  const cible = normaliser(lotChoisi)
  const analyses: T[] = []
  const informations: T[] = []
  const autresLots: T[] = []
  for (const d of documents) {
    const tags = d.related_lots
    if (!tags || tags.length === 0 || tags.includes('all') || tags.some((t) => normaliser(t) === '0')) analyses.push(d)
    else if (tags.every((t) => t === 'info')) informations.push(d)
    else if (tags.some((t) => t !== 'info' && rattache(t, cible, lotsDuRc))) analyses.push(d)
    else autresLots.push(d)
  }
  return { analyses, informations, autresLots }
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`

export function phraseDocumentsAnalyses({ analyses, informations, autresLots }: { analyses: number; informations: number; autresLots: number }) {
  const ecartes = informations + autresLots
  const principale = `${analyses} ${analyses > 1 ? 'documents analysés' : 'document analysé'} sur ${analyses + ecartes}`
  if (ecartes === 0) return { principale, detail: '' }
  const un = ecartes === 1
  const parts: string[] = []
  if (informations > 0) parts.push(un ? 'c’est une pièce d’information (plan, diagnostic…)' : informations === 1 ? '1 est une pièce d’information (plan, diagnostic…)' : `${informations} sont des pièces d’information (plans, diagnostics…)`)
  if (autresLots > 0) parts.push(un ? 'il concerne un autre lot' : autresLots === 1 ? '1 concerne un autre lot' : `${autresLots} concernent d’autres lots`)
  const debut = un ? 'L’autre document ne sert pas à ce lot' : `Les ${ecartes} autres documents ne servent pas à ce lot`
  return { principale, detail: `${debut} : ${parts.join(' et ')}.` }
}

/** Sous le grand chiffre des exigences : « obligatoire » dit en clair ce que l'acheteur attend. */
export function phraseExigences(total: number, obligatoires: number): string {
  const souhaitees = total - obligatoires
  if (total > 0 && souhaitees === 0) return total === 1 ? 'À respecter impérativement' : 'Toutes à respecter impérativement'
  if (obligatoires === 0) return total === 1 ? 'Souhaitée par l’acheteur' : 'Toutes souhaitées par l’acheteur'
  return `${obligatoires} à respecter impérativement · ${pluriel(souhaitees, 'souhaitée')} par l’acheteur`
}

/**
 * Un refus du serveur dit en mots du logiciel (« Service IA momentanément indisponible — réessayez… ») : à l'écran c'est
 * Synorix qui parle (jury, tour 1 : « Service IA : mot du logiciel ; partout ailleurs c'est Synorix »). Affichage seulement.
 */
export function sansJargonIA(message: string): string {
  return message
    .replace(/Service IA momentanément indisponible\s*[—–-]\s*r/g, 'Synorix est momentanément indisponible. R')
    .replace(/Service IA momentanément indisponible/g, 'Synorix est momentanément indisponible')
}

/** Les titres des deux listes du détail : toujours « documents », le mot de la phrase qui les annonce (jamais « pièces » à dix lignes d'écart). */
export function titresDetailDocuments(analyses: number, ecartes: number): { analyses: string; ecartes: string } {
  return {
    analyses: `${analyses} ${analyses > 1 ? 'documents analysés' : 'document analysé'} pour ce lot`,
    ecartes: `${ecartes} ${ecartes > 1 ? 'documents laissés' : 'document laissé'} de côté`,
  }
}
