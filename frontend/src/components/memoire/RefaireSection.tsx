import { RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/** Réponse de GET /memoire/sections/{partie}/{section}/refaire/estimation (calcul serveur, sans IA). */
export interface EstimationRefaire {
  modele: string
  base: 'reel' | 'typique'
  jetons_prefixe: number
  jetons_sortie: number
  cout_usd: number
  cout_eur: number
}

export interface CibleRefaire {
  part: string
  cle: string
  titre: string
}

/** « environ 0,31 € » — arrondi au centime supérieur par le serveur ; jamais de chiffre inventé ici. */
export function libelleCout(eur: number): string {
  return `environ ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(eur)}`
}

/** Le petit bouton à côté du titre d'une partie. */
export function BoutonRefaire({
  titre, onClick, desactive = false,
}: {
  titre: string
  onClick: () => void
  desactive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      aria-label={`Refaire cette partie : ${titre}`}
      className="memoire-refaire inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-ds-bg-2 disabled:opacity-50 disabled:pointer-events-none [@media(pointer:coarse)]:min-h-11"
      style={{ color: 'var(--text-2)', border: '1px solid var(--border-1)' }}
    >
      <RefreshCw size={12} aria-hidden="true" /> Refaire cette partie
    </button>
  )
}

/** Le texte de la confirmation : ce qui va se passer, le coût, ce qui ne change pas. */
export function CorpsConfirmationRefaire({
  titre, estimation, chargement, erreur,
}: {
  titre: string
  estimation: EstimationRefaire | null
  chargement: boolean
  erreur: boolean
}) {
  return (
    <div className="space-y-2 text-sm" style={{ color: 'var(--text-2)' }}>
      <p>
        Synorix IA réécrit « {titre} » à partir de votre dossier. Le reste du mémoire ne change pas ;
        le texte actuel de cette partie est remplacé.
      </p>
      <p className="font-semibold" style={{ color: 'var(--text-1)' }} aria-live="polite">
        {estimation
          ? `Coût estimé : ${libelleCout(estimation.cout_eur)}.`
          : erreur
            ? 'Le coût n’a pas pu être estimé pour le moment.'
            : chargement ? 'Estimation du coût…' : ''}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Aucune unité de votre abonnement n’est décomptée.
      </p>
    </div>
  )
}

/** La confirmation avant de refaire une partie : le coût estimé est lu auprès du serveur à l'ouverture. */
export default function ConfirmationRefaire({
  projectId, cible, enCours, onConfirmer, onAnnuler,
}: {
  projectId: string
  cible: CibleRefaire
  enCours: boolean
  onConfirmer: () => void
  onAnnuler: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['memoire', projectId, 'refaire-estimation', cible.part, cible.cle],
    queryFn: async () => (await api.get<EstimationRefaire>(
      `/projects/${projectId}/memoire/sections/${cible.part}/${cible.cle}/refaire/estimation`)).data,
    retry: false,
    staleTime: 0,
  })
  return (
    <Dialog open onOpenChange={(ouvert) => { if (!ouvert && !enCours) onAnnuler() }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base font-bold text-fg">Refaire cette partie ?</DialogTitle>
          <DialogDescription className="sr-only">Confirmer la réécriture de la partie {cible.titre}</DialogDescription>
        </DialogHeader>
        <CorpsConfirmationRefaire titre={cible.titre} estimation={data ?? null} chargement={isLoading} erreur={isError} />
        <DialogFooter className="gap-2 pt-2 sm:space-x-0">
          <Button variant="ghost" onClick={onAnnuler} disabled={enCours}>Annuler</Button>
          <Button onClick={onConfirmer} disabled={enCours}>
            {enCours ? 'Lancement…' : 'Refaire cette partie'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
