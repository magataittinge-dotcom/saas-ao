import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check, Loader2 } from 'lucide-react'
import { echeanceAO, etatEcheance } from '@/lib/echeance'
import { actionEtape, ficheDepuisProjet, libelleRemise, lienEtape } from '@/lib/intelligence/action'
import { avancementAffiche, enTraitement, faitsALaUne, filDeLAO, niveauRemise, quandCourt } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { FilPoints, JaugeLecture, PastilleRemise, TON_TEXTE } from './Etat'
import { VisagePetit } from './VisagePetit'

/**
 * « À la une » : l'AO dont la remise est la plus proche, son action et ses faits. Le texte de l'action est celui de la fiche
 * « Prochaine action » (`ficheDepuisProjet`), le verbe celui de `actionEtape()` : un seul calcul pour tout le produit. Le visage
 * reste en petit sur grand écran et disparaît au téléphone.
 */
export function ALaUne({ projet, maintenant = new Date(), avecRemise }: { projet: Project; maintenant?: Date; avecRemise: boolean }) {
  const fiche = ficheDepuisProjet(projet, maintenant)
  const e = etatEcheance(echeanceAO(projet), maintenant)
  const niveau = niveauRemise(projet, maintenant)
  const quand = quandCourt(projet)
  const { etape, total, nom } = avancementAffiche(projet)
  const faits = faitsALaUne(projet, maintenant)
  const traitement = enTraitement(projet)
  const action = actionEtape(projet)
  return (
    <section aria-labelledby="une-titre" className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[.08em] text-fg-3">
        {avecRemise ? 'À la une · la remise la plus proche' : 'À la une · à reprendre'}
      </p>
      <div className="grid gap-6 rounded-[22px] border border-bord-2 bg-surface-0 p-5 shadow-sm sm:p-6 lg:grid-cols-[136px_minmax(0,1fr)_minmax(0,320px)] lg:items-center lg:gap-7">
        <VisagePetit className="hidden h-[168px] w-[136px] lg:flex" />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {e.etat !== 'sans_date' ? (
              <PastilleRemise libelle={libelleRemise(e)} niveau={niveau} passee={e.etat === 'passee'} />
            ) : (
              <span className="text-sm text-fg-2">{libelleRemise(e)}</span>
            )}
            {quand && <span className="text-sm font-semibold text-fg">{quand}</span>}
          </div>
          <h2 id="une-titre" className="font-display text-h6 leading-tight text-fg sm:text-h5">{projet.name}</h2>
          {fiche.meta && <p className="text-sm text-fg-2">{fiche.meta}</p>}
          <p className="max-w-[62ch] text-[15px] leading-6 text-fg-2">{fiche.texte}</p>
          <div className="mt-1 max-w-[560px]">
            <FilPoints fil={filDeLAO(projet)} etiquettes />
            <p className="mt-2 text-[13px] text-fg-2"><strong className="font-semibold text-fg">{nom}</strong> · étape {etape} sur {total}</p>
          </div>
          {traitement ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <JaugeLecture pct={projet.processing_progress ?? 0} className="w-40" />
              <span className="inline-flex items-center gap-2 text-sm text-fg-2"><Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />{projet.processing_detail || action.verbe}</span>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link to={lienEtape(projet)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-fill px-5 text-sm font-semibold text-accent-on shadow-btn hover:[background-image:var(--accent-fill-hover)] max-sm:w-full">
                {action.verbe}<ArrowRight size={16} aria-hidden />
              </Link>
              <Link to={`/projects/${projet.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline">Ouvrir l’AO</Link>
            </div>
          )}
        </div>
        {faits.length > 0 && (
          <dl className="m-0 flex flex-col rounded-2xl bg-surface-1 px-4 py-2 text-[13.5px]">
            {faits.map((f, i) => (
              <div key={f.libelle} className={cn('flex justify-between gap-3 py-2', i > 0 && 'border-t border-bord-2')}>
                <dt className="text-fg-2">{f.libelle}</dt>
                <dd className={cn('m-0 flex items-start justify-end gap-1.5 text-right font-semibold', f.ton === 'neutre' ? 'text-fg' : f.ton === 'vert' ? TON_TEXTE.vert : TON_TEXTE.ambre)}>
                  {f.ton === 'vert' && <Check size={14} strokeWidth={2.4} aria-hidden className="mt-0.5 shrink-0" />}
                  {f.ton === 'ambre' && <AlertCircle size={14} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0" />}
                  <span>{f.valeur}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
