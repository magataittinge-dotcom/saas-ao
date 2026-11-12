import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useLogout } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { useQuota } from '@/components/layout/QuotaGauge'
import { Bouton } from '@/components/ui/bouton'
import { RangeeCarte } from '@/components/ui/carte'
import { DialogueConfirmation } from '@/components/ui/dialogue'
import {
  PHRASE_MEMBRE, type ApercuSuppression, libelleConfirmer, libelleSuppressionPrevue, messageRefusCompte, phraseDialogue,
} from '@/lib/suppressionCompte'

const CLE_QUOTA = ['billing-quota']

/**
 * La dernière rangée de la carte « Compte » (D23). Sans demande : « Supprimer mon compte » lit d'abord ce que la
 * suppression ferait (GET /users/me/suppression : immédiate, ou la date de fin de la période payée), puis ouvre la
 * confirmation qui le dit. Demande faite : « Suppression prévue le … » et « Annuler la suppression ». Un refus du serveur
 * s'affiche avec sa phrase (502 et 500 compris : elles disent que rien n'a été effacé).
 */
export default function SuppressionCompte() {
  const client = useQueryClient()
  const quota = useQuota()
  const deconnexion = useLogout()
  // Point 74 : un membre ne supprime pas l'entreprise ; la rangée dit à qui s'adresser, sans bouton
  const membre = useAuthStore((s) => s.user?.role === 'member')
  const prevue = quota.data?.suppression_prevue_le ?? null
  const [apercu, setApercu] = useState<ApercuSuppression | null>(null)
  const [lecture, setLecture] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreurRangee, setErreurRangee] = useState<string | null>(null)
  const [erreurDialogue, setErreurDialogue] = useState<string | null>(null)

  const poserPrevue = (valeur: string | null) => {
    client.setQueryData(CLE_QUOTA, (ancien: object | undefined) => (ancien ? { ...ancien, suppression_prevue_le: valeur } : ancien))
    void client.invalidateQueries({ queryKey: CLE_QUOTA })
  }

  const ouvrir = async () => {
    setErreurRangee(null)
    setErreurDialogue(null)
    setLecture(true)
    try {
      const { data } = await api.get<ApercuSuppression>('/users/me/suppression')
      setApercu(data)
    } catch (err) {
      setErreurRangee(messageRefusCompte(err, 'Votre abonnement n’a pas pu être lu. Réessayez dans un instant.'))
    } finally {
      setLecture(false)
    }
  }

  const confirmer = async () => {
    setErreurDialogue(null)
    setEnCours(true)
    try {
      const { data } = await api.delete<{ deleted: boolean; suppression_prevue_le?: string | null }>('/users/me')
      if (data.deleted) {
        await deconnexion()
        return
      }
      poserPrevue(data.suppression_prevue_le ?? null)
      setApercu(null)
    } catch (err) {
      setErreurDialogue(messageRefusCompte(err, 'Le compte n’a pas pu être supprimé. Rien n’a été effacé ; réessayez dans un instant.'))
    } finally {
      setEnCours(false)
    }
  }

  const annuler = async () => {
    setErreurRangee(null)
    setEnCours(true)
    try {
      await api.post('/users/me/annuler-suppression')
      poserPrevue(null)
    } catch (err) {
      setErreurRangee(messageRefusCompte(err, 'La suppression n’a pas pu être annulée. Réessayez dans un instant.'))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <RangeeCarte className="flex-wrap justify-between gap-x-6 gap-y-2" data-suppression-compte="">
        <span className="min-w-0 flex-1 basis-64 text-sm">
          {prevue ? (
            <>
              <span className="block font-medium text-fg">{libelleSuppressionPrevue(prevue)}</span>
              <span className="block text-fg-2">Votre compte reste ouvert jusqu’à cette date, puis toutes vos données sont supprimées.</span>
            </>
          ) : (
            <span className="text-fg-2">Supprimer le compte et toutes ses données</span>
          )}
        </span>
        {membre ? (
          <span className="min-w-0 basis-full text-sm text-fg-2">{PHRASE_MEMBRE}</span>
        ) : prevue ? (
          <Bouton variante="secondaire" onClick={() => { void annuler() }} enCours={enCours} libelleEnCours="Annulation…">
            Annuler la suppression
          </Bouton>
        ) : (
          <Bouton variante="danger" onClick={() => { void ouvrir() }} enCours={lecture} libelleEnCours="Un instant…">
            Supprimer mon compte
          </Bouton>
        )}
        {erreurRangee && <p role="alert" className="w-full text-sm font-medium text-rouge-ink">{erreurRangee}</p>}
      </RangeeCarte>

      {apercu && (
        <DialogueConfirmation
          ouvert
          onOuvert={(o) => { if (!o) { setApercu(null); setErreurDialogue(null) } }}
          titre="Supprimer votre compte ?"
          description={phraseDialogue(apercu)}
          libelleConfirmer={libelleConfirmer(apercu)}
          libelleEnCours="Suppression…"
          onConfirmer={() => { void confirmer() }}
          danger
          enCours={enCours}
          erreur={erreurDialogue}
        />
      )}
    </>
  )
}
