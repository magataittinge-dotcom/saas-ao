import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Bouton } from '@/components/ui/bouton'
import type { RubriqueId } from '@/lib/entreprise/avancement'
import { LIBELLE_FICHE, lienFiche } from '@/lib/fiche'

export interface EtatEnregistrement { enCours: boolean; reussi: boolean; erreur: string | null }

function Actions({ rubrique, idFormulaire, etat }: { rubrique: RubriqueId; idFormulaire: string; etat: EtatEnregistrement }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <p role={etat.erreur ? 'alert' : 'status'} className={cn('max-w-md text-sm empty:hidden', etat.erreur ? 'font-medium text-rouge-ink' : 'text-fg-2')}>
        {etat.erreur ?? (etat.reussi ? 'Modifications enregistrées' : null)}
      </p>
      <Bouton variante="secondaire" asChild><Link to={lienFiche(rubrique)}>{LIBELLE_FICHE}</Link></Bouton>
      <Bouton type="submit" form={idFormulaire} variante="principal" enCours={etat.enCours} libelleEnCours="Enregistrement…">Enregistrer</Bouton>
    </div>
  )
}

/**
 * Le formulaire d'une rubrique, sur toute la largeur de la page, posé sur le papier de la page (ce n'est pas une carte :
 * ses listes et ses dépôts ont leurs propres cadres, et il n'y a jamais de carte dans une carte). En-tête : le titre de la
 * rubrique, une ligne d'explication, « Fiche à télécharger » et « Enregistrer » (le seul bouton plein de l'écran) ; puis
 * `avant` (« Décrire avec vos mots », dépôts) ; puis les groupes de champs.
 * Les boutons vivent dans l'en-tête : rien ne recouvre un champ. Une copie des boutons, collée en haut de la zone de
 * défilement (<main>), n'apparaît qu'une fois l'en-tête sorti de l'écran par le haut ; <main> reçoit alors un
 * `scroll-padding-top` à sa hauteur, si bien qu'un champ qui prend le focus n'est jamais masqué par elle.
 */
export default function CadreFormulaire({ rubrique, titre, explication, etat, onEnregistrer, avant, children, idPanneau, idOnglet }: {
  rubrique: RubriqueId
  titre: string
  explication: ReactNode
  etat: EtatEnregistrement
  onEnregistrer: () => void
  avant?: ReactNode
  children: ReactNode
  idPanneau?: string
  idOnglet?: string
}) {
  const idFormulaire = useId()
  const idTitre = useId()
  const entete = useRef<HTMLDivElement>(null)
  const barre = useRef<HTMLDivElement>(null)
  const [colle, setColle] = useState(false)

  // La version collée n'apparaît qu'après avoir défilé sous l'en-tête. Un IntersectionObserver ne se déclenche qu'au franchissement
  // d'un seuil : « sous l'en-tête » (en haut) et « avant l'en-tête » (en bas) sont tous deux « hors de la zone », et un saut d'ancre
  // de l'un à l'autre ne franchirait rien. La zone observée est donc la bande au-dessus de <main> (marge haute énorme, bas
  // ramené à 1 % du haut) : l'en-tête n'y est entièrement contenu que lorsqu'il est sorti par le haut.
  useEffect(() => {
    const cible = entete.current
    if (!cible || typeof IntersectionObserver !== 'function') return
    const defilant = cible.closest('main') as HTMLElement | null
    const io = new IntersectionObserver(
      (es) => {
        const e = es[es.length - 1]
        setColle(e.isIntersecting && e.intersectionRatio >= 0.99)
      },
      { root: defilant, rootMargin: '100000px 0px -99% 0px', threshold: [0, 0.99, 1] },
    )
    io.observe(cible)
    return () => io.disconnect()
  }, [])

  // <main> garde de la place au-dessus d'un champ focalisé, à la hauteur de la barre collée.
  useEffect(() => {
    const defilant = entete.current?.closest('main') as HTMLElement | null
    if (!defilant) return
    if (colle && barre.current) defilant.style.scrollPaddingTop = `${Math.ceil(barre.current.getBoundingClientRect().height) + 8}px`
    else defilant.style.scrollPaddingTop = ''
    return () => { defilant.style.scrollPaddingTop = '' }
  }, [colle])

  return (
    <section id={idPanneau} role="tabpanel" aria-labelledby={idOnglet ?? idTitre} className="mt-10 max-md:mt-[30px]">
      <div className="sticky top-0 z-20 h-0">
        {colle && (
          <div ref={barre} data-barre-collee="" className="absolute inset-x-0 top-0 border-b border-bord bg-surface-page py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base font-semibold text-fg">{titre}</p>
              <Actions rubrique={rubrique} idFormulaire={idFormulaire} etat={etat} />
            </div>
          </div>
        )}
      </div>
      <div ref={entete} className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <h2 id={idTitre} className="text-lg font-semibold text-fg">{titre}</h2>
          <p className="mt-1 max-w-prose text-sm text-fg-2">{explication}</p>
        </div>
        <Actions rubrique={rubrique} idFormulaire={idFormulaire} etat={etat} />
      </div>
      {avant && <div className="mt-6">{avant}</div>}
      <form id={idFormulaire} onSubmit={(e) => { e.preventDefault(); onEnregistrer() }} className="mt-8 grid gap-10">
        {children}
      </form>
    </section>
  )
}
