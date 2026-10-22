// Message d'erreur à montrer à l'utilisateur (1.16) : celui du serveur quand
// il explique un refus (4xx, ou 503 « indisponible »), y compris dans une
// réponse binaire (exports) ; sinon — panne 5xx, message générique ou
// technique — le message calme et précis fourni par l'écran.
import axios from 'axios'

export async function messageErreur(err: unknown, defaut: string): Promise<string> {
  if (!axios.isAxiosError(err)) return defaut
  const statut = err.response?.status ?? 0
  if (statut >= 500 && statut !== 503) return defaut
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
