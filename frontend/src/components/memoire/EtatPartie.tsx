import { LIBELLE_ETAT, type EtatPartie } from '@/lib/memoireEtats'

const ORDRE: EtatPartie[] = ['redigee', 'a_refaire']

/**
 * Le seul état d'une partie, choisi par le patron : « Rédigée » (par défaut) ou « À refaire ».
 * Deux boutons exclusifs ; aucun autre statut, aucun responsable, aucune échéance.
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
    <div role="group" aria-label={`État de la partie ${titre}`} className="memoire-etat inline-flex overflow-hidden rounded-md"
      style={{ border: '1px solid var(--border-1)' }}>
      {ORDRE.map((e) => {
        const choisi = e === etat
        return (
          <button
            key={e}
            type="button"
            aria-pressed={choisi}
            disabled={desactive}
            data-etat={e}
            onClick={() => { if (!choisi) onChange(e) }}
            className="px-2.5 py-1 text-xs transition-colors hover:bg-ds-bg-2 disabled:pointer-events-none disabled:opacity-60 [@media(pointer:coarse)]:min-h-11"
            style={{
              color: choisi ? 'var(--text-1)' : 'var(--text-3)',
              fontWeight: choisi ? 600 : 400,
              background: choisi ? 'color-mix(in srgb, var(--text-1) 8%, transparent)' : 'transparent',
            }}
          >
            {LIBELLE_ETAT[e]}
          </button>
        )
      })}
    </div>
  )
}
