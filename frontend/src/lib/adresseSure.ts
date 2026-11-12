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
