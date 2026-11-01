import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { RubriqueId } from '@/lib/entreprise/avancement'
import { LIBELLE_FICHE, lienFiche } from '@/lib/fiche'

export interface EtatEnregistrement { enCours: boolean; reussi: boolean; erreur: string | null }

const LIEN_FICHE = 'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-pilule border border-bord-2 px-3.5 text-sm font-medium text-fg transition-colors duration-base ease-lien hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11'

function Actions({ rubrique, idFormulaire, etat }: { rubrique: RubriqueId; idFormulaire: string; etat: EtatEnregistrement }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
      <p role={etat.erreur ? 'alert' : 'status'} className={cn('text-sm empty:hidden', etat.erreur ? 'text-danger' : 'text-fg-2')}>
        {etat.erreur ?? (etat.reussi ? 'Modifications enregistrées' : null)}
      </p>
      <Link to={lienFiche(rubrique)} className={LIEN_FICHE}>{LIBELLE_FICHE} <ArrowRight size={14} aria-hidden /></Link>
      <Button type="submit" form={idFormulaire} disabled={etat.enCours} className="px-6">
        {etat.reussi && !etat.enCours ? <><CheckCircle2 size={16} aria-hidden />Enregistré</> : <><Save size={16} aria-hidden />{etat.enCours ? 'Enregistrement...' : 'Enregistrer'}</>}
      </Button>
    </div>
  )
}

/**
 * Le formulaire d'une rubrique, sur toute la largeur sous les cartes : en-tête (titre, une ligne d'explication, « Fiche à
 * télécharger » et « Enregistrer »), puis `avant` (« Décrire avec vos mots »), puis les groupes de champs.
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
    <section id={idPanneau} role="tabpanel" aria-labelledby={idOnglet ?? idTitre} className="rounded-carte bg-surface-1 p-5 sm:p-6 animate-fade-in motion-reduce:animate-none">
      <div className="sticky -top-5 z-20 h-0">
        {colle && (
          <div ref={barre} data-barre-collee="" className="absolute inset-x-0 top-0 -mx-5 border-b border-bord-2 bg-[var(--glass-fill)] px-5 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-base font-semibold text-fg">{titre}</p>
              <Actions rubrique={rubrique} idFormulaire={idFormulaire} etat={etat} />
            </div>
          </div>
        )}
      </div>
      <div ref={entete} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <h2 id={idTitre} className="font-display text-xl font-semibold leading-tight text-fg">{titre}</h2>
          <p className="mt-1 text-sm text-fg-2">{explication}</p>
        </div>
        <Actions rubrique={rubrique} idFormulaire={idFormulaire} etat={etat} />
      </div>
      {avant && <div className="mt-5">{avant}</div>}
      <form id={idFormulaire} onSubmit={(e) => { e.preventDefault(); onEnregistrer() }} className="mt-6 space-y-8">
        {children}
      </form>
    </section>
  )
}
