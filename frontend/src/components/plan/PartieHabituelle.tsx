import { Plus } from 'lucide-react'
import { TITRES_PARTIES_PLAN, type PartiePlan } from '@/lib/planMemoire'

/** « PARTIE B — PRÉSENTATION… » → « Partie B » : le rattachement de la partie, en peu de place. */
function etiquette(partie: PartiePlan['partie']): string {
  return `Partie ${TITRES_PARTIES_PLAN[partie].charAt(7)}`
}

/**
 * Une partie habituelle du mémoire que le plan ne retient pas par défaut (aucun sous-critère du règlement ne la sert, le
 * dossier ne la demande pas). Un seul geste, nommé, l'ajoute au plan ; elle redevient une partie comme les autres, qu'on
 * peut retirer de nouveau.
 */
export default function PartieHabituelle({ partie, onAjouter }: { partie: PartiePlan; onAjouter: () => void }) {
  const nom = partie.titre || partie.titre_modele || 'cette partie'
  return (
    <li
      data-partie={partie.cle}
      data-habituelle=""
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-carte border border-bord-2 bg-surface-0 px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words text-sm font-medium text-fg">{nom}</p>
        <p className="text-xs text-fg-3">{etiquette(partie.partie)}</p>
      </div>
      <button
        type="button"
        onClick={onAjouter}
        aria-label={`Ajouter au plan : ${nom}`}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-bord-2 bg-surface-1 px-3.5 text-sm font-medium text-fg hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11"
      >
        <Plus size={15} aria-hidden /> Ajouter au plan
      </button>
    </li>
  )
}
