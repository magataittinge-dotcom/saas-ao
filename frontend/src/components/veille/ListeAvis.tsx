// La liste des avis de la zone choisie : filtres au-dessus (collés en haut à partir de lg), une carte par avis, « Afficher plus »
// (curseur ; la suite se charge aussi toute seule quand le bouton entre dans la zone visible), états vides positifs, source.
//
//   <ListeAvis avis={…} total={…} zoneVide={…} … />
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { EtatErreur, EtatVide } from '@/components/ui/etats'
import { Squelette } from '@/components/ui/squelette'
import { cn } from '@/lib/utils'
import CarteAvis from './CarteAvis'
import FiltresVeille from './FiltresVeille'
import { libelleSourceVeille, type AvisVeille } from '@/services/veille'
import { aDesFiltres, type FiltresAvis, type TriAvis } from '@/lib/veille'

export interface PropsListeAvis {
  avis: readonly AvisVeille[]
  total: number
  /** Aucune zone choisie. */
  zoneVide: boolean
  filtres: FiltresAvis
  onFiltres: (p: Partial<FiltresAvis>) => void
  tri: TriAvis
  onTri: (t: TriAvis) => void
  metiers: readonly { code: string; libelle: string }[]
  nomsDepartements: Readonly<Record<string, string>>
  /** La zone choisie (codes de départements). */
  zone?: readonly string[]
  aPlus: boolean
  chargePlus?: boolean
  onVoirPlus: () => void
  /** Chargement de la première page. */
  enCours?: boolean
  enErreur?: boolean
  /** La zone et les filtres enregistrés ne sont pas encore lus : ni filtres ni état vide, le squelette de la liste. */
  preferencesEnLecture?: boolean
  /** Relance la lecture des avis (état d'erreur). */
  onReessayer?: () => void
  /** Il reste quelque chose à élargir (des filtres à retirer ou des départements voisins). */
  peutElargir: boolean
  onElargir: () => void
  onCreerAO: (idAvis: string) => void
  creationEnCours?: string | null
  /** Avis dont la dernière création n'a pas abouti. */
  creationEnErreurPour?: string | null
  source?: string | null
}

/** Plus proche ancêtre qui défile (overflow-y auto ou scroll) ; null = la fenêtre. Dans l'appli, c'est <main>. */
export function ancetreDefilant(el: Element | null, overflowDe: (e: Element) => string = (e) => getComputedStyle(e).overflowY): Element | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    if (/auto|scroll/.test(overflowDe(n))) return n
  }
  return null
}

export interface EtatSuite {
  aPlus: boolean
  chargePlus: boolean
}

/** Garde contre le double chargement : l'observateur peut se déclencher plusieurs fois avant que « chargement en cours »
 * ne soit rendu ; un verrou local ferme la porte dès le premier appel, `relacher` la rouvre à l'arrivée de la page. */
export function creerDeclencheurSuite(lire: () => EtatSuite, charger: () => void) {
  let verrou = false
  return {
    demander() {
      const e = lire()
      if (verrou || !e.aPlus || e.chargePlus) return
      verrou = true
      charger()
    },
    relacher() { verrou = false },
  }
}

/** Observe `cible` dans `racine` et appelle `surVisible` à chaque entrée dans la zone visible. Renvoie le nettoyage,
 * ou null sans IntersectionObserver (rendu serveur, vieux navigateur) : le bouton reste alors le repli. */
export function observerSuite(cible: Element, racine: Element | null, surVisible: () => void, Observateur: typeof IntersectionObserver | null | undefined): (() => void) | null {
  if (typeof Observateur !== 'function') return null
  const obs = new Observateur((entrees) => { if (entrees.some((e) => e.isIntersecting)) surVisible() }, { root: racine, rootMargin: '0px 0px 200px 0px' })
  obs.observe(cible)
  return () => obs.disconnect()
}

