// Carte IGN du siège (« Mon entreprise », D3) : le serveur compose la carte (services/maps_service, Plan IGN v2,
// sans clé ni coût) à partir de l'adresse ENREGISTRÉE de l'entreprise ; il rend du JSON, ou 204 quand il n'y a rien à montrer.

export interface ReponseCarteSiege { image_base64: string; legende: string }

/** Une adresse trop courte n'est pas envoyée au géocodeur. */
export const adresseCartographiable = (adresse: unknown): adresse is string =>
  typeof adresse === 'string' && adresse.trim().length > 5

/** La réponse du serveur, ou null (204, corps vide ou forme inattendue : le bloc carte n'est pas affiché). */
export function lireCarteSiege(donnees: unknown): ReponseCarteSiege | null {
  if (!donnees || typeof donnees !== 'object') return null
  const { image_base64: image, legende } = donnees as Record<string, unknown>
  return typeof image === 'string' && image !== '' && typeof legende === 'string' ? { image_base64: image, legende } : null
}

export const sourceImage = (carte: ReponseCarteSiege): string => `data:image/png;base64,${carte.image_base64}`
