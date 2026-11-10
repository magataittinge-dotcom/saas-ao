/**
 * La raison sociale à afficher (menu du compte, pastille de l'accueil) : le nom de l'organisation seulement quand son SIRET
 * a été vérifié au répertoire Sirene. Sinon « Mon entreprise » : à la création, le serveur nomme l'organisation d'après le
 * compte (souvent le début de l'e-mail), et ce nom-là ne doit jamais passer pour celui de l'entreprise.
 */
export const RAISON_SOCIALE_PAR_DEFAUT = 'Mon entreprise'

export function raisonSociale(organisation: { name?: string | null; siret_verified?: boolean | null } | null | undefined): string {
  const nom = (organisation?.name ?? '').trim()
  if (!organisation?.siret_verified || !nom || nom.includes('@')) return RAISON_SOCIALE_PAR_DEFAUT
  return nom
}

/** L'initiale du compte : celle du prénom affichable (lib/prenom.ts), sinon rien (le rond montre alors une icône de personne).
 *  Jamais un tiret, jamais l'initiale de l'e-mail. */
export function initialeDuPrenom(prenom: string | null | undefined): string | null {
  const p = (prenom ?? '').trim()
  return p ? p[0].toLocaleUpperCase('fr-FR') : null
}
