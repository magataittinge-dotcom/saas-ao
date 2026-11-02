// La visite de la veille se pose à la sortie de l'accueil. À la déconnexion, le démontage de l'écran arrive
// après la fermeture de la session : la requête partait sans jeton (401) et le compteur « nouveaux avis »
// ne se remettait jamais à zéro. L'écran enregistre donc ici sa visite ; la déconnexion la pose avant de
// fermer la session, et le démontage ne la pose que si elle n'est pas déjà partie.
type Visite = () => Promise<void>

let enAttente: Visite | null = null

/** Enregistre la visite à poser ; renvoie la fonction qui la retire. */
export function enregistrerVisite(poser: Visite): () => void {
  enAttente = poser
  return () => { if (enAttente === poser) enAttente = null }
}

/** Pose la visite enregistrée (une seule fois). Un échec ou un délai dépassé ne bloque jamais la suite. */
export async function poserVisiteAvantSortie(delaiMs = 2000): Promise<void> {
  const poser = enAttente
  enAttente = null
  if (!poser) return
  await Promise.race([
    poser().catch(() => {}),
    new Promise<void>((r) => setTimeout(r, delaiMs)),
  ])
}
