// Un avis ouvert : l'objet, l'acheteur, le département, le délai (J−12), la procédure, les métiers,
// et deux gestes : lire l'avis (lien externe) ou en faire un AO.
import { ExternalLink, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'
import { jourMois, urlSure } from '@/lib/veille'
import type { AvisVeille } from '@/services/veille'

export interface PropsCarteAvis {
  avis: AvisVeille
  /** Libellés des métiers (code → libellé), fournis par GET /veille/metiers. */
  libellesMetiers: Readonly<Record<string, string>>
  /** Noms des départements (code → nom). */
  nomsDepartements: Readonly<Record<string, string>>
  onCreerAO: (idAvis: string) => void
  /** Création en cours pour cet avis. */
  enCreation?: boolean
  /** La dernière création n'a pas abouti. */
  creationEnErreur?: boolean
}

const METIERS_VISIBLES = 3

export default function CarteAvis({ avis, libellesMetiers, nomsDepartements, onCreerAO, enCreation, creationEnErreur }: PropsCarteAvis) {
  const idTitre = `avis-${avis.id}`
  const lien = urlSure(avis.url_avis)
  const departements = avis.departements.map((c) => `${nomsDepartements[c] ?? c} (${c})`).join(', ')
  const metiers = avis.metiers.map((m) => libellesMetiers[m] ?? m)
  return (
    <article aria-labelledby={idTitre} data-avis={avis.id} className="rounded-lg bg-surface-1 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 id={idTitre} className="line-clamp-3 min-w-0 text-[15px] font-semibold leading-snug text-fg">{avis.objet}</h3>
        {avis.nouveau && <Badge variant="accent" className="shrink-0">Nouveau</Badge>}
      </div>
      <p className="mt-1 text-sm text-fg-2">{avis.acheteur}</p>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2">
        <div>
          <dt className="sr-only">Département</dt>
          <dd>{departements}</dd>
        </div>
        <div>
          <dt className="sr-only">Procédure</dt>
          <dd>{avis.procedure_libelle}</dd>
        </div>
        {avis.date_limite && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Date limite</dt>
            <dd className="flex items-center gap-2">
              <DeadlinePill echeance={{ date: avis.date_limite }} />
              <span className="tabular-nums">{jourMois(avis.date_limite)}</span>
            </dd>
          </div>
        )}
      </dl>

      {metiers.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Métiers">
          {metiers.slice(0, METIERS_VISIBLES).map((m) => <li key={m}><Badge variant="neutral">{m}</Badge></li>)}
          {metiers.length > METIERS_VISIBLES && (
            <li><Badge variant="outline" title={metiers.slice(METIERS_VISIBLES).join(', ')}>+{metiers.length - METIERS_VISIBLES}</Badge></li>
          )}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {lien && (
          <Button asChild variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11">
            <a href={lien} target="_blank" rel="noopener noreferrer">
              Voir l'avis <ExternalLink aria-hidden /><span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
            </a>
          </Button>
        )}
        <Button size="sm" onClick={() => onCreerAO(avis.id)} disabled={enCreation} className="[@media(pointer:coarse)]:min-h-11">
          <Plus aria-hidden /> {enCreation ? 'Création…' : "Créer l'AO"}
        </Button>
        {creationEnErreur && <p role="status" className="text-sm text-fg-2">La création n'a pas abouti. Réessayez dans un instant.</p>}
      </div>
    </article>
  )
}
