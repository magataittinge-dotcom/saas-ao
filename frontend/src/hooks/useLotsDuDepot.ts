import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { LotsEcartes } from '@/lib/lotsSource'
import { lotUniqueDuDossier, type LotUnique } from '@/lib/lotUnique'
import type { LotOption, Project } from '@/types'

interface ReponseLots { lots: LotOption[]; count: number; ecartes?: LotsEcartes | null }

/**
 * Les lots du dossier, lus sur l'écran de dépôt une fois le dépôt fini, pour savoir s'il n'y en a qu'un. C'est la route et la
 * clé de l'écran Lots (même détection, sans IA, mise en cache côté serveur : l'écran Lots la retrouve toute faite).
 * Aucune lecture du dossier ne part d'ici : le hook ne fait que LIRE les lots. `signature` : la liste des pièces ; quand
 * elle change, la détection est refaite.
 */
export function useLotsDuDepot(project: Project, { actif, signature }: { actif: boolean; signature: string }): {
  lotUnique: LotUnique | null
  ecartes: LotsEcartes | null
} {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['projects', project.id, 'lots'],
    enabled: actif,
    queryFn: async () => {
      const { data: r } = await api.get<Partial<ReponseLots> & { status?: string }>(`/projects/${project.id}/lots`)
      if (r.status === 'detecting_lots') return null          // détection en cours : on relit dans un instant
      queryClient.invalidateQueries({ queryKey: ['projects', project.id], exact: true })
      return r as ReponseLots
    },
    refetchInterval: (q) => (q.state.data === null ? 2500 : false),
  })

  const vue = useRef(signature)
  useEffect(() => {
    if (vue.current === signature) return
    vue.current = signature
    queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'lots'] })
  }, [signature, project.id, queryClient])

  if (!actif || !data) return { lotUnique: null, ecartes: null }
  return { lotUnique: lotUniqueDuDossier(project, data.lots), ecartes: data.ecartes ?? null }
}
