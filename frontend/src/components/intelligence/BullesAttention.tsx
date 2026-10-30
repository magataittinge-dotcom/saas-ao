import type { Bulle } from '@/lib/intelligence/bulles'

/** Position de chaque bulle autour du visage (grand écran) : côté, décalage horizontal, hauteur, taille du nœud. */
const PLACES: ReadonlyArray<{ cote: 'g' | 'd'; x: string; y: string; t: string }> = [
  { cote: 'g', x: '4%', y: '15%', t: '24px' },
  { cote: 'd', x: '4%', y: '11%', t: '34px' },
  { cote: 'g', x: '1.5%', y: '46%', t: '18px' },
  { cote: 'd', x: '1.5%', y: '44%', t: '22px' },
  { cote: 'g', x: '5%', y: '77%', t: '22px' },
  { cote: 'd', x: '6%', y: '78%', t: '16px' },
]

interface Props {
  bulles: readonly Bulle[]
  /** Bulle choisie ou null. */
  choix: string | null
  onChoisir: (id: string | null) => void
}

/** Les six bulles : des boutons à bascule (aria-pressed). Choisir la même bulle de nouveau revient à la prochaine action. */
export default function BullesAttention({ bulles, choix, onChoisir }: Props) {
  return (
    <div className="syx-bulles" role="group" aria-label="Ce qui demande votre attention">
      {bulles.map((b, i) => {
        const place = PLACES[i % PLACES.length]
        return (
          <button
            key={b.id}
            type="button"
            className="syx-bulle"
            data-bulle={b.id}
            data-cote={place.cote}
            data-ton={b.ton}
            data-vide={b.vide ? 'oui' : 'non'}
            aria-pressed={choix === b.id}
            aria-label={b.aria}
            onClick={() => onChoisir(choix === b.id ? null : b.id)}
            style={{ ['--x' as string]: place.x, ['--y' as string]: place.y }}
          >
            <span className="syx-pastille">
              <span className="syx-point" aria-hidden="true" />
              <span aria-hidden="true">{b.libelle}</span>
              <span className="syx-compte" aria-hidden="true">{b.compte}</span>
            </span>
            <span className="syx-noeud" aria-hidden="true" style={{ ['--t' as string]: place.t }} />
          </button>
        )
      })}
    </div>
  )
}
