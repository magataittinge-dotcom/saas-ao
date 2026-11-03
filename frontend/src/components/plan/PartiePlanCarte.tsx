import { useId } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, X } from 'lucide-react'
import { EtatElement } from '@/components/etape'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MAX_TITRE, ficheRemplie, libellePoids, type FichePlan, type PartiePlan, type SourcePlan } from '@/lib/planMemoire'
import FichePartie, { libelleSource } from './FichePartie'
import { demandePar } from './demandePar'
import MentionRecoupe from './MentionRecoupe'

const BOUTON_ICONE = 'grid size-9 shrink-0 place-items-center rounded-md text-fg-3 transition-colors duration-base ease-lien hover:bg-surface-0 hover:text-fg disabled:pointer-events-none disabled:opacity-40 [@media(pointer:coarse)]:size-11'

/**
 * Une partie du plan : son titre (modifiable), les sous-critères du règlement qu'elle sert avec leur poids, la source quand le
 * dossier l'annonce, et ses gestes (monter, descendre, retirer, ouvrir la fiche). Une partie retirée passe sous « Parties habituelles »
 * (PartieHabituelle), d'où on la remet. Tout se fait au clavier.
 */
export default function PartiePlanCarte({
  partie, numero, ouverte, peutMonter, peutDescendre, seulementGardee,
  recoupe, onBasculerFiche, onRenommer, onRetirer, onSupprimer, onMonter, onDescendre, onFiche, onVoirSource,
}: {
  partie: PartiePlan
  numero: number | null
  ouverte: boolean
  peutMonter: boolean
  peutDescendre: boolean
  /** C'est la dernière partie gardée : elle ne se retire pas. */
  seulementGardee: boolean
  /** Une partie plus haut sert le même sous-critère avec un titre proche. */
  recoupe?: { cle: string; titre: string } | null
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
      className="min-w-0 rounded-carte border border-bord-2 bg-surface-1 p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-fg-3" aria-hidden>
          {numero ?? '–'}
        </span>
        <Input
          value={partie.titre}
          maxLength={MAX_TITRE}
          aria-label={`Titre de la partie ${numero ?? ''}`.trim()}
          onChange={(e) => onRenommer(e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) onRenommer(partie.titre_modele ?? 'Nouvelle partie') }}
          className="min-w-0 flex-1 basis-48 font-medium"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" className={BOUTON_ICONE} onClick={onMonter} disabled={!peutMonter} aria-label={`Monter : ${nom}`}>
            <ArrowUp size={16} aria-hidden />
          </button>
          <button type="button" className={BOUTON_ICONE} onClick={onDescendre} disabled={!peutDescendre} aria-label={`Descendre : ${nom}`}>
            <ArrowDown size={16} aria-hidden />
          </button>
          <button
            type="button" className={cn(BOUTON_ICONE, 'hover:text-danger')} onClick={ajout ? onSupprimer : onRetirer}
            disabled={seulementGardee} aria-label={`${ajout ? 'Supprimer' : 'Retirer'} : ${nom}`}
          >
            <X size={16} aria-hidden />
          </button>
          <button
            type="button" onClick={onBasculerFiche} aria-expanded={ouverte} aria-controls={idFiche}
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent-text hover:bg-surface-0 [@media(pointer:coarse)]:min-h-11"
          >
            Fiche
            {ficheRemplie(partie.fiche) && <span className="pill pill-vert ml-1" aria-label="fiche remplie">remplie</span>}
            <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-base ease-lien motion-reduce:transition-none', ouverte && 'rotate-180')} />
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-1.5 pl-8" data-justification="">
        {partie.sous_criteres.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Sous-critères servis">
            {partie.sous_criteres.map((s) => (
              <li key={s.nom} className="pill pill-vert"><Check size={12} strokeWidth={2.4} aria-hidden />{libellePoids(s.nom, s.poids)}</li>
            ))}
          </ul>
        )}
        {annoncee ? (
          <EtatElement
            etat="pret"
            texte={demandePar(annoncee.source)}
            source={{
              libelle: libelleSource(annoncee.source),
              onVoir: annoncee.source?.document ? () => onVoirSource(annoncee.source) : undefined,
            }}
          />
        ) : (
          partie.sous_criteres.length === 0 && !ajout && <p className="text-sm text-fg-2">Partie habituelle du mémoire.</p>
        )}
        {recoupe && <MentionRecoupe titre={recoupe.titre} onRetirer={ajout ? onSupprimer : onRetirer} />}
      </div>

      {ouverte && (
        <div id={idFiche}>
          <FichePartie partie={partie} onChange={onFiche} onVoirSource={onVoirSource} />
        </div>
      )}
    </li>
  )
}
