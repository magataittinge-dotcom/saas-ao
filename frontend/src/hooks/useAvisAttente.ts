import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { avisAttente } from '@/lib/avisAttente'

/** Phrase d'attente (analyse, mémoire) fidèle à l'envoi réel d'e-mails (même requête que la cloche). */
export function useAvisAttente(tache: 'analyse' | 'mémoire'): string {
  const { data } = useQuery<{ email_actif?: boolean }>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications')
      return data
    },
    refetchInterval: 60_000,
  })
  return avisAttente(tache, data?.email_actif)
}
