import { useCallback, useEffect, useRef, useState } from 'react'
import { lignesDepuis, type LigneEditable } from '@/lib/entreprise/liste'

/**
 * Copie de travail d'une liste du serveur (équipe, qualifications, références) : ajouter, modifier, retirer
 * des lignes sans rien envoyer ; l'enregistrement de la rubrique en tire le plan (lib/entreprise/liste.ts).
 * La copie repart des données du serveur quand elles changent.
 */
export function useLignesEditables<T extends { id: string }>(source: T[] | null | undefined) {
  const [lignes, setLignes] = useState<LigneEditable<Partial<T>>[]>(() => lignesDepuis(source) as LigneEditable<Partial<T>>[])
  const compteur = useRef(0)
  useEffect(() => { setLignes(lignesDepuis(source) as LigneEditable<Partial<T>>[]) }, [source])

  const ajouter = useCallback((valeurs: Partial<T>) => {
    compteur.current += 1
    setLignes((l) => [...l, { cle: `neuf-${compteur.current}`, valeurs }])
  }, [])
  const modifier = useCallback((cle: string, changements: Partial<T>) => {
    setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, valeurs: { ...x.valeurs, ...changements } } : x)))
  }, [])
  const retirer = useCallback((cle: string) => setLignes((l) => l.filter((x) => x.cle !== cle)), [])
  return { lignes, ajouter, modifier, retirer }
}
