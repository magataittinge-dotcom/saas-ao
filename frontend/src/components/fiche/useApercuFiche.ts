// Branche le contrôleur d'aperçu (lib/apercuFiche.ts) sur React et sur l'API, et charge les images des pages.
// Les images demandent le jeton d'authentification : elles sont lues par axios, rangées en Blob, et affichées par une URL
// locale (comme « Voir dans le DCE », services/sources.ts) ; les URL sont libérées au changement d'aperçu et au démontage.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/services/api'
import type { RubriqueFiche } from '@/lib/fiche'
import {
  ControleurApercu, ETAT_INITIAL, urlPage,
  type AccesApercu, type EtatApercu, type FormatFiche, type ReponseDemande, type ReponseEtat,
} from '@/lib/apercuFiche'

const accesApi: AccesApercu = {
  demander: async (rubrique, format) =>
    (await api.post<ReponseDemande>(`/entreprise/fiches/${rubrique}/apercu`, null, { params: { format } })).data,
  etat: async (rubrique, empreinte) =>
    (await api.get<ReponseEtat>(`/entreprise/fiches/${rubrique}/apercu/${empreinte}`)).data,
}

export interface PageImage { numero: number; src: string | null }

export function useApercuFiche(rubrique: RubriqueFiche) {
  const controleur = useMemo(() => new ControleurApercu(accesApi, rubrique), [rubrique])
  const [etat, setEtat] = useState<EtatApercu>(ETAT_INITIAL)
  useEffect(() => {
    setEtat(controleur.lire())
    const fin = controleur.abonner(setEtat)
    return () => { fin(); controleur.arreter() }
  }, [controleur])
  const planifier = useCallback((format: FormatFiche, delai?: number) => controleur.planifier(format, delai), [controleur])

  // Les pages de l'aperçu affiché : les anciennes restent à l'écran jusqu'à ce que les nouvelles soient chargées.
  const [pages, setPages] = useState<PageImage[]>([])
  const courantes = useRef<string[]>([])
  useEffect(() => {
    const empreinte = etat.empreinteAffichee
    if (!empreinte || etat.pages < 1) return
    let annule = false
    const nouvelles: string[] = []
    ;(async () => {
      const lues: PageImage[] = await Promise.all(
        Array.from({ length: etat.pages }, async (_, i) => {
          try {
            const { data } = await api.get<Blob>(urlPage(rubrique, empreinte, i + 1), { responseType: 'blob' })
            const src = window.URL.createObjectURL(data)
            nouvelles.push(src)
            return { numero: i + 1, src }
          } catch {
            return { numero: i + 1, src: null }
          }
        }),
      )
      if (annule) { nouvelles.forEach((u) => window.URL.revokeObjectURL(u)); return }
      courantes.current.forEach((u) => window.URL.revokeObjectURL(u))
      courantes.current = nouvelles
      setPages(lues)
    })()
    return () => { annule = true }
  }, [etat.empreinteAffichee, etat.pages, rubrique])
  useEffect(() => () => { courantes.current.forEach((u) => window.URL.revokeObjectURL(u)) }, [])

  return { etat, pages, planifier }
}
