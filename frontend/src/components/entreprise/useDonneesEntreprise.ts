import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { DonneesEntreprise } from '@/lib/entreprise/avancement'
import type { MemoireConfig, Qualification, Reference, TeamMember, Document } from '@/types'

/**
 * Les données de « Mon entreprise » : l'organisation (déjà dans le magasin d'authentification), le profil,
 * l'équipe, les références et le coffre-fort. Une seule lecture par source, partagée par l'avancement
 * des trois rubriques et par les formulaires.
 */
export function useDonneesEntreprise(): DonneesEntreprise & {
  profilCharge: boolean
  /** Une des lectures a échoué sans rien rapporter : l'écran dit l'erreur, jamais « votre profil est vide ». */
  enErreur: boolean
  rechargement: boolean
  recharger: () => void
} {
  const organisation = useAuthStore((s) => s.organization)
  const profil = useQuery({
    queryKey: ['memoire-config'],
    queryFn: async () => (await api.get<MemoireConfig>('/memoire-config')).data,
  })
  const equipe = useQuery({
    queryKey: ['team'],
    queryFn: async () => (await api.get<TeamMember[]>('/users/team')).data,
  })
  const references = useQuery({
    queryKey: ['references'],
    queryFn: async () => (await api.get<Reference[]>('/references')).data,
  })
  const documents = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await api.get<Document[]>('/documents')).data,
  })
  const qualifications = useQuery({
    queryKey: ['qualifications'],
    queryFn: async () => (await api.get<Qualification[]>('/qualifications')).data,
  })
  const lectures = [profil, equipe, references, documents, qualifications]
  return {
    enErreur: lectures.some((r) => r.isError && r.data === undefined),
    rechargement: lectures.some((r) => r.isFetching),
    recharger: () => { for (const r of lectures) if (r.isError) void r.refetch() },
    organisation,
    profil: profil.data ?? null,
    equipe: equipe.data ?? null,
    references: references.data ?? null,
    documents: documents.data ?? null,
    qualifications: qualifications.data ?? null,
    profilCharge: !profil.isLoading,
  }
}