/** « Afficher plus » : un vrai bouton (clavier, repli), observé par un IntersectionObserver dont la racine est le conteneur qui défile. */
function BoutonSuite({ chargePlus, nbAvis, onSuite }: { chargePlus: boolean; nbAvis: number; onSuite: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const etat = useRef<EtatSuite>({ aPlus: true, chargePlus })
  etat.current = { aPlus: true, chargePlus }
  const rappel = useRef(onSuite)
  rappel.current = onSuite
  const declencheur = useRef<ReturnType<typeof creerDeclencheurSuite> | null>(null)
  if (!declencheur.current) declencheur.current = creerDeclencheurSuite(() => etat.current, () => rappel.current())
  const garde = declencheur.current
  // fin d'un chargement (réussi ou non) : le verrou s'ouvre
  useEffect(() => { if (!chargePlus) garde.relacher() }, [chargePlus, garde])
  // nouvelle page : on ré-observe, l'état courant est réévalué (le bouton est-il encore dans la zone visible ?)
  useEffect(() => {
    const b = ref.current
    if (!b) return undefined
    const fin = observerSuite(b, ancetreDefilant(b), () => garde.demander(), typeof IntersectionObserver === 'undefined' ? null : IntersectionObserver)
    return fin ?? undefined
  }, [nbAvis, garde])
  return (
    <Bouton ref={ref} data-suite onClick={() => garde.demander()} disabled={chargePlus}>{chargePlus ? 'Chargement…' : 'Afficher plus'}</Bouton>
  )
}

/**
 * Sous lg (téléphone, tablette), les filtres sont repliés sous « Affiner » : la liste des avis vient d'abord, pas un mur de
 * puces (refonte groupe A). À partir de lg ils restent ouverts (et collés en haut de la zone qui défile).
 */
function FiltresRepliables({ filtre, children }: { filtre: boolean; children: ReactNode }) {
  const [affiner, setAffiner] = useState(false)
  const id = useId()
  return (
    <>
      <Bouton onClick={() => setAffiner((v) => !v)} aria-expanded={affiner} aria-controls={id} className="lg:hidden">
        <SlidersHorizontal strokeWidth={1.75} aria-hidden />Affiner{filtre ? ' · filtres appliqués' : ''}
        <ChevronDown strokeWidth={1.75} aria-hidden className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', affiner && 'rotate-180')} />
      </Bouton>
      <div id={id} className={cn(!affiner && 'max-lg:hidden', 'max-lg:mt-3')}>{children}</div>
    </>
  )
}

export default function ListeAvis(p: PropsListeAvis) {
  const libellesMetiers = Object.fromEntries(p.metiers.map((m) => [m.code, m.libelle]))
  const filtre = aDesFiltres(p.filtres)
  const aDesAvis = p.avis.length > 0
  return (
    <section aria-labelledby="titre-avis" className="min-w-0">
      <h3 id="titre-avis" className="text-lg font-semibold text-fg">Avis ouverts</h3>
      <p className="mt-1 text-sm text-fg-2" role="status" aria-live="polite">
        {p.zoneVide
          ? 'Choisissez une zone pour voir les avis.'
          : p.enCours ? 'Chargement des avis…'
            : p.total > 0 ? `${p.total} avis ouvert${p.total > 1 ? 's' : ''} dans cette zone` : ''}
      </p>

      {/* À partir de lg, les filtres restent collés en haut de la zone qui défile (<main>) : fond opaque, la liste passe dessous.
          -top-5 annule le py-5 de <main> (le décalage du sticky part du bord intérieur) : collés sous l'en-tête, sans interstice
          où une carte apparaîtrait. Au téléphone ils défilent avec la liste. Aucun défilement interne ici : une seule barre.
          Le bloc ne peut pas sortir de son parent (flow-root) : la marge basse négative de la liste (-mb-64) raccourcit ce parent de
          16 rem, les filtres sont donc relâchés avant la fin de la liste et la dernière carte reste entièrement visible en bas de
          page ; le pt-64 du bloc suivant rend exactement l'espace retiré. */}
      <div className="lg:flow-root">
        {/* C10 — sans zone choisie, il n'y a aucun avis à filtrer : les filtres apparaissent une fois la zone choisie. */}
        {!p.zoneVide && !p.preferencesEnLecture && (
          <div data-filtres-colles className="mt-4 pb-3 lg:sticky lg:-top-5 lg:z-10 lg:rounded-carte lg:border lg:border-bord lg:bg-surface-0 lg:px-4 lg:pt-3">
            <FiltresRepliables filtre={filtre}>
              <FiltresVeille filtres={p.filtres} onFiltres={p.onFiltres} tri={p.tri} onTri={p.onTri} metiers={p.metiers} />
            </FiltresRepliables>
          </div>
        )}

        <div className={cn('mt-2', aDesAvis && 'lg:-mb-64')}>
          {p.zoneVide ? (
            <EtatVide className="mt-2" titre="Choisissez une zone sur la carte"
              phrase="Touchez un département, ou saisissez un département, une ville ou un code postal : les avis ouverts de la zone s’affichent ici." />
          ) : p.enErreur ? (
            <EtatErreur titre="Les avis ne se chargent pas pour le moment" detail="Votre zone et vos filtres sont conservés." onReessayer={p.onReessayer} />
          ) : p.enCours && p.avis.length === 0 ? (
            <ul aria-label="Chargement des avis" aria-busy="true" className="grid gap-3">
              {[0, 1, 2].map((i) => <li key={i}><Squelette className="h-36 rounded-lg" /></li>)}
            </ul>
          ) : p.avis.length === 0 ? (
            <EtatVide titre="Aucun avis ouvert dans cette zone pour ces filtres"
              phrase={p.peutElargir ? (filtre ? 'Élargir retire les filtres.' : 'Élargir ajoute les départements voisins.') : undefined}
              action={p.peutElargir ? <Bouton onClick={p.onElargir}>Élargir</Bouton> : undefined} />
          ) : (
            <ol className="grid gap-3">
              {p.avis.map((a) => (
                <li key={a.id}>
                  <CarteAvis
                    avis={a}
                    libellesMetiers={libellesMetiers}
                    nomsDepartements={p.nomsDepartements}
                    zone={p.zone}
                    onCreerAO={p.onCreerAO}
                    enCreation={p.creationEnCours === a.id}
                    creationEnErreur={p.creationEnErreurPour === a.id}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className={cn(aDesAvis && 'lg:pt-64')}>
        {p.aPlus && (
          <div className="mt-4 flex justify-center">
            <BoutonSuite chargePlus={!!p.chargePlus} nbAvis={p.avis.length} onSuite={p.onVoirPlus} />
          </div>
        )}
        <p className="mt-6 text-sm text-fg-3">Source : {libelleSourceVeille(p.source)}</p>
      </div>
    </section>
  )
}
