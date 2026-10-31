// La liste des avis de la zone choisie : filtres au-dessus, une carte par avis, « Voir plus » (curseur),
// états vides positifs, mention de la source.
//
//   <ListeAvis avis={…} total={…} zoneVide={…} … />
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import CarteAvis from './CarteAvis'
import FiltresVeille from './FiltresVeille'
import { SOURCE_VEILLE, type AvisVeille } from '@/services/veille'
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
  aPlus: boolean
  chargePlus?: boolean
  onVoirPlus: () => void
  /** Chargement de la première page. */
  enCours?: boolean
  enErreur?: boolean
  /** Il reste quelque chose à élargir (des filtres à retirer ou des départements voisins). */
  peutElargir: boolean
  onElargir: () => void
  onCreerAO: (idAvis: string) => void
  creationEnCours?: string | null
  /** Avis dont la dernière création n'a pas abouti. */
  creationEnErreurPour?: string | null
  source?: string | null
}

export default function ListeAvis(p: PropsListeAvis) {
  const libellesMetiers = Object.fromEntries(p.metiers.map((m) => [m.code, m.libelle]))
  const filtre = aDesFiltres(p.filtres)
  return (
    <section aria-labelledby="titre-avis" className="min-w-0">
      <h3 id="titre-avis" className="text-base font-semibold text-fg">Avis ouverts</h3>
      <p className="mt-1 text-sm text-fg-2" role="status" aria-live="polite">
        {p.zoneVide
          ? 'Choisissez une zone pour voir les avis.'
          : p.enCours ? 'Chargement des avis…'
            : p.total > 0 ? `${p.total} avis ouvert${p.total > 1 ? 's' : ''} dans cette zone` : ''}
      </p>

      <div className="mt-4">
        <FiltresVeille filtres={p.filtres} onFiltres={p.onFiltres} tri={p.tri} onTri={p.onTri} metiers={p.metiers} />
      </div>

      <div className="mt-5">
        {p.zoneVide ? (
          <div className="rounded-lg bg-surface-1 px-5 py-8">
            <p className="text-[15px] font-semibold text-fg">Choisissez une zone sur la carte</p>
            <p className="mt-1 max-w-[56ch] text-[15px] text-fg-2">
              Touchez un département, ou saisissez un département, une ville ou un code postal : les avis ouverts de la zone s'affichent ici.
            </p>
          </div>
        ) : p.enErreur ? (
          <div className="rounded-lg bg-surface-1 px-5 py-8" role="status">
            <p className="text-[15px] font-semibold text-fg">Les avis ne se chargent pas pour le moment</p>
            <p className="mt-1 text-[15px] text-fg-2">Réessayez dans un instant : votre zone et vos filtres sont conservés.</p>
          </div>
        ) : p.enCours && p.avis.length === 0 ? (
          <ul aria-label="Chargement des avis" className="space-y-3">
            {[0, 1, 2].map((i) => <li key={i} className="h-36 animate-pulse rounded-lg bg-surface-1" />)}
          </ul>
        ) : p.avis.length === 0 ? (
          <div className="rounded-lg bg-surface-1 px-5 py-8">
            <p className="text-[15px] font-semibold text-fg">Aucun avis ouvert dans cette zone pour ces filtres</p>
            {p.peutElargir && (
              <Fragment>
                <p className="mt-1 max-w-[56ch] text-[15px] text-fg-2">
                  {filtre ? 'Élargir retire les filtres.' : 'Élargir ajoute les départements voisins.'}
                </p>
                <Button variant="outline" onClick={p.onElargir} className="mt-4">Élargir</Button>
              </Fragment>
            )}
          </div>
        ) : (
          <ol className="space-y-3">
            {p.avis.map((a) => (
              <li key={a.id}>
                <CarteAvis
                  avis={a}
                  libellesMetiers={libellesMetiers}
                  nomsDepartements={p.nomsDepartements}
                  onCreerAO={p.onCreerAO}
                  enCreation={p.creationEnCours === a.id}
                  creationEnErreur={p.creationEnErreurPour === a.id}
                />
              </li>
            ))}
          </ol>
        )}
        {p.aPlus && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={p.onVoirPlus} disabled={p.chargePlus}>{p.chargePlus ? 'Chargement…' : 'Voir plus'}</Button>
          </div>
        )}
      </div>

      <p className="mt-6 text-[13px] text-fg-3">Source : {p.source ?? SOURCE_VEILLE}</p>
    </section>
  )
}
