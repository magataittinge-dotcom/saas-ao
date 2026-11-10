import { Bouton } from '@/components/ui/bouton'
import { cn } from '@/lib/utils'
import { LIBELLE_ETAT, type EtatPartie } from '@/lib/memoireEtats'

const ORDRE: EtatPartie[] = ['redigee', 'a_refaire']

/**
 * Le seul état d'une partie, choisi par le patron : « Rédigée » (par défaut) ou « À refaire ».
 * Deux boutons exclusifs du système (discrets : le choisi sur un fond de glace, « À refaire » à l'encre ambre) ; aucun
 * autre statut, aucun responsable, aucune échéance.
 */
export default function EtatPartieChoix({
  titre, etat, onChange, desactive = false,
}: {
  titre: string
  etat: EtatPartie
  onChange: (etat: EtatPartie) => void
  desactive?: boolean
}) {
  return (
    <div role="group" aria-label={`État de la partie ${titre}`} className="memoire-etat inline-flex items-center">
      {ORDRE.map((e) => {
        const choisi = e === etat
        return (
          <Bouton
            key={e}
            variante="discret"
            aria-pressed={choisi}
            disabled={desactive}
            data-etat={e}
            onClick={() => { if (!choisi) onChange(e) }}
            className={cn('px-2.5', choisi ? cn('bg-surface-1 font-semibold', e === 'a_refaire' ? 'text-ambre-ink hover:text-ambre-ink' : 'text-fg') : 'font-normal text-fg-3')}
          >
            {LIBELLE_ETAT[e]}
          </Bouton>
        )
      })}
    </div>
  )
}
