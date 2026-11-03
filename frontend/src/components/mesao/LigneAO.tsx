import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink, HelpCircle, Loader2, MapPin, Trash2 } from 'lucide-react'
import { echeanceAO, etatEcheance } from '@/lib/echeance'
import { actionEtape, lienEtape } from '@/lib/intelligence/action'
import { avancementAffiche, enTraitement, filDeLAO, niveauRemise, quandCourt, texteUnites, versAvisOrigine } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { FilPoints, JaugeLecture, Pastille, PastilleRemise } from './Etat'

/** Colonnes de la liste sur grand écran : l'AO · où vous en êtes · la remise · les unités · l'action. */
export const COLONNES = 'xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1.05fr)_minmax(0,.85fr)_minmax(0,1.35fr)]'

export function EnTeteListe() {
  return (
    <div aria-hidden className={cn('hidden gap-5 bg-surface-1 px-5 py-3 text-xs font-semibold uppercase tracking-[.06em] text-fg-3 xl:grid', COLONNES)}>
      <span>Appel d’offres</span><span>Où vous en êtes</span><span>Remise</span><span>Unités</span><span className="text-right">Prochaine action</span>
    </div>
  )
}

const libelleLecture = (p: Project): string =>
  p.processing_detail || (p.processing_status === 'generating' ? 'Synorix rédige le mémoire' : 'Synorix lit le dossier')

/**
 * Une ligne par AO en cours (une carte au téléphone et sur écran étroit). Le bouton porte le verbe de `actionEtape()` — jamais
 * « Continuer » — ; un AO dont le dossier est en lecture montre la jauge et aucun bouton.
 */
export function LigneAO({ projet, maintenant = new Date(), onSupprimer }: { projet: Project; maintenant?: Date; onSupprimer?: (id: string, nom: string) => void }) {
  const e = etatEcheance(echeanceAO(projet), maintenant)
  const niveau = niveauRemise(projet, maintenant)
  const quand = quandCourt(projet)
  const { etape, total, nom } = avancementAffiche(projet)
  const traitement = enTraitement(projet)
  const action = actionEtape(projet)
  const unites = texteUnites(projet.avancement)
  const origine = versAvisOrigine(projet)
  const questions = projet.infos_marche?.points_a_eclaircir?.length ?? 0
  const complement = [projet.maitre_ouvrage, projet.selected_lot_name].filter(Boolean).join(' · ')
  const [u1, u2] = unites ? unites.split(' · ') : [null, null]
  return (
    <article data-ligne-ao={projet.id} className={cn('grid gap-3 border-t border-bord-2 px-4 py-4 first:border-t-0 hover:bg-surface-1 sm:px-5 xl:items-center xl:gap-5', COLONNES)}>
      {/* L'AO */}
      <div className="flex min-w-0 flex-col gap-1">
        <Link to={`/projects/${projet.id}`} className="break-words text-[15px] font-semibold leading-snug text-fg hover:text-accent-text">{projet.name}</Link>
        {complement && <span className="break-words text-[13px] text-fg-2">{complement}</span>}
        {questions > 0 && (
          <Pastille ton="ambre" icone={HelpCircle} className="text-xs">{questions} question{questions > 1 ? 's' : ''} à poser à l’acheteur</Pastille>
        )}
        {origine && (
          <a href={origine.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 w-fit max-w-full items-center gap-1.5 rounded-pilule bg-turquoise-soft px-2.5 py-0.5 text-xs font-medium text-turquoise-ink hover:underline [@media(pointer:coarse)]:min-h-11">
            <MapPin size={13} aria-hidden className="shrink-0" />
            <span className="min-w-0 truncate">Trouvé par la veille{origine.id ? ` · avis ${origine.id}` : ''}</span>
            <ExternalLink size={11} aria-hidden className="shrink-0" /><span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
          </a>
        )}
      </div>

      {/* Où vous en êtes */}
      <div className="flex min-w-0 flex-col gap-1.5">
        {traitement ? (
          <>
            <JaugeLecture pct={projet.processing_progress ?? 0} />
            <span className="text-[13px] text-fg-2">{libelleLecture(projet)}</span>
          </>
        ) : (
          <>
            <FilPoints fil={filDeLAO(projet)} className="max-w-[210px]" />
            <span className="text-[13px] text-fg-2"><strong className="font-semibold text-fg">{nom}</strong> · étape {etape} sur {total}</span>
          </>
        )}
      </div>

      {/* La remise */}
      <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2.5 gap-y-1 xl:flex-col xl:items-start">
        {e.etat === 'sans_date' ? (
          <span className="text-[13px] text-fg-2">Date de remise à préciser</span>
        ) : (
          <>
            <PastilleRemise libelle={e.etat === 'passee' ? 'Date passée' : e.libelle} niveau={niveau} passee={e.etat === 'passee'}
              ariaLibelle={e.etat === 'passee' ? 'Date de remise passée' : e.etat === 'aujourdhui' ? 'Remise aujourd’hui' : `Remise dans ${e.jours} jour${(e.jours ?? 0) > 1 ? 's' : ''}`} />
            {quand && <span className="text-[13px] text-fg-2">{quand}</span>}
          </>
        )}
      </div>

      {/* Les unités : rien tant que le serveur n'en a consommé aucune */}
      <div className="flex min-w-0 flex-row flex-wrap gap-x-1.5 text-[13px] text-fg-2 xl:flex-col">
        {u1 ? <><span>{u1}</span><span aria-hidden className="xl:hidden">·</span><span>{u2}</span></> : projet.avancement ? <span>Pas encore</span> : null}
      </div>

      {/* L'action : le verbe de l'étape ; en lecture, rien */}
      <div className="flex min-w-0 items-center gap-2 xl:justify-end">
        {traitement ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-fg-2"><Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />Synorix s’en occupe</span>
        ) : (
          <Link
            to={lienEtape(projet)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-bleu-soft px-3.5 py-2 text-center text-[13.5px] font-semibold leading-snug text-bleu-ink transition-colors duration-base ease-lien hover:ring-1 hover:ring-bleu-mark xl:flex-none xl:justify-between"
          >
            <span className="min-w-0">{action.verbe}</span><ArrowRight size={15} aria-hidden className="shrink-0" />
          </Link>
        )}
        {onSupprimer && (
          <button
            type="button"
            onClick={() => onSupprimer(projet.id, projet.name)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 hover:bg-surface-2 hover:text-rouge-ink xl:size-9"
            aria-label={`Supprimer l’AO « ${projet.name} »`} title="Supprimer cet AO"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        )}
      </div>
    </article>
  )
}
