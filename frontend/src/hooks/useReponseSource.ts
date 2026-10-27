import { useEffect, useState } from 'react'
import axios from 'axios'
import { obtenirAncre } from '@/services/sources'
import type { ReponseSource } from '@/lib/ancre'

export type EtatSource =
  | { statut: 'chargement' }
  | { statut: 'pret'; reponse: ReponseSource }
  | { statut: 'echec' }

const TENTATIVES_MAX = 3

/** L'ancre d'une exigence pour le panneau. Le serveur répond 503 + Retry-After quand le calcul
 *  des positions est occupé (premier clic d'un ancien AO) : on réessaie, brièvement, avant de
 *  proposer « Réessayer ». */
export function useReponseExigence(id: string | null): { etat: EtatSource; reessayer: () => void } {
  const [etat, setEtat] = useState<EtatSource>({ statut: 'chargement' })
  const [essai, setEssai] = useState(0)

  useEffect(() => {
    if (id === null) return
    let annule = false
    let minuteur: ReturnType<typeof setTimeout> | null = null
    setEtat({ statut: 'chargement' })

    const charger = (tentative: number) => {
      obtenirAncre(id)
        .then((reponse) => { if (!annule) setEtat({ statut: 'pret', reponse }) })
        .catch((err) => {
          if (annule) return
          const occupe = axios.isAxiosError(err) && err.response?.status === 503
          if (occupe && tentative < TENTATIVES_MAX) {
            const brut = Number(err.response?.headers?.['retry-after'])
            const delai = Math.min(Math.max(Number.isFinite(brut) ? brut : 2, 1), 5) * 1000
            minuteur = setTimeout(() => charger(tentative + 1), delai)
            return
          }
          setEtat({ statut: 'echec' })
        })
    }
    charger(1)
    return () => { annule = true; if (minuteur) clearTimeout(minuteur) }
  }, [id, essai])

  return { etat, reessayer: () => setEssai((n) => n + 1) }
}
