import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check, Loader2 } from 'lucide-react'
import { echeanceAO, etatEcheance } from '@/lib/echeance'
import { actionEtape, ficheDepuisProjet, libelleRemise, lienEtape } from '@/lib/intelligence/action'
import { acheteurCourt, avancementAffiche, enTraitement, faitsALaUne, filDeLAO, niveauRemise, quandCourt } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { FilPoints, JaugeLecture, PastilleRemise, TON_TEXTE } from './Etat'
import { VisageRond } from './VisagePetit'

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
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold text-fg">
        À la une<span className="text-[15px] font-normal text-fg-3">{avecRemise ? '· la remise la plus proche' : '· à reprendre'}</span>
      </h2>
      <div className="grid gap-6 rounded-carte border border-bord bg-surface-0 p-5 shadow-card sm:p-6 lg:grid-cols-[96px_minmax(0,1fr)_minmax(0,320px)] lg:items-center lg:gap-8">
        <VisageRond taille={96} className="hidden self-start lg:grid" />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {e.etat !== 'sans_date' ? (
              <PastilleRemise libelle={libelleRemise(e)} niveau={niveau} passee={e.etat === 'passee'} />
            ) : (
              <span className="text-sm text-fg-2">{libelleRemise(e)}</span>
            )}
            {quand && <span className="text-sm font-semibold text-fg">{quand}</span>}
          </div>
          <h3 id="une-titre" className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-fg">{projet.name}</h3>
          {(projet.maitre_ouvrage || projet.selected_lot_name)
            ? <p className="text-sm text-fg-2" title={projet.maitre_ouvrage ?? undefined}>{[acheteurCourt(projet.maitre_ouvrage), projet.selected_lot_name].filter(Boolean).join(' · ')}</p>
            : fiche.meta && <p className="text-sm text-fg-2">{fiche.meta}</p>}
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
              <Link to={lienEtape(projet)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pilule bg-accent-600 px-5 text-sm font-semibold text-accent-on transition-colors duration-base ease-survol hover:bg-accent-700 max-sm:w-full">
                {action.verbe}<ArrowRight size={16} aria-hidden />
              </Link>
              <Link to={`/projects/${projet.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline">Ouvrir l’AO</Link>
            </div>
          )}
        </div>
        {faits.length > 0 && (
          <dl className="m-0 flex flex-col border-t border-bord pt-2 text-[13.5px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {faits.map((f, i) => (
              <div key={f.libelle} className={cn('flex justify-between gap-3 py-2.5', i > 0 && 'border-t border-bord')}>
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
