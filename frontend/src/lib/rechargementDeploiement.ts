// Un onglet resté ouvert pendant un déploiement garde l'ancien index.html : il demande alors un
// morceau de code (assets/Xxx-<empreinte>.js) que le nouveau déploiement a retiré, et Vite lève
// `vite:preloadError`. On recharge la page UNE fois pour récupérer le nouvel index.html.
// Garde : l'heure du dernier rechargement automatique est posée dans sessionStorage AVANT de
// recharger ; si une nouvelle erreur survient moins de DELAI_MIN_MS après, on ne recharge pas
// (l'erreur suit son cours : jamais de boucle). Sans stockage utilisable, pas de garde, donc
// pas de rechargement.

export const CLE_RECHARGEMENT = 'synorix.rechargement-deploiement'
/** En deçà, une nouvelle erreur est celle d'après le rechargement : on ne recharge pas deux fois. */
export const DELAI_MIN_MS = 60_000

interface Stockage {
  getItem(cle: string): string | null
  setItem(cle: string, valeur: string): void
}

/** Réaction à `vite:preloadError` ; vrai si la page est rechargée (l'erreur n'est alors pas levée). */
export function reagirAuMorceauIntrouvable(
  evenement: { preventDefault(): void },
  stockage: Stockage,
  recharger: () => void,
  maintenant: number = Date.now(),
): boolean {
  try {
    const dernier = Number(stockage.getItem(CLE_RECHARGEMENT))
    if (Number.isFinite(dernier) && dernier > 0 && maintenant - dernier < DELAI_MIN_MS) return false
    stockage.setItem(CLE_RECHARGEMENT, String(maintenant))
  } catch {
    return false
  }
  evenement.preventDefault()
  recharger()
  return true
}

/** Branche la réaction sur la fenêtre (appelé une fois, au démarrage). */
export function installerRechargementDeploiement(fenetre: Window = window): void {
  fenetre.addEventListener('vite:preloadError', (evenement) => {
    let stockage: Storage
    try { stockage = fenetre.sessionStorage } catch { return }
    reagirAuMorceauIntrouvable(evenement, stockage, () => fenetre.location.reload())
  })
}
