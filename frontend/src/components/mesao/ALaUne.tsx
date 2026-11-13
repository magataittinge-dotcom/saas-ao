import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { TitreSection } from '@/components/ui/page'
import { lectureAO, lienAO } from '@/lib/etatAO'
import { usePrechargementAO } from '@/lib/prechargementAO'
import { acheteurCourt, avancementAffiche, enTraitement, faitsALaUne, filDeLAO, niveauRemise, quandCourt } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { FilPoints, JaugeLecture, PastilleRemise, TON_TEXTE } from './Etat'

/**
 * « À la une » : la prochaine remise à venir (`aLaUne`, lib/etatAO.ts ; aucune à venir : l'écran ne pose pas ce bloc). La
 * phrase, le verbe et les faits sortent du même calcul (`lectureAO`, `faitsALaUne`) : la phrase ne dit jamais « tout est
 * fait » à côté de pièces à joindre. C'est l'action de l'écran : le seul bouton plein. Aucun visage ici (une carte d'AO).
 */
export function ALaUne({ projet, maintenant = new Date() }: { projet: Project; maintenant?: Date }) {
  const lecture = lectureAO(projet, maintenant)
  const quand = quandCourt(projet)
  const { etape, total, nom } = avancementAffiche(projet)
  const faits = faitsALaUne(projet, maintenant)
  const traitement = enTraitement(projet)
  const precharger = usePrechargementAO()
  const complement = [acheteurCourt(projet.maitre_ouvrage), projet.selected_lot_name].filter(Boolean).join(' · ')
  return (
    <section aria-labelledby="une-titre" data-a-la-une={projet.id}>
      <TitreSection>À la une <span className="font-normal text-fg-3">· la prochaine remise</span></TitreSection>
      <Carte className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-center lg:gap-8">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <PastilleRemise libelle={lecture.echeance.libelle} niveau={niveauRemise(projet, maintenant)} />
            {quand && <span className="whitespace-nowrap text-sm font-semibold text-fg">{quand}</span>}
          </div>
          <h3 id="une-titre" className="line-clamp-3 break-words text-xl font-semibold leading-tight tracking-[-0.01em] text-fg">{projet.name}</h3>
          {complement && <p className="truncate text-sm text-fg-2">{complement}</p>}
          <p className="max-w-[62ch] text-base text-fg-2">{lecture.phrase}</p>
          <div className="mt-1 max-w-[560px]">
            <FilPoints fil={filDeLAO(projet)} etiquettes />
            {/* le fil nomme déjà les sept étapes à partir de 640 px : la ligne ne reste écrite qu'au téléphone (jury, tour 3) */}
            <p className="mt-2 text-sm text-fg-2 sm:sr-only"><strong className="font-semibold text-fg">{nom}</strong> · étape {etape} sur {total}</p>
          </div>
          {traitement ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <JaugeLecture pct={projet.processing_progress ?? 0} className="w-40" />
              <span className="text-sm text-fg-2">{projet.processing_detail || 'Synorix s’en occupe'}</span>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Bouton asChild variante="principal" className="max-sm:w-full">
                <Link to={lienAO(projet, maintenant)} {...precharger(projet, lienAO(projet, maintenant))}>{lecture.action.verbe}<ArrowRight aria-hidden strokeWidth={1.75} /></Link>
              </Bouton>
              <Link to={`/projects/${projet.id}`} {...precharger(projet)} className={classesBouton('lien')}>Ouvrir l’appel d’offres</Link>
            </div>
          )}
        </div>
        {faits.length > 0 && (
          <dl className="m-0 flex flex-col border-t border-bord pt-2 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
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
      </Carte>
    </section>
  )
}
