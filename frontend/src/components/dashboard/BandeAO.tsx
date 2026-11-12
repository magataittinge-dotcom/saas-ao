// « Vos appels d'offres en cours » sur l'Accueil : une seule surface, une rangée par AO (nom, acheteur et lot, fil des
// 7 étapes, remise, verbe de l'étape), trois au plus ; puis, à part, les AO « à mettre à jour » (remise passée), dont la seule
// action est « Mettre à jour le statut ». Les états, les mots et les verbes viennent de `lib/etatAO.ts` : les mêmes que sur
// Mes AO, dans la barre et dans Ctrl K. Le premier AO (la prochaine remise) porte l'action de l'écran : le seul bouton plein.
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { FilPoints, JaugeLecture, PastilleRemise } from '@/components/mesao/Etat'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { EtatVide } from '@/components/ui/etats'
import { TitreSection } from '@/components/ui/page'
import { aLaUne, aoDansEtat, lectureAO, lienAO } from '@/lib/etatAO'
import { momentParis } from '@/lib/remiseParis'
import { usePrechargementAO } from '@/lib/prechargementAO'
import { acheteurCourt, avancementAffiche, comparerParRemise, enTraitement, filDeLAO, jourCourt, lierNumero, niveauRemise, quandCourt } from '@/lib/mesAO'
import type { Project } from '@/types'

/** Ce qu'il reste à faire sur un AO : le verbe de la fonction d'état (lib/etatAO.ts). */
export const prochaineEtape = (p: Project, maintenant: Date = new Date()): string => lectureAO(p, maintenant).action.verbe

/** Combien d'AO l'Accueil montre dans chaque groupe ; le reste est dans Mes AO. */
export const MAX_BANDE = 3

/** Les AO en cours, la remise la plus proche d'abord (sans date à la fin), trois au plus. */
export function aoDeLaBande(projets: readonly Project[], max = MAX_BANDE, maintenant: Date = new Date()): Project[] {
  return aoDansEtat(projets, 'en_cours', maintenant).sort((a, b) => comparerParRemise(a, b, maintenant)).slice(0, max)
}

