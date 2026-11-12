// Un avis ouvert : l'objet, l'acheteur, le département, le délai (J−12), la procédure, les métiers,
// et deux gestes : lire l'avis (lien externe) ou en faire un AO. Composants du système seulement ; aucun aplat ici :
// l'action pleine de l'Accueil reste celle du prochain appel d'offres.
import { ExternalLink, Plus, Sparkles } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Infobulle } from '@/components/ui/infobulle'
import { PastilleEtat } from '@/components/ui/pastille'
import { DeadlinePill } from '@/components/dashboard/DeadlinePill'
import { departementsAAfficher, jourMois, urlSure } from '@/lib/veille'
import type { AvisVeille } from '@/services/veille'

export interface PropsCarteAvis {
  avis: AvisVeille
  /** Libellés des métiers (code → libellé), fournis par GET /veille/metiers. */
  libellesMetiers: Readonly<Record<string, string>>
  /** Noms des départements (code → nom). */
  nomsDepartements: Readonly<Record<string, string>>
  /** La zone choisie : un avis sur plusieurs départements montre ceux de la zone. */
  zone?: readonly string[]
  onCreerAO: (idAvis: string) => void
  /** Création en cours pour cet avis. */
  enCreation?: boolean
  /** La dernière création n'a pas abouti. */
  creationEnErreur?: boolean
}

const METIERS_VISIBLES = 3

/** « Procédure Ouverte » (casse de la source) s'écrit « Procédure ouverte » : seul le premier mot garde sa capitale. */
export const casseProcedure = (libelle: string | null | undefined): string =>
  (libelle ?? '').replace(/^(Procédure|Appel d’offres|Appel d'offres|Marché) (\p{Lu})(?=\p{Ll})/u, (_t, debut: string, lettre: string) => `${debut} ${lettre.toLowerCase()}`)

export default function CarteAvis({ avis, libellesMetiers, nomsDepartements, zone, onCreerAO, enCreation, creationEnErreur }: PropsCarteAvis) {
  const idTitre = `avis-${avis.id}`
  const lien = urlSure(avis.url_avis)
  const departements = departementsAAfficher(avis.departements, zone).map((c) => `${nomsDepartements[c] ?? c} (${c})`).join(', ')
  const metiers = avis.metiers.map((m) => libellesMetiers[m] ?? m)
  return (
    <article aria-labelledby={idTitre} data-avis={avis.id} className="rounded-lg border border-bord bg-surface-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h4 id={idTitre} className="line-clamp-3 min-w-0 text-base font-semibold leading-snug text-fg">{avis.objet}</h4>
        {avis.nouveau && <PastilleEtat sens="turquoise" icone={Sparkles} className="shrink-0">Nouveau</PastilleEtat>}
      </div>
      <p className="mt-1 text-sm text-fg-2">{avis.acheteur}</p>

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2">
        <div>
          <dt className="sr-only">Département</dt>
          <dd>{departements}</dd>
        </div>
        <div>
          <dt className="sr-only">Procédure</dt>
          <dd>{casseProcedure(avis.procedure_libelle)}</dd>
        </div>
        {avis.date_limite && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Date limite</dt>
            <dd className="flex items-center gap-2">
              <DeadlinePill echeance={{ date: avis.date_limite }} />
              <span>{jourMois(avis.date_limite)}</span>
            </dd>
          </div>
        )}
      </dl>

      {/* les métiers : une ligne de texte (jury, tour 1 : des pastilles grises répétées sur chaque avis n'apprennent rien) */}
      {metiers.length > 0 && (
        <p data-metiers="" className="mt-2 text-sm text-fg-3">
          <span className="sr-only">{'Métiers\u00a0: '}</span>
          {metiers.slice(0, METIERS_VISIBLES).join(', ')}
          {metiers.length > METIERS_VISIBLES && (
            <Infobulle texte={metiers.slice(METIERS_VISIBLES).join(', ')}>
              <span tabIndex={0} aria-label={`et ${metiers.slice(METIERS_VISIBLES).join(', ')}`} className="rounded-sm underline decoration-dotted underline-offset-4"> et {metiers.length - METIERS_VISIBLES} autre{metiers.length - METIERS_VISIBLES > 1 ? 's' : ''}</span>
            </Infobulle>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Bouton onClick={() => onCreerAO(avis.id)} disabled={enCreation}>
          <Plus aria-hidden strokeWidth={1.75} /> {enCreation ? 'Création…' : 'Créer l’AO'}
        </Bouton>
        {lien && (
          <a href={lien} target="_blank" rel="noopener noreferrer" className={classesBouton('lien', '[@media(pointer:coarse)]:min-h-11')}>
            Voir l’avis <ExternalLink aria-hidden strokeWidth={1.75} /><span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
          </a>
        )}
        {creationEnErreur && <p role="status" className="basis-full text-sm text-fg-2">La création n’a pas abouti. Réessayez dans un instant.</p>}
      </div>
    </article>
  )
}
