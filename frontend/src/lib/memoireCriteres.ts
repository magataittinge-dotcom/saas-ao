// Sous-critères du RC rattachés aux parties du mémoire (E1). Le calcul est fait par le serveur
// (backend/services/memoire_criteres.py, sans IA) ; ici seulement la lecture de sa réponse.

export interface SousCritereRattache {
  critere: string
  nom: string
  poids: number | null
  /** « partie_b.dechets » : même clé que `${part}.${cle}` de lib/memoireSections. */
  sections: string[]
  traite: boolean
}

export interface ACouvrir {
  critere: string
  nom: string
  poids: number | null
}

export interface RattachementCriteres {
  sous_criteres: SousCritereRattache[]
  a_couvrir: ACouvrir[]
}

/** « Moyens humains · 10 % » (espace insécable avant le pourcentage). */
export function libelleSousCritere(nom: string, poids: number | null | undefined): string {
  return poids == null ? nom : `${nom} · ${poids} %`
}

/** Les sous-critères traités par chaque sous-section, dans l'ordre du RC. */
export function parSection(r: RattachementCriteres | null | undefined): Record<string, SousCritereRattache[]> {
  const sortie: Record<string, SousCritereRattache[]> = {}
  for (const s of r?.sous_criteres ?? []) {
    for (const cle of s.sections) (sortie[cle] ??= []).push(s)
  }
  return sortie
}

/** « 3 sur 4 sous-critères traités » ; null s'il n'y a rien à compter. */
export function bilanCriteres(r: RattachementCriteres | null | undefined): string | null {
  const total = r?.sous_criteres.length ?? 0
  if (total === 0) return null
  const traites = total - (r?.a_couvrir.length ?? 0)
  return `${traites} sur ${total} sous-critère${total > 1 ? 's' : ''} du règlement traité${traites > 1 ? 's' : ''}`
}
