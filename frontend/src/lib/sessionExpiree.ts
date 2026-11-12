// Session expirée (audit du front, F-01). Quand le serveur répond 401, toute l'appli réagit d'une seule façon : on note
// la page d'où l'on vient, on ferme la session, et l'écran de connexion dit « Votre session a expiré… ». Après la
// connexion, on revient à cette page. Garde : une seule réaction par rafale de 401, et jamais deux en moins de
// DELAI_MIN_MS (si le serveur refuse encore juste après la reconnexion, les écrans montrent leur état d'erreur : pas de boucle).

import { cheminInterne } from '@/lib/adresseSure'

export const PHRASE_SESSION_EXPIREE = 'Votre session a expiré. Reconnectez-vous pour reprendre où vous en étiez.'
export const CLE_RETOUR = 'synorix.retour-connexion'
export const CLE_DERNIERE_EXPIRATION = 'synorix.session-expiree'
export const ADRESSE_SESSION_EXPIREE = '/login?session=expiree'
export const DELAI_MIN_MS = 30_000

interface Stockage {
  getItem(cle: string): string | null
  setItem(cle: string, valeur: string): void
  removeItem(cle: string): void
}

/** Une adresse de l'appli où l'on peut revenir : interne (`cheminInterne`), jamais la connexion ni l'inscription. */
export function adresseDeRetourValide(adresse: string | null | undefined): adresse is string {
  return cheminInterne(adresse) && !/^\/(login|register)(\/|\?|$)/.test(adresse) && adresse !== '/'
}

/**
 * La réaction au 401, à brancher sur l'intercepteur de réponse (`services/api.ts`). `adresse` rend la page affichée
 * (chemin + recherche), `sortir` ferme la session et mène à l'écran de connexion. Rend une fonction : vrai si elle a réagi.
 */
export function creerReactionSessionExpiree(dep: { stockage: () => Stockage; adresse: () => string; sortir: (vers: string) => void; maintenant?: () => number }): () => boolean {
  let enCours = false
  return () => {
    if (enCours) return false
    const maintenant = (dep.maintenant ?? Date.now)()
    try {
      const stockage = dep.stockage()
      const dernier = Number(stockage.getItem(CLE_DERNIERE_EXPIRATION))
      if (Number.isFinite(dernier) && dernier > 0 && maintenant - dernier < DELAI_MIN_MS) return false
      stockage.setItem(CLE_DERNIERE_EXPIRATION, String(maintenant))
      const adresse = dep.adresse()
      if (adresseDeRetourValide(adresse)) stockage.setItem(CLE_RETOUR, adresse)
    } catch {
      return false // sans stockage utilisable, pas de garde : on ne ferme pas la session
    }
    enCours = true
    dep.sortir(ADRESSE_SESSION_EXPIREE)
    return true
  }
}

/** La page où revenir après la connexion ; null s'il n'y en a pas. La lecture ne l'efface pas (voir `oublierRetour`). */
export function retourApresConnexion(stockage: Stockage): string | null {
  try {
    const adresse = stockage.getItem(CLE_RETOUR)
    return adresseDeRetourValide(adresse) ? adresse : null
  } catch {
    return null
  }
}

/** Une fois la session rouverte et le retour fait, on oublie la page : une connexion ordinaire mène à l'accueil. */
export function oublierRetour(stockage: Stockage): void {
  try {
    stockage.removeItem(CLE_RETOUR)
  } catch {
    // stockage indisponible : rien à oublier
  }
}
