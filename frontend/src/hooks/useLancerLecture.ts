import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '@/services/api'
import { useProgressStream } from '@/hooks/useProgressStream'
import { messageErreur } from '@/lib/erreurs'
import type { Project } from '@/types'

/**
 * Le geste « Lire ce dossier » : celui de l'écran Lots, partagé avec la carte « un seul lot » de l'écran Dépôt. Un seul
 * chemin pour les deux, donc les mêmes appels serveur (choix du lot, attente des pièces lues, lecture détachée) et les
 * mêmes gardes de quota (le serveur refuse en 402 : la grille des offres s'ouvre). Rien ne part avant l'appel de `lancer`.
 */
export function useLancerLecture(project: Project) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Le flux de progression pilote la fenêtre pendant la lecture ; fermé le reste du temps.
  const analysisSse = useProgressStream(project.id, {
    enabled: isAnalyzing,
    onComplete: () => {
      setIsAnalyzing(false)
      setIsSuccess(true)
      navigate(`/projects/${project.id}/analysis`)
    },
    onError: () => {
      setIsAnalyzing(false)
      setIsSuccess(false)
    },
  })

  // Repli : si le flux a raté l'événement « terminé » (coupure dans les 100 dernières ms), le projet finit en
  // status='analyzed' au prochain rafraîchissement ; on rejoint alors l'écran d'analyse pour ne jamais rester bloqué.
  useEffect(() => {
    if (project.status === 'analyzed' && isAnalyzing) {
      setIsAnalyzing(false)
      setIsSuccess(true)
      navigate(`/projects/${project.id}/analysis`)
    }
  }, [project.status, isAnalyzing, project.id, navigate])

  const { mutateAsync: selectLot } = useMutation({
    mutationFn: (payload: { lot_id: string | null; lot_name: string | null }) =>
      api.post(`/projects/${project.id}/lots/select`, payload),
  })

  const annuler = () => {
    abortRef.current?.abort()
    setIsAnalyzing(false)
    setIsSuccess(false)
    setAnalysisError('Vous avez annulé la lecture.')
  }

  /**
   * `lotIds` : les lots à lire (vide = l'ensemble du dossier, marché sans lots) ; `nomDuLot` : le nom du premier lot.
   */
  const lancer = async (lotIds: readonly string[], nomDuLot: string | null) => {
    setAnalysisError(null)
    const abort = new AbortController()
    abortRef.current = abort
    const selectedId = lotIds[0] ?? 'all'
    try {
      await selectLot({
        lot_id: selectedId === 'all' ? null : selectedId,
        lot_name: selectedId === 'all' ? null : nomDuLot,
      })
      const lotsPayload = lotIds.length > 1 ? { lots: [...lotIds] } : {}
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      setIsAnalyzing(true)
      let ready = false
      while (!ready) {
        if (abort.signal.aborted) return
        const { data } = await api.get<{ total: number; extracted: number; ready: boolean }>(
          `/projects/${project.id}/extraction-status`,
        )
        if (data.ready) { ready = true } else { await new Promise((r) => setTimeout(r, 2000)) }
      }
      if (abort.signal.aborted) return
      // L'analyse est DÉTACHÉE côté serveur (thread) : le POST répond « started » immédiatement et le run survit à
      // tout — navigation, reload, connexion coupée. On rejoint l'écran d'analyse, qui suit la progression via SSE.
      await api.post(`/projects/${project.id}/analyze`, lotsPayload, { timeout: 60_000 })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      navigate(`/projects/${project.id}/analysis`)
      return
    } catch (err) {
      if (abort.signal.aborted) return
      setIsAnalyzing(false)
      setIsSuccess(false)
      // Jamais le message brut ni un objet sérialisé (Q-01) : la phrase du serveur quand il explique son refus, sinon la nôtre.
      const texte = await messageErreur(err, 'La lecture n’a pas pu démarrer. Réessayez dans quelques minutes.')
      // 1.2 — quota appliqué par le serveur : son refus ouvre le choix d'une offre
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        setPaywallMessage(texte)
        setShowPaywall(true)
        return
      }
      setAnalysisError(texte)
    }
  }

  return {
    lancer, annuler, isAnalyzing, isSuccess, analysisError, analysisSse,
    showPaywall, paywallMessage, fermerPaywall: () => setShowPaywall(false),
  }
}

export type LectureEnCours = ReturnType<typeof useLancerLecture>
