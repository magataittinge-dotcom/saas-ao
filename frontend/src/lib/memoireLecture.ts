// R31 — « pas encore de mémoire » : le serveur répond 204 (corps vide) à GET /projects/{id}/memoire, pas 404.
// 204 (ou un corps vide) se lit comme « pas encore de mémoire » ; toute autre erreur reste une erreur.
export function memoireDepuisReponse<T>(statut: number, donnees: unknown): T | null {
  if (statut === 204) return null
  if (donnees === '' || donnees === null || donnees === undefined) return null
  return donnees as T
}
