import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { messageErreur } from '@/lib/erreurs'
import { choixDefinitif, choixStatut } from '@/lib/etatAO'
import type { Project, ProjectStatus } from '@/types'
import { Bouton } from '@/components/ui/bouton'
import { GroupeRadio } from '@/components/ui/case'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'
import { annoncer } from '@/components/ui/toast'

/**
 * « Mettre à jour le statut » : le dialogue du système où l'utilisateur dit ce qu'il est advenu d'un appel d'offres.
 *  - remise passée (ou AO en cours) : « Je l'ai déposé » ou « Je n'ai pas répondu » ;
 *  - AO déposé : « Gagné », « Perdu », ou revenir sur le dépôt ;
 *  - AO sans suite : le reprendre.
 * Rien n'est enregistré avant « Enregistrer ». « Je l'ai déposé » et « Je n'ai pas répondu » se défont en rouvrant ce
 * dialogue ; « Gagné » et « Perdu » sont définitifs, et le dialogue le dit. Les choix sont ceux de `choixStatut`
 * (lib/etatAO.ts), alignés sur ce que le serveur accepte (PATCH /projects/{id}).
 * Composant partagé : Mes AO, l'Accueil, la page d'un AO et l'étape « Télécharger le dossier » le posent tel quel.
 */
export function MettreAJourStatut({ projet, ouvert, onOuvert }: {
  projet: Pick<Project, 'id' | 'name' | 'status'>
  ouvert: boolean
  onOuvert: (ouvert: boolean) => void
}) {
  const choix = choixStatut(projet.status)
  const [status, setStatus] = useState<ProjectStatus | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)
  const queryClient = useQueryClient()
  useEffect(() => { if (ouvert) { setStatus(undefined); setErreur(null) } }, [ouvert, projet.status])

  const { mutate: enregistrer, isPending } = useMutation({
    mutationFn: async (status: ProjectStatus) => { await api.patch(`/projects/${projet.id}`, { status }) },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      annoncer('Le statut est mis à jour.', 'succes')
      onOuvert(false)
    },
    onError: async (err) => setErreur(await messageErreur(err, 'Le statut n’a pas pu être enregistré. Réessayez dans un instant.')),
  })

  return (
    <Dialogue ouvert={ouvert} onOuvert={(o) => { if (!isPending) onOuvert(o) }} taille="petit"
      titre="Mettre à jour le statut" description={projet.name}
      actions={<>
        <Bouton onClick={() => onOuvert(false)} disabled={isPending}>Annuler</Bouton>
        {choix.length > 0 && (
          <Bouton variante="principal" disabled={!status} enCours={isPending} libelleEnCours="Enregistrement…" onClick={() => { if (status) enregistrer(status) }}>Enregistrer</Bouton>
        )}
      </>}>
      {choix.length > 0
        ? <GroupeRadio libelle="Statut de l’appel d’offres" valeur={status} onChange={setStatus} disabled={isPending}
            options={choix.map((c) => ({ valeur: c.statut, libelle: c.libelle, aide: c.aide }))} />
        : <p className="text-sm text-fg-2">Le résultat de cet appel d’offres est enregistré : il ne se modifie plus.</p>}
      {status && choixDefinitif(status) && <Message ton="info">Ce résultat est définitif : il ne se modifie plus ensuite.</Message>}
      {status && !choixDefinitif(status) && <p className="text-xs text-fg-3">Vous pourrez revenir sur ce choix en rouvrant ce dialogue.</p>}
      {erreur && <Message ton="erreur">{erreur}</Message>}
    </Dialogue>
  )
}

export default MettreAJourStatut
