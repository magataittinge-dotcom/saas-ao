import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { LotsEcartes } from '@/lib/lotsSource'
import { lotUniqueDuDossier, type LotUnique } from '@/lib/lotUnique'
import type { LotOption, Project } from '@/types'

interface ReponseLots { lots: LotOption[]; count: number; ecartes?: LotsEcartes | null; iaNecessaire?: boolean }

/**
 * Les lots du dossier, lus sur l'écran de dépôt une fois le dépôt fini, pour savoir s'il n'y en a qu'un. Même route que l'écran
 * Lots, mais en mode `sans_ia` : le dépôt n'appelle JAMAIS l'IA. Si le filet IA des lots se serait déclenché, le serveur répond
 * `ia_necessaire` : pas de carte « un seul lot », le parcours mène à l'écran des lots, qui lance le filet. Clé de lecture à part
 * (`lots-depot`) : ce résultat n'est jamais servi à l'écran des lots.
 * Aucune lecture du dossier ne part d'ici : le hook ne fait que LIRE les lots. `signature` : la liste des pièces ; quand
 * elle change, la détection est refaite.
 */
export function useLotsDuDepot(project: Project, { actif, signature }: { actif: boolean; signature: string }): {
  lotUnique: LotUnique | null
  ecartes: LotsEcartes | null
} {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['projects', project.id, 'lots-depot'],
    enabled: actif,
    queryFn: async () => {
      const { data: r } = await api.get<Partial<ReponseLots> & { status?: string; ia_necessaire?: boolean }>(`/projects/${project.id}/lots`, { params: { sans_ia: 1 } })
      if (r.status === 'detecting_lots') return null          // détection en cours : on relit dans un instant
      if (r.ia_necessaire) return { lots: [], count: 0, iaNecessaire: true }     // le filet IA reste à passer : l'écran des lots s'en charge
      queryClient.invalidateQueries({ queryKey: ['projects', project.id], exact: true })
      return r as ReponseLots
    },
    refetchInterval: (q) => (q.state.data === null ? 2500 : false),
  })

  const vue = useRef(signature)
  useEffect(() => {
    if (vue.current === signature) return
    vue.current = signature
    queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'lots-depot'] })
  }, [signature, project.id, queryClient])

  if (!actif || !data || data.iaNecessaire) return { lotUnique: null, ecartes: null }
  return { lotUnique: lotUniqueDuDossier(project, data.lots), ecartes: data.ecartes ?? null }
}
