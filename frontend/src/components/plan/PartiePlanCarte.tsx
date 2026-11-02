import { useId } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Undo2, X } from 'lucide-react'
import { EtatElement } from '@/components/etape'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MAX_TITRE, ficheRemplie, libellePoids, type FichePlan, type PartiePlan, type SourcePlan } from '@/lib/planMemoire'
import FichePartie, { libelleSource } from './FichePartie'

const BOUTON_ICONE = 'grid size-9 shrink-0 place-items-center rounded-md text-fg-3 transition-colors duration-base ease-lien hover:bg-surface-0 hover:text-fg disabled:pointer-events-none disabled:opacity-40 [@media(pointer:coarse)]:size-11'

/**
 * Une partie du plan : son titre (modifiable), les sous-critères du règlement qu'elle sert avec leur poids, la source quand le
 * dossier l'annonce, et ses gestes (monter, descendre, retirer, ouvrir la fiche). Une partie retirée reste visible, grisée :
 * on peut la remettre. Tout se fait au clavier.
 */
export default function PartiePlanCarte({
  partie, numero, ouverte, peutMonter, peutDescendre, seulementGardee,
  onBasculerFiche, onRenommer, onRetirer, onSupprimer, onMonter, onDescendre, onFiche, onVoirSource,
}: {
  partie: PartiePlan
  numero: number | null
  ouverte: boolean
  peutMonter: boolean
  peutDescendre: boolean
  /** C'est la dernière partie gardée : elle ne se retire pas. */
  seulementGardee: boolean
  onBasculerFiche: () => void
  onRenommer: (titre: string) => void
  onRetirer: () => void
  onSupprimer: () => void
  onMonter: () => void
  onDescendre: () => void
  onFiche: (fiche: Partial<FichePlan>) => void
  onVoirSource: (source: SourcePlan) => void
}) {
  const idFiche = useId()
  const ajout = partie.cle.includes('.ajout_')
  const nom = partie.titre || partie.titre_modele || 'cette partie'
  const annoncee = partie.attendues[0]

  return (
    <li
      data-partie={partie.cle}
      data-retiree={partie.retiree ? '' : undefined}
      className={cn('min-w-0 rounded-carte border border-bord-2 bg-surface-1 p-4', partie.retiree && 'bg-surface-0 opacity-80')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-fg-3" aria-hidden>
          {numero ?? '–'}
        </span>
        {partie.retiree ? (
          <p className="min-w-0 flex-1 basis-48 break-words text-sm text-fg-2 line-through decoration-fg-3">{nom}</p>
        ) : (
          <Input
            value={partie.titre}
            maxLength={MAX_TITRE}
            aria-label={`Titre de la partie ${numero ?? ''}`.trim()}
            onChange={(e) => onRenommer(e.target.value)}
            onBlur={(e) => { if (!e.target.value.trim()) onRenommer(partie.titre_modele ?? 'Nouvelle partie') }}
            className="min-w-0 flex-1 basis-48 font-medium"
          />
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          {!partie.retiree && (
            <>
              <button type="button" className={BOUTON_ICONE} onClick={onMonter} disabled={!peutMonter} aria-label={`Monter : ${nom}`}>
                <ArrowUp size={16} aria-hidden />
              </button>
              <button type="button" className={BOUTON_ICONE} onClick={onDescendre} disabled={!peutDescendre} aria-label={`Descendre : ${nom}`}>
                <ArrowDown size={16} aria-hidden />
              </button>
            </>
          )}
          {partie.retiree ? (
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11" onClick={onRetirer}>
              <Undo2 size={14} aria-hidden /> Remettre
            </button>
          ) : (
            <button
              type="button" className={cn(BOUTON_ICONE, 'hover:text-danger')} onClick={ajout ? onSupprimer : onRetirer}
              disabled={seulementGardee} aria-label={`${ajout ? 'Supprimer' : 'Retirer'} : ${nom}`}
            >
              <X size={16} aria-hidden />
            </button>
          )}
          {!partie.retiree && (
            <button
              type="button" onClick={onBasculerFiche} aria-expanded={ouverte} aria-controls={idFiche}
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent-text hover:bg-surface-0 [@media(pointer:coarse)]:min-h-11"
            >
              Fiche
              {ficheRemplie(partie.fiche) && <span className="pill pill-conforme ml-1" aria-label="fiche remplie">remplie</span>}
              <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-base ease-lien motion-reduce:transition-none', ouverte && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>

      {!partie.retiree && (partie.sous_criteres.length > 0 || annoncee) && (
        <div className="mt-2 space-y-1.5 pl-8">
          {partie.sous_criteres.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Sous-critères servis">
              {partie.sous_criteres.map((s) => (
                <li key={s.nom} className="pill pill-cyan">{libellePoids(s.nom, s.poids)}</li>
              ))}
            </ul>
          )}
          {annoncee && (
            <EtatElement
              etat="pret"
              source={{
                libelle: `${libelleSource(annoncee.source)} · annoncée par le dossier`,
                onVoir: annoncee.source?.document ? () => onVoirSource(annoncee.source) : undefined,
              }}
            />
          )}
        </div>
      )}

      {ouverte && !partie.retiree && (
        <div id={idFiche}>
          <FichePartie partie={partie} onChange={onFiche} onVoirSource={onVoirSource} />
        </div>
      )}
    </li>
  )
}
