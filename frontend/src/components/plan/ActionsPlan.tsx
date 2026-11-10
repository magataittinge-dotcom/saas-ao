import { ActionsBarreTel, BarreEtape, BilanBarre } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { jourLongParis } from '@/lib/dateParis'

export interface EtatPlan {
  /** Le plan enregistré est validé et rien n'a changé depuis. */
  valideEtAJour: boolean
  valideLe: string | null
  enregistre: boolean
  modifie: boolean
  enCours: boolean
  enValidation: boolean
}

/** « Plan validé le 2 novembre » (à l'heure de Paris) ; sans date lisible, « Plan validé ». */
export function libelleValidation(valideLe: string | null): string {
  const jour = jourLongParis(valideLe)
  return jour ? `Plan validé le ${jour}` : 'Plan validé'
}

export function libelleEtat(e: EtatPlan): string {
  if (e.enCours) return 'Enregistrement…'
  if (e.modifie) return 'Modifications en cours'
  if (e.valideEtAJour) return libelleValidation(e.valideLe)
  return e.enregistre ? 'Plan enregistré, à valider' : 'Plan proposé, à valider'
}

/**
 * L'action principale du plan, la seule de l'écran : « Valider le plan » tant qu'il n'est pas validé, puis « Rédiger le
 * mémoire ». `tel` : la version portée par la barre du bas au téléphone (l'en-tête n'y montre pas son action).
 */
export function BoutonPrincipalPlan({ etat, onValider, onRediger, tel = false }: {
  etat: EtatPlan
  onValider: () => void
  onRediger: () => void
  tel?: boolean
}) {
  const marque = tel ? { 'data-principal-tel': '' } : {}
  const valide = etat.valideEtAJour
  return (
    <Bouton
      variante="principal" large={!tel} {...marque}
      onClick={valide ? onRediger : onValider}
      disabled={!valide && etat.enCours && !etat.enValidation}
      enCours={!valide && etat.enValidation} libelleEnCours="Validation…"
    >
      {valide ? 'Rédiger le mémoire' : 'Valider le plan'}
    </Bouton>
  )
}

/**
 * La barre du bas du plan. Ordinateur : l'état du plan seulement (enregistré, modifié, validé le…) : « Valider le plan »
 * n'est écrit qu'une fois, dans l'en-tête. Téléphone : l'en-tête ne porte pas son action, c'est la barre qui la porte.
 */
export function BarrePlan({ etat, onValider, onRediger }: {
  etat: EtatPlan
  onValider: () => void
  onRediger: () => void
}) {
  const libelle = libelleEtat(etat)
  return (
    <BarreEtape className="justify-between gap-3">
      <BilanBarre
        bureau={<p role="status" aria-live="polite" className="text-sm text-fg-2">{libelle}</p>}
        tel={<p className="truncate text-sm text-fg-2">{libelle}</p>}
      />
      <ActionsBarreTel><BoutonPrincipalPlan etat={etat} onValider={onValider} onRediger={onRediger} tel /></ActionsBarreTel>
    </BarreEtape>
  )
}
