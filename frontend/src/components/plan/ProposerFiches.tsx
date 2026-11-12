import { Sparkles } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { Message } from '@/components/ui/message'

/**
 * C3 (FICHE_PROPOSEE, éteinte par défaut côté serveur) — la proposition de « Ce que vous voulez dire » sous le champ
 * d'une fiche : à prendre (elle remplace le texte du champ, que l'utilisateur relit et corrige) ou à laisser. Rien n'est
 * enregistré sans lui : le texte pris suit le chemin d'aujourd'hui (le champ de la fiche, puis « Valider le plan »).
 */
export function PropositionFiche({ texte, onUtiliser, onIgnorer }: {
  texte: string
  onUtiliser: () => void
  onIgnorer: () => void
}) {
  return (
    <div data-proposition-fiche="" className="min-w-0 space-y-2 rounded-md border border-bord bg-surface-1 px-4 py-3 md:col-span-2">
      <p className="text-xs font-medium text-fg-2">Proposé par Synorix, à relire</p>
      <p className="break-words text-sm text-fg">{texte}</p>
      <div className="flex flex-wrap gap-2">
        <Bouton variante="secondaire" onClick={onUtiliser}>Utiliser ce texte</Bouton>
        <Bouton variante="discret" onClick={onIgnorer}>Ignorer</Bouton>
      </div>
    </div>
  )
}

/** La ligne du plan qui demande les propositions de toutes les fiches, en un appel. */
export function ProposerFiches({ enCours, nombre, erreur, onProposer }: {
  enCours: boolean
  /** null = pas encore demandé ; sinon le nombre de propositions reçues. */
  nombre: number | null
  erreur: string | null
  onProposer: () => void
}) {
  return (
    <div data-proposer-fiches="" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 flex-1 basis-72 text-sm text-fg-2">
          {nombre === null
            ? 'Synorix peut proposer « Ce que vous voulez dire » pour chaque partie, à partir des exigences du dossier et de Mon entreprise. Vous relisez et prenez chaque proposition, ou non.'
            : nombre === 0
              ? 'Rien de sûr à proposer : Mon entreprise ne dit pas encore assez de choses sur ces parties.'
              : `${nombre} ${nombre > 1 ? 'propositions à relire' : 'proposition à relire'}, dans les fiches ouvertes ci-dessous.`}
        </p>
        <Bouton variante="secondaire" enCours={enCours} libelleEnCours="Proposition…" onClick={onProposer}>
          <Sparkles aria-hidden="true" /> {nombre === null ? 'Proposer pour chaque partie' : 'Proposer de nouveau'}
        </Bouton>
      </div>
      {erreur && <Message ton="erreur">{erreur}</Message>}
    </div>
  )
}
