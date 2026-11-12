// Adresses sûres (P0-1 de REVUE-FRONT). Toute navigation qui reçoit une adresse venue de la barre d'adresse, du stockage
// du navigateur ou du serveur passe par ici. react-router suit par `window.location` une adresse « absolue »
// (`javascript:`, `//hote`, `/\hote`, `https://hote`) : on ne lui donne jamais qu'un chemin de l'appli.

const controle = (c: string) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f

function cheminSimple(adresse: string): boolean {
  return adresse.startsWith('/') && adresse[1] !== '/' && !adresse.includes('\\') && ![...adresse].some(controle)
}

/**
 * Un chemin de l'appli (`/…`) : jamais un schéma (`javascript:`, `data:`, `https:`), un hôte (`//hote`, `/\hote`), une
 * barre oblique inverse ni un caractère de contrôle, ni sous sa forme brute ni une fois décodée (`/%2F%2Fhote`).
 */
export function cheminInterne(adresse: string | null | undefined): adresse is string {
  if (typeof adresse !== 'string' || !cheminSimple(adresse)) return false
  try {
    return cheminSimple(decodeURIComponent(adresse))
  } catch {
    return false // encodage invalide : refusé
  }
}

/** Les étapes routées d'un AO (routes/Project.tsx) ; sans import, pour ne pas tirer lib/intelligence dans services/api. */
export const ETAPES_AO = ['upload', 'lots', 'analysis', 'verification', 'plan', 'memoire', 'export'] as const
const ETAPES = ETAPES_AO.join('|')
const ETAPE_AO = new RegExp(`^/projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:${ETAPES})$`)

/** L'adresse d'une étape d'un AO, et rien d'autre : `/projects/<uuid>/<étape connue>` (retour du coffre-fort). */
export function adresseEtapeAO(adresse: string | null | undefined): adresse is string {
  return cheminInterne(adresse) && ETAPE_AO.test(adresse)
}

const HOTES_STRIPE = new Set(['checkout.stripe.com', 'billing.stripe.com'])

/** Une page de paiement ou d'abonnement de Stripe (adresse rendue par /stripe/create-checkout-session ou /stripe/portal). */
export function adresseStripe(adresse: string | null | undefined): adresse is string {
  if (typeof adresse !== 'string') return false
  try {
    const u = new URL(adresse)
    return u.protocol === 'https:' && HOTES_STRIPE.has(u.hostname) && !u.username && !u.password && !u.port
  } catch {
    return false
  }
}

/** Mène le client chez Stripe ; une autre adresse lève une erreur (l'écran montre son message d'échec habituel). */
export function allerChezStripe(adresse: unknown): void {
  if (typeof adresse !== 'string' || !adresseStripe(adresse)) throw new Error('Adresse de paiement refusée')
  window.location.href = adresse
}

/**
 * P2-4 : une pièce dont le serveur rend une adresse http(s) complète s'ouvre dans un onglet sans lien vers Synorix
 * (`noopener` : pas de window.opener ; `noreferrer` : pas d'adresse d'origine). Toute autre adresse est refusée.
 */
export function ouvrirOngletExterne(adresse: string): boolean {
  let u: URL
  try {
    u = new URL(adresse)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  window.open(u.href, '_blank', 'noopener,noreferrer')
  return true
}

const TYPES_AFFICHABLES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * P2-3 : le type d'un Blob montré dans un onglet de même origine. PDF et images matricielles seulement ; tout le reste
 * (HTML, SVG, XML…) devient des octets à télécharger, jamais un document qui s'exécuterait dans l'origine de Synorix.
 */
export function typeAffichable(type: string): string {
  return TYPES_AFFICHABLES.has(type) ? type : 'application/octet-stream'
}
