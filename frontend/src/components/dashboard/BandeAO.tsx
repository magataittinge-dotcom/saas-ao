// « Vos AO en cours » (refonte groupe A, direction A) : une seule surface, une ligne par AO (nom, lot · acheteur, fil des
// 7 étapes, verbe de l'étape, remise, bouton secondaire au verbe de `actionEtape`). Les AO dont la remise est passée sortent
// de la liste et apparaissent en dessous, une ligne rouge chacun, avec le lien pour mettre à jour le statut.
// Aucun appel IA : tout se calcule sur les AO que l'écran reçoit déjà. Le seul dégradé de l'écran reste « Nouvel appel
// d'offres » dans l'en-tête : ici, des boutons secondaires.
import { Link } from 'react-router-dom'
import { Sigle } from '@/components/common/Sigle'
import { AlertCircle, ArrowRight, Clock, FolderX, PenLine } from 'lucide-react'
import { FilPoints, Pastille, PastilleRemise } from '@/components/mesao/Etat'
import { echeanceAO, estEnCours, estEnCoursOuvert, etatEcheance } from '@/lib/echeance'
import { jourLongParis } from '@/lib/dateParis'
import { lienEtape, verbeEtape } from '@/lib/intelligence/action'
import { acheteurCourt, avancementAffiche, filDeLAO, niveauRemise, quandCourt } from '@/lib/mesAO'
import type { Project } from '@/types'

/** Ce qu'il reste à faire sur un AO : un verbe, l'étape qui suit (le calcul commun, lib/intelligence/action.ts). */
export const prochaineEtape = (p: Project): string => verbeEtape(p)

/** Bouton secondaire (DESIGN.md § Buttons) : papier, trait de champ, 14 px de rayon, 44 px ; au survol, trait et texte bleus. */
export const BOUTON_SECONDAIRE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-bord-champ bg-surface-0 px-4 text-sm font-semibold text-fg transition-[border-color,color] duration-base ease-survol hover:border-accent-ui hover:text-accent-text'

/** Les AO en cours, la remise la plus proche d'abord (sans date à la fin), trois au plus. */
export function aoDeLaBande(projets: readonly Project[], max = 3): Project[] {
  return projets
    .filter((p) => estEnCoursOuvert(p))
    .map((p) => ({ p, t: etatEcheance(echeanceAO(p)).limite?.getTime() ?? Infinity }))
    .sort((a, b) => a.t - b.t)
    .slice(0, max)
    .map((x) => x.p)
}

/** Les AO encore « en cours » dont la remise est passée : ils quittent la liste et attendent un nouveau statut. */
export function aoRemisePassee(projets: readonly Project[]): Project[] {
  return projets
    .filter((p) => estEnCours(p.status) && etatEcheance(echeanceAO(p)).etat === 'passee')
    .sort((a, b) => (etatEcheance(echeanceAO(b)).limite?.getTime() ?? 0) - (etatEcheance(echeanceAO(a)).limite?.getTime() ?? 0))
}


const STATUT: Record<string, string> = { brouillon: 'brouillon', en_cours: 'en cours', analyzed: 'analysé' }

export interface PropsBandeAO {
  projets: readonly Project[]
  /** Nombre d'AO en cours au total (le titre le donne quand il dépasse la bande). */
  total: number
  chargement?: boolean
  onSansSuite?: (p: { id: string; name: string }) => void
  onNouveau: () => void
}

