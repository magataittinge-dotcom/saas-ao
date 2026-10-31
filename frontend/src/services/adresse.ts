// API Adresse (api-adresse.data.gouv.fr, service public, gratuit, sans clé) : communes et codes postaux.
// Appel direct du navigateur avec fetch : surtout pas l'instance `api` (elle joindrait le jeton de connexion
// à une requête qui part chez un tiers). Rien d'autre que la saisie n'est envoyé.
import { nettoyerRequete, type FeatureAdresse } from '@/lib/veille'

const URL_ADRESSE = 'https://api-adresse.data.gouv.fr/search/'

export type ChercherCommunes = (q: string, signal: AbortSignal) => Promise<FeatureAdresse[]>

export const chercherCommunes: ChercherCommunes = async (q, signal) => {
  const texte = nettoyerRequete(q)
  if (texte.length < 2) return []
  const params = new URLSearchParams({ q: texte, limit: '5', type: 'municipality' })
  const r = await fetch(`${URL_ADRESSE}?${params.toString()}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!r.ok) throw new Error(`API Adresse : ${r.status}`)
  const json = (await r.json()) as { features?: FeatureAdresse[] }
  return json.features ?? []
}
