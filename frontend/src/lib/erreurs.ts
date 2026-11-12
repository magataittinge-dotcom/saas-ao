// Message d'erreur à montrer à l'utilisateur (1.16) : celui du serveur quand
// il explique un refus (4xx, ou 503 « indisponible »), y compris dans une
// réponse binaire (exports), 507 compris ; sinon — panne 5xx, message générique ou
// technique — le message calme et précis fourni par l'écran.
import axios from 'axios'

export async function messageErreur(err: unknown, defaut: string): Promise<string> {
  if (!axios.isAxiosError(err)) return defaut
  const statut = err.response?.status ?? 0
  // 503 « indisponible » et 507 « disque presque plein » (dépôts) expliquent un refus ; les autres 5xx sont des pannes.
  if (statut >= 500 && statut !== 503 && statut !== 507) return defaut
  let donnees: unknown = err.response?.data
  if (typeof Blob !== 'undefined' && donnees instanceof Blob) {
    try {
      donnees = JSON.parse(await donnees.text())
    } catch {
      return defaut
    }
  }
  const detail = (donnees as { detail?: unknown } | undefined)?.detail
  return typeof detail === 'string' && detail.trim() ? detail : defaut
}

/**
 * P2-9 : ce qu'une erreur laisse dans la console. Jamais l'objet entier : celui d'axios porte sa configuration, l'en-tête
 * `Authorization: Bearer …` et l'adresse demandée compris. Le statut HTTP, le code réseau ou le nom de l'erreur, seulement.
 */
export function resumeErreur(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response ? `HTTP ${err.response.status}` : (err.code ?? 'réseau')
  return err instanceof Error ? err.name : 'erreur'
}