/** Les AO à mettre à jour (remise passée, statut encore ouvert), la remise la plus récente d'abord. */
export function aoAMettreAJour(projets: readonly Project[], maintenant: Date = new Date()): Project[] {
  return aoDansEtat(projets, 'a_mettre_a_jour', maintenant)
    .sort((a, b) => (lectureAO(b, maintenant).echeance.limite?.getTime() ?? 0) - (lectureAO(a, maintenant).echeance.limite?.getTime() ?? 0))
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

export interface PropsBandeAO {
  projets: readonly Project[]
  maintenant?: Date
  /** Ouvre « Mettre à jour le statut » pour cet AO. */
  onStatut?: (p: Project) => void
  onNouveau: () => void
}

const RANGEE = 'grid min-w-0 gap-x-6 gap-y-3 border-t border-bord px-5 py-4 first:border-t-0 sm:px-6'

export default function BandeAO({ projets, maintenant = new Date(), onStatut, onNouveau }: PropsBandeAO) {
  const enCours = aoDansEtat(projets, 'en_cours', maintenant)
  const liste = aoDeLaBande(projets, MAX_BANDE, maintenant)
  const passees = aoAMettreAJour(projets, maintenant)
  const une = aLaUne(projets, maintenant)
  const precharger = usePrechargementAO()
  const tousMesAO = <Link to="/projects" className={classesBouton('lien')}>Tous mes appels d’offres<ArrowRight aria-hidden strokeWidth={1.75} /></Link>
  return (
    <section aria-labelledby="t-bande" data-bande-ao className="mt-10 max-md:mt-7.5">
      {/* le premier titre de la bande porte le lien vers Mes AO : « En cours », ou « À mettre à jour » s'il n'y a que cela */}
      {(liste.length > 0 || passees.length === 0) && (
        <TitreSection id="t-bande" action={tousMesAO}>
          Vos appels d’offres en cours{enCours.length > 0 && <span className="chiffres ml-2 font-normal text-fg-3">{enCours.length}</span>}
        </TitreSection>
      )}

      {liste.length === 0 ? (
        passees.length === 0 && (
          <EtatVide titre="Aucun appel d’offres en cours"
            phrase="Choisissez un avis de la veille, ou déposez le dossier de l’acheteur : Synorix le lit et prépare la décision."
            action={<Bouton onClick={onNouveau}>Nouvel appel d’offres</Bouton>} />
        )
      ) : (
        <Carte sansMarge>
          <ul>
            {liste.map((p) => {
              const lecture = lectureAO(p, maintenant)
              const { etape, total, nom } = avancementAffiche(p)
              const quand = quandCourt(p)
              const sousTitre = [acheteurCourt(p.maitre_ouvrage), p.selected_lot_name].filter(Boolean).join(' · ')
              const traitement = enTraitement(p)
              return (
                <li key={p.id} data-ao={p.id} className={`${RANGEE} lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-center`}>
                  <div className="min-w-0">
                    <Link to={`/projects/${p.id}`} {...precharger(p)} className="block break-words text-base font-semibold leading-snug text-fg underline-offset-4 hover:underline max-md:-my-3 max-md:py-3 [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:py-3"><span className="line-clamp-2">{lierNumero(p.name)}</span></Link>
                    {sousTitre && <p className="mt-0.5 truncate text-sm text-fg-2">{sousTitre}</p>}
                  </div>
                  <div className="min-w-0">
                    {traitement ? <JaugeLecture pct={p.processing_progress ?? 0} className="max-w-[320px]" /> : <FilPoints fil={filDeLAO(p)} className="max-w-[320px]" />}
                    <p className="mt-1.5 text-sm text-fg-2">
                      {traitement ? (p.processing_detail || 'Synorix s’en occupe') : <><strong className="font-semibold text-fg">{nom}</strong> · étape {etape} sur {total}</>}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                    {lecture.echeance.etat === 'sans_date'
                      ? <span className="text-sm text-fg-2">Date de remise à préciser</span>
                      : (
                        <>
                          <PastilleRemise libelle={lecture.echeance.libelle} niveau={niveauRemise(p, maintenant)} />
                          {quand && <span className="text-sm text-fg-2">{quand}</span>}
                        </>
                      )}
                  </div>
                  <div className="flex lg:justify-end">
                    {!traitement && (
                      <Bouton asChild variante={une?.id === p.id ? 'principal' : 'secondaire'} className="max-sm:w-full">
                        <Link to={lienAO(p, maintenant)} {...precharger(p, lienAO(p, maintenant))}>{lecture.action.verbe}<ArrowRight aria-hidden strokeWidth={1.75} /></Link>
                      </Bouton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {enCours.length > liste.length && (
            <p className="border-t border-bord px-5 py-3 text-sm text-fg-2 sm:px-6">
              <Link to="/projects" className={classesBouton('lien')}>Voir les {enCours.length - liste.length} autres dans Mes AO</Link>
            </p>
          )}
        </Carte>
      )}

      {passees.length > 0 && (
        <div data-a-mettre-a-jour="" className={liste.length > 0 ? 'mt-10 max-md:mt-7.5' : undefined}>
          <TitreSection id={liste.length > 0 ? undefined : 't-bande'} action={liste.length > 0 ? undefined : tousMesAO}>
            À mettre à jour <span className="ml-1 font-normal text-fg-3">{passees.length}</span>
          </TitreSection>
          <Carte sansMarge>
            <ul aria-label="Appels d’offres à mettre à jour">
              {passees.slice(0, MAX_BANDE).map((p) => {
                const limite = lectureAO(p, maintenant).echeance.limite
                return (
                  <li key={p.id} data-remise-passee={p.id} className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-bord px-5 py-4 transition-colors duration-fast ease-survol first:border-t-0 hover:bg-surface-1 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:gap-x-6 sm:px-6">
                    {/* la ligne entière est le geste (jury, tour 1 : trois boutons identiques l'un sous l'autre) : le nom porte le bouton, étendu à la ligne */}
                    <div className="min-w-0">
                      <Bouton variante="lien" onClick={() => onStatut?.(p)}
                        className="block h-auto w-full whitespace-normal break-words text-left text-base font-semibold leading-snug text-fg hover:no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent-ring [@media(pointer:coarse)]:min-h-0">
                        <span className="line-clamp-2">{lierNumero(p.name)}</span>
                        <span className="sr-only">. Mettre à jour le statut</span>
                      </Bouton>
                      {acheteurCourt(p.maitre_ouvrage) && <p className="mt-0.5 text-sm text-fg-2 max-sm:line-clamp-2 sm:truncate">{acheteurCourt(p.maitre_ouvrage)}</p>}
                      {limite && <p className="mt-0.5 text-sm text-fg-3 sm:hidden">Remise le {jourCourt(limite)} {momentParis(limite).an}</p>}
                    </div>
                    <p className="text-sm text-fg-2 max-sm:hidden">{limite ? `Remise le ${jourCourt(limite)} ${momentParis(limite).an}` : ''}</p>
                    <ChevronRight aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-fg-3" />
                  </li>
                )
              })}
            </ul>
            {passees.length > MAX_BANDE && (
              <p className="border-t border-bord px-5 py-3 text-sm text-fg-2 sm:px-6">
                <Link to="/projects" className={classesBouton('lien', '[@media(pointer:coarse)]:min-h-11')}>Voir les {pluriel(passees.length - MAX_BANDE, 'autre', 'autres')} dans Mes AO<ArrowRight aria-hidden strokeWidth={1.75} /></Link>
              </p>
            )}
          </Carte>
        </div>
      )}
    </section>
  )
}
