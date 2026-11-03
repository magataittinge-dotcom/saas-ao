// Le plan signale les parties qui se recoupent : deux parties gardées qui servent le même sous-critère du règlement et dont les
// titres se ressemblent. Comparaison simple, sans IA : mots pliés (minuscules, sans accents), pluriels ramenés au singulier,
// mots vides retirés. Deux titres sont proches s'ils ont un mot significatif en commun (ce qui couvre « l'un est inclus
// dans l'autre »). Rien n'est retiré par ce calcul : l'écran propose seulement un lien.
import { parGroupe, type PartiePlan } from '@/lib/planMemoire'

const MOTS_VIDES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'au', 'aux', 'a', 'en', 'un', 'une', 'pour', 'par', 'sur', 'dans', 'avec', 'ou',
  'ce', 'ces', 'son', 'sa', 'ses', 'notre', 'nos', 'votre',
  'dedie', 'dediee', 'detaille', 'detaillee', 'complet', 'complete', 'propre', 'specifique', 'general', 'generale',
])

const plier = (texte: string): string =>
  texte.replace(/[’‘]/g, "'").toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Un pluriel simple ramené au singulier (« matériels » → « materiel »). */
const singulier = (mot: string): string => (mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot)

/** Les mots significatifs d'un titre : pliés, au singulier, sans mot vide ni mot de moins de trois lettres. */
export function motsSignificatifs(titre: string): Set<string> {
  const mots = plier(titre).split(/[^a-z0-9]+/).filter(Boolean)
  const gardes = new Set<string>()
  for (const m of mots) {
    const s = singulier(m)
    if (s.length < 3 || MOTS_VIDES.has(m) || MOTS_VIDES.has(s)) continue
    gardes.add(s)
  }
  return gardes
}

export function titresProches(a: string, b: string): boolean {
  const ma = motsSignificatifs(a)
  const mb = motsSignificatifs(b)
  if (ma.size === 0 || mb.size === 0) return false
  for (const m of ma) if (mb.has(m)) return true
  return false
}

const sousCriteres = (p: PartiePlan): Set<string> => new Set(p.sous_criteres.map((s) => `${s.critere}|${s.nom}`))

/**
 * Pour chaque partie gardée qui recoupe une partie gardée PLUS HAUT sur l'écran (A, B, C puis l'ordre du plan) : la première
 * partie qui lui ressemble et sert le même sous-critère. La clé du résultat est la partie signalée (la seconde).
 */
export function recoupements(parties: readonly PartiePlan[]): Map<string, { cle: string; titre: string }> {
  const ordre = parGroupe(parties.filter((p) => !p.retiree)).flatMap((g) => g.parties)
  const resultat = new Map<string, { cle: string; titre: string }>()
  ordre.forEach((courante, i) => {
    const siens = sousCriteres(courante)
    if (siens.size === 0) return
    const avant = ordre.slice(0, i).find((q) => {
      if (!titresProches(q.titre, courante.titre)) return false
      for (const s of sousCriteres(q)) if (siens.has(s)) return true
      return false
    })
    if (avant) resultat.set(courante.cle, { cle: avant.cle, titre: avant.titre })
  })
  return resultat
}
