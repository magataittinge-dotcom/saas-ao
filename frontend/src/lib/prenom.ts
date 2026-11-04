/**
 * Le prénom à afficher dans « Bonjour, … » : celui du profil s'il existe, sinon rien (« Bonjour » seul). Jamais le début de
 * l'e-mail : quand le compte n'a pas de nom, le serveur garde la partie de l'adresse avant l'@ (« maga.taittinge »).
 */
export function prenomAffichable(nom: string | null | undefined, email?: string | null): string | null {
  const brut = (nom ?? '').trim()
  if (!brut || brut.includes('@')) return null
  const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const debutEmail = (email ?? '').split('@')[0]
  if (debutEmail && sansAccent(brut) === sansAccent(debutEmail)) return null
  const premier = brut.split(/\s+/)[0]
  // un seul mot collé à des points, tirets bas ou chiffres : un identifiant, pas un prénom
  if (/[._\d]/.test(premier) && !brut.includes(' ')) return null
  return premier
}
