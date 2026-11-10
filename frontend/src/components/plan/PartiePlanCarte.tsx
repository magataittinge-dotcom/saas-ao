import { useId, useRef } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { EtatElement } from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { MenuElement, MenuPoints, MenuSeparateur } from '@/components/ui/menu'
import { PastilleEtat } from '@/components/ui/pastille'
import { cn } from '@/lib/utils'
import { MAX_TITRE, ficheRemplie, libellePoids, type FichePlan, type PartiePlan, type SourcePlan } from '@/lib/planMemoire'
import FichePartie, { libelleSource } from './FichePartie'
import { demandePar } from './demandePar'
import MentionRecoupe from './MentionRecoupe'

/**
 * Une partie du plan : une rangée à filet dans la carte de son groupe (jamais une carte par partie). Son titre se modifie en
 * place (le champ ne montre son trait qu'au survol et au focus : au repos, c'est un titre), dessous ce qui la justifie (les
 * sous-critères du règlement qu'elle sert avec leur poids, la source quand le dossier l'annonce). Deux gestes à droite :
 * « Fiche » (déplie) et le menu « … » de la rangée, dont chaque geste est écrit en mots (Renommer, Monter, Descendre,
 * Retirer du plan ou Supprimer). Monter et descendre laissent le menu ouvert : on déplace d'un cran à la fois sans le rouvrir.
 * Une partie retirée passe sous « Parties habituelles » (PartieHabituelle), d'où on la remet.
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
  const champ = useRef<HTMLInputElement>(null)
  const ajout = partie.cle.includes('.ajout_')
  const nom = partie.titre || partie.titre_modele || 'cette partie'
  const annoncee = partie.attendues[0]

  // Ordinateur : « Fiche » à droite du titre. Téléphone : sous la justification, pour laisser sa largeur au titre.
  const boutonFiche = (classe: string) => (
    <Bouton variante="discret" onClick={onBasculerFiche} aria-expanded={ouverte} aria-controls={idFiche} className={classe}>
      Fiche
      {ficheRemplie(partie.fiche) && <PastilleEtat sens="vert">Remplie</PastilleEtat>}
      <ChevronDown aria-hidden className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', ouverte && 'rotate-180')} />
    </Bouton>
  )

  return (
    <li data-partie={partie.cle} className="min-w-0 border-t border-bord px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex items-center gap-x-1 sm:gap-x-2">
        <span className="chiffres w-6 shrink-0 text-sm font-medium text-fg-3" aria-hidden>{numero ?? '–'}</span>
        <Champ
          ref={champ}
          value={partie.titre}
          maxLength={MAX_TITRE}
          aria-label={`Titre de la partie ${numero ?? ''}`.trim()}
          onChange={(e) => onRenommer(e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) onRenommer(partie.titre_modele ?? 'Nouvelle partie') }}
          className="-ml-2 h-11 min-w-0 flex-1 truncate border-transparent bg-transparent px-2 text-base font-semibold hover:border-bord-champ focus-visible:bg-surface-0"
        />
        {boutonFiche('max-sm:hidden')}
        <MenuPoints libelle={`Actions : ${nom}`}>
          <MenuElement onSelect={() => { setTimeout(() => { champ.current?.focus(); champ.current?.select() }, 0) }}>
            <Pencil aria-hidden size={16} strokeWidth={1.5} /> Renommer
          </MenuElement>
          <MenuElement disabled={!peutMonter} onSelect={(e) => { e.preventDefault(); onMonter() }}>
            <ArrowUp aria-hidden size={16} strokeWidth={1.5} /> Monter
          </MenuElement>
          <MenuElement disabled={!peutDescendre} onSelect={(e) => { e.preventDefault(); onDescendre() }}>
            <ArrowDown aria-hidden size={16} strokeWidth={1.5} /> Descendre
          </MenuElement>
          <MenuSeparateur />
          <MenuElement danger disabled={seulementGardee} onSelect={ajout ? onSupprimer : onRetirer}>
            <Trash2 aria-hidden size={16} strokeWidth={1.5} /> {ajout ? 'Supprimer' : 'Retirer du plan'}
          </MenuElement>
        </MenuPoints>
      </div>

      <div className="space-y-1 pb-1 pl-8" data-justification="">
        {partie.sous_criteres.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2" aria-label="Sous-critères servis">
            {partie.sous_criteres.map((s) => (
              <li key={s.nom} className="inline-flex min-w-0 items-center gap-1.5">
                <Check size={14} strokeWidth={2} aria-hidden className="shrink-0 text-vert-ink" />
                <span className="min-w-0 break-words">{libellePoids(s.nom, s.poids)}</span>
              </li>
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
        {boutonFiche('-ml-3 sm:hidden')}
      </div>

      {ouverte && (
        <div id={idFiche}>
          <FichePartie partie={partie} onChange={onFiche} onVoirSource={onVoirSource} />
        </div>
      )}
    </li>
  )
}
