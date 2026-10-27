import Skeleton from '@/components/common/Skeleton'

/** Repli pendant qu'un écran (morceau de code) se charge : un titre et quelques lignes, sans texte
 *  ni animation de plus que les squelettes existants. `clair` : sur le fond papier du Calque. */
export default function EcranEnChargement({ clair = false }: { clair?: boolean }) {
  const fond = clair ? { background: 'var(--calque-surface-2)' } : undefined
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-6xl space-y-3 py-2">
      <span className="sr-only">Chargement de l&rsquo;écran</span>
      <Skeleton className="h-7 w-1/3 max-w-xs" style={fond} />
      <Skeleton className="h-4 w-2/3 max-w-md" style={fond} />
      <Skeleton className="mt-4 h-40 w-full rounded-xl" style={fond} />
    </div>
  )
}
