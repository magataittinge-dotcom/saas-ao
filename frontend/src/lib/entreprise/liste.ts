// Mon entreprise — listes éditables (équipe, qualifications, références) : une ligne existante garde son id,
// une ligne neuve n'en a pas ; à l'enregistrement on en tire ce qu'il faut créer, modifier et supprimer.
// Fonctions pures : le plan se calcule et se teste sans réseau.

export interface LigneEditable<T> { cle: string; id?: string; valeurs: T }

export function lignesDepuis<T extends { id: string }>(serveur: T[] | null | undefined): LigneEditable<T>[] {
  return (serveur ?? []).map((v) => ({ cle: v.id, id: v.id, valeurs: v }))
}

export interface Plan<T> {
  crees: Partial<T>[]
  modifies: { id: string; changements: Partial<T> }[]
  supprimes: string[]
}

const egal = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const vide = (v: unknown): boolean => v === undefined || v === null || v === ''

/**
 * Plan d'enregistrement d'une liste.
 * - `champs` : les champs modifiables (les autres, comme l'id ou l'organisation, ne partent jamais) ;
 * - `obligatoire` : une ligne neuve sans ce champ est ignorée (ligne laissée vide) ;
 * - une ligne existante dont le champ obligatoire est vidé n'est pas modifiée.
 */
export function planifier<T extends { id: string }>(
  serveur: T[] | null | undefined,
  lignes: LigneEditable<Partial<T>>[],
  champs: (keyof T)[],
  obligatoire: keyof T,
): Plan<T> {
  const connus = new Map((serveur ?? []).map((s) => [s.id, s]))
  const plan: Plan<T> = { crees: [], modifies: [], supprimes: [] }
  for (const l of lignes) {
    if (!l.id) {
      if (vide(l.valeurs[obligatoire])) continue
      const corps: Partial<T> = {}
      for (const c of champs) if (!vide(l.valeurs[c])) corps[c] = l.valeurs[c]
      plan.crees.push(corps)
      continue
    }
    const avant = connus.get(l.id)
    if (!avant || vide(l.valeurs[obligatoire])) continue
    const changements: Partial<T> = {}
    for (const c of champs) {
      const apres = l.valeurs[c]
      if (!egal(apres, avant[c]) && !(vide(apres) && vide(avant[c]))) changements[c] = (vide(apres) ? (typeof avant[c] === 'string' ? '' : null) : apres) as T[keyof T]
    }
    if (Object.keys(changements).length) plan.modifies.push({ id: l.id, changements })
  }
  const gardes = new Set(lignes.map((l) => l.id).filter(Boolean))
  for (const id of connus.keys()) if (!gardes.has(id)) plan.supprimes.push(id)
  return plan
}

export const planVide = (p: Plan<unknown>): boolean => !p.crees.length && !p.modifies.length && !p.supprimes.length
