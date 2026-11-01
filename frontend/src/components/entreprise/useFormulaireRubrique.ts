import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '@/services/api'
import { messageErreur } from './champs'
import { useAuthStore } from '@/stores/authStore'
import type { DonneesEntreprise, RubriqueId } from '@/lib/entreprise/avancement'
import { brouillonDepuis, chargeUtile, type Brouillon } from '@/lib/entreprise/charges'
import type { MemoireConfig, Organization } from '@/types'

/**
 * L'état d'un formulaire de rubrique : une copie de travail, un seul enregistrement. Il écrit dans les tables
 * actuelles par les routes existantes, puis remet à jour le magasin et le cache. La copie suit les données du
 * serveur quand elles changent (après l'application d'un texte structuré, par exemple).
 */
export function useFormulaireRubrique(
  rubrique: RubriqueId,
  donnees: DonneesEntreprise,
  /** Écritures supplémentaires de la rubrique (listes : équipe, qualifications, références), faites au même « Enregistrer ». */
  listes?: { enregistrer: () => Promise<void>; invalider: string[] },
) {
  const queryClient = useQueryClient()
  const setOrganization = useAuthStore((s) => s.setOrganization)
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDepuis(rubrique, donnees))
  const [reussi, setReussi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const donneesRef = useRef(donnees)
  donneesRef.current = donnees
  const listesRef = useRef(listes)
  listesRef.current = listes

  useEffect(() => { setBrouillon(brouillonDepuis(rubrique, donneesRef.current)) }, [rubrique, donnees.profil, donnees.organisation])

  const mutation = useMutation({
    mutationFn: async () => {
      const charge = chargeUtile(rubrique, brouillon, donneesRef.current)
      let organisation: Organization | null = null
      let profil: MemoireConfig | null = null
      if (charge.organisation) organisation = (await api.patch<Organization>('/organizations/me', charge.organisation)).data
      if (charge.profil) profil = (await api.put<MemoireConfig>('/memoire-config', charge.profil)).data
      if (listesRef.current) await listesRef.current.enregistrer()
      return { organisation, profil }
    },
    onSuccess: ({ organisation, profil }) => {
      if (organisation) setOrganization(organisation)
      if (profil) queryClient.setQueryData(['memoire-config'], profil)
      for (const cle of listesRef.current?.invalider ?? []) queryClient.invalidateQueries({ queryKey: [cle] })
      setErreur(null)
      setReussi(true)
      setTimeout(() => setReussi(false), 2500)
    },
    onError: (e) => {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null
      setErreur(messageErreur(detail))
    },
  })

  const poserOrganisation = (champ: keyof Organization, valeur: unknown) =>
    setBrouillon((b) => ({ ...b, organisation: { ...b.organisation, [champ]: valeur } }))
  const poserProfil = (champ: keyof MemoireConfig, valeur: unknown) =>
    setBrouillon((b) => ({ ...b, profil: { ...b.profil, [champ]: valeur } }))

  return {
    brouillon, poserOrganisation, poserProfil,
    enregistrer: () => mutation.mutate(),
    enCours: mutation.isPending, reussi, erreur,
  }
}
