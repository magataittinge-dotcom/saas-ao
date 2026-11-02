import { ActionsBarre, ActionsBarreTel, BarreEtape, BilanBarre } from '@/components/etape'

export interface EtatPlan {
  /** Le plan enregistré est validé et rien n'a changé depuis. */
  valideEtAJour: boolean
  valideLe: string | null
  enregistre: boolean
  modifie: boolean
  enCours: boolean
  enValidation: boolean
}

/** « Plan validé le 2 novembre » ; sans date lisible, « Plan validé ». */
export function libelleValidation(valideLe: string | null): string {
  const d = valideLe ? new Date(valideLe) : null
  if (!d || Number.isNaN(d.getTime())) return 'Plan validé'
  return `Plan validé le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

export function libelleEtat(e: EtatPlan): string {
  if (e.enCours) return 'Enregistrement…'
  if (e.modifie) return 'Modifications en cours'
  if (e.valideEtAJour) return libelleValidation(e.valideLe)
  return e.enregistre ? 'Plan enregistré, à valider' : 'Plan proposé, à valider'
}

/**
 * L'action principale du plan : « Valider le plan » tant qu'il n'est pas validé, puis « Rédiger le mémoire ». Une seule,
 * en dégradé. `tel` : la version portée par la barre du bas au téléphone (l'en-tête n'y montre pas son action).
 */
export function BoutonPrincipalPlan({ etat, onValider, onRediger, tel = false }: {
  etat: EtatPlan
  onValider: () => void
  onRediger: () => void
  tel?: boolean
}) {
  const classe = `signature-btn [@media(pointer:coarse)]:min-h-11 ${tel ? '' : 'w-full'}`
  const marque = tel ? { 'data-principal-tel': '' } : {}
  return etat.valideEtAJour ? (
    <button type="button" className={classe} onClick={onRediger} {...marque}>Rédiger le mémoire</button>
  ) : (
    <button type="button" className={`${classe} disabled:opacity-40`} disabled={etat.enCours} onClick={onValider} {...marque}>
      {etat.enValidation ? 'Validation…' : 'Valider le plan'}
    </button>
  )
}

/**
 * La barre du bas du plan. Ordinateur : l'état du plan, et « Étape suivante : Rédiger » EN CONTOUR tant que le plan n'est
 * pas validé (l'action principale est celle de l'en-tête). Téléphone : l'en-tête ne porte pas son action, c'est la barre
 * qui porte l'action principale. Jamais deux boutons en dégradé visibles ensemble.
 */
export function BarrePlan({ etat, onValider, onRediger }: { etat: EtatPlan; onValider: () => void; onRediger: () => void }) {
  return (
    <BarreEtape className="justify-between gap-3">
      <BilanBarre
        bureau={<p role="status" aria-live="polite" className="text-sm text-fg-2">{libelleEtat(etat)}</p>}
      />
      {!etat.valideEtAJour && (
        <ActionsBarre className="max-[768px]:hidden">
          <button
            type="button" onClick={onRediger}
            className="inline-flex items-center justify-center rounded-lg border border-bord-2 px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-0 [@media(pointer:coarse)]:min-h-11"
          >
            Étape suivante&nbsp;: Rédiger
          </button>
        </ActionsBarre>
      )}
      <ActionsBarreTel><BoutonPrincipalPlan etat={etat} onValider={onValider} onRediger={onRediger} tel /></ActionsBarreTel>
    </BarreEtape>
  )
}
