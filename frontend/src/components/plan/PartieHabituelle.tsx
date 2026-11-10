import { Plus } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { TITRES_PARTIES_PLAN, type PartiePlan } from '@/lib/planMemoire'

/** « PARTIE B — PRÉSENTATION… » → « Partie B » : le rattachement de la partie, en peu de place. */
function etiquette(partie: PartiePlan['partie']): string {
  return `Partie ${TITRES_PARTIES_PLAN[partie].charAt(7)}`
}

/**
 * Une partie habituelle du mémoire que le plan ne retient pas par défaut (aucun sous-critère du règlement ne la sert, le
 * dossier ne la demande pas) : une rangée à filet. Un seul geste, nommé, l'ajoute au plan ; elle redevient une partie comme
 * les autres, qu'on peut retirer de nouveau.
 */
export default function PartieHabituelle({ partie, onAjouter }: { partie: PartiePlan; onAjouter: () => void }) {
  const nom = partie.titre || partie.titre_modele || 'cette partie'
  return (
    <li
      data-partie={partie.cle}
      data-habituelle=""
      className="flex min-h-[52px] min-w-0 items-center justify-between gap-x-3 border-t border-bord py-1 pl-4 pr-2 first:border-t-0 sm:pl-5 md:[&:nth-child(2)]:border-t-0"
    >
      <p className="min-w-0 flex-1 break-words text-sm text-fg">
        <span className="font-medium">{nom}</span>
        <span className="text-fg-3"> · {etiquette(partie.partie)}</span>
      </p>
      <Bouton variante="discret" onClick={onAjouter} aria-label={`Ajouter au plan : ${nom}`}>
        <Plus aria-hidden /> Ajouter
      </Bouton>
    </li>
  )
}