export default function BandeAO({ projets, total, chargement, onSansSuite, onNouveau }: PropsBandeAO) {
  const liste = aoDeLaBande(projets)
  const passees = aoRemisePassee(projets)
  return (
    <section aria-labelledby="t-bande" data-bande-ao>
      <div className="flex items-baseline justify-between gap-4 pb-4">
        <h2 id="t-bande" className="text-lg font-semibold text-fg">
          Vos AO en cours
          {total > 0 && <span className="chiffres ml-2 font-normal text-fg-3">{total}</span>}
        </h2>
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text underline-offset-[3px] transition-colors duration-base ease-lien hover:underline [@media(pointer:coarse)]:min-h-11">
          Tous mes AO <ArrowRight size={15} aria-hidden />
        </Link>
      </div>

      <div className="overflow-hidden rounded-carte border border-bord bg-surface-0 shadow-card">
        {chargement ? (
          <ul aria-label="Chargement des appels d'offres">
            {[0, 1].map((i) => <li key={i} className="border-t border-bord px-5 py-5 first:border-t-0"><span className="block h-10 animate-pulse rounded-md bg-surface-1" /></li>)}
          </ul>
        ) : liste.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-6">
            <div>
              <p className="text-[15px] font-semibold text-fg">Aucun appel d'offres en cours</p>
              <p className="mt-0.5 max-w-[60ch] text-[15px] text-fg-2">Choisissez un avis de la veille, ou déposez le <Sigle code="DCE" /> en ZIP ou PDF : Synorix lit les pièces, repère les lots et prépare l'analyse.</p>
            </div>
            <button type="button" onClick={onNouveau} className={BOUTON_SECONDAIRE}>Nouvel appel d'offres</button>
          </div>
        ) : (
          <ul>
            {liste.map((p) => {
              const e = etatEcheance(echeanceAO(p))
              const { etape, total: nb, nom } = avancementAffiche(p)
              const quand = quandCourt(p)
              const aDecider = p.status === 'analyzed' && p.current_step < 4
              const sousTitre = [p.selected_lot_name, acheteurCourt(p.maitre_ouvrage)].filter(Boolean).join(' · ')
              return (
                <li key={p.id} data-ao={p.id} className="grid min-w-0 gap-x-6 gap-y-3 border-t border-bord px-5 py-4 first:border-t-0 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,auto)_auto] lg:items-center">
                  <div className="min-w-0">
                    <Link to={`/projects/${p.id}`} className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-fg transition-colors duration-base hover:text-accent-text">{p.name}</Link>
                    {sousTitre && <p className="mt-0.5 truncate text-[13.5px] text-fg-2">{sousTitre}</p>}
                  </div>
                  <div className="min-w-0">
                    <FilPoints fil={filDeLAO(p)} className="max-w-[320px]" />
                    <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-fg-3">
                      <PenLine size={13} strokeWidth={1.8} aria-hidden className="shrink-0 text-bleu-ink" />
                      <span className="font-semibold text-bleu-ink">{nom}</span>
                      <span className="chiffres">étape {etape} sur {nb}</span>
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    {e.etat === 'sans_date'
                      ? <Pastille ton="ambre" icone={Clock}>Remise : date à préciser</Pastille>
                      : (
                        <>
                          <PastilleRemise libelle={e.libelle} niveau={niveauRemise(p)} />
                          {quand && <span className="chiffres text-[13px] text-fg-2">{quand}</span>}
                        </>
                      )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:justify-end">
                    <Link to={lienEtape(p)} className={BOUTON_SECONDAIRE}>{prochaineEtape(p)} <ArrowRight size={16} aria-hidden /></Link>
                    {aDecider && onSansSuite && (
                      <button
                        onClick={() => onSansSuite({ id: p.id, name: p.name })}
                        title="Classer cet AO « Analysé — sans suite » : décision prise, il quitte le tableau de bord"
                        className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 transition-colors duration-base ease-lien hover:text-fg [@media(pointer:coarse)]:min-h-11"
                      >
                        <FolderX size={13} strokeWidth={1.6} aria-hidden /> Sans suite
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!chargement && passees.length > 0 && (
          <ul aria-label="Remise passée : statut à mettre à jour" className="border-t border-bord bg-surface-1">
            {passees.map((p) => {
              const limite = etatEcheance(echeanceAO(p)).limite
              return (
                <li key={p.id} data-remise-passee={p.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t border-bord px-5 py-3 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                  <AlertCircle size={15} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-rouge-mark sm:mt-0" />
                  <p className="min-w-0 text-[13.5px] text-fg-2 lg:flex lg:items-baseline lg:gap-1.5">
                    <span className="block truncate font-semibold text-fg lg:max-w-[60%]">{p.name}</span>
                    <span className="block lg:shrink-0"><span aria-hidden className="hidden lg:inline">· </span>{STATUT[p.status] ?? p.status}
                      {' · '}<span className="font-semibold text-rouge-ink">remise{limite ? ` du ${jourLongParis(limite)}` : ''} dépassée</span></span>
                  </p>
                  <Link to={`/projects/${p.id}`} className="col-start-2 inline-flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-accent-text underline-offset-[3px] hover:underline sm:col-start-auto [@media(pointer:coarse)]:min-h-11">
                    Mettre à jour le statut <ArrowRight size={15} aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
