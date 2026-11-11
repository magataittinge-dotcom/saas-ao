import { ArrowDown } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { SectionEtape } from '@/components/etape'
import { libelleSource, type PointAVerifier } from '@/lib/resumeAO'
import type { SourceFait } from '@/lib/carteAO'

/**
 * « À vérifier avant de vous engager » : ce que le dossier impose et qui engage l'entreprise (délai, visite, variantes,
 * garanties, pénalités…), regroupé, chacun avec sa source. Les pénalités tiennent en une ligne et un lien : leur détail vit
 * dans le bloc « Trésorerie du marché » (V3). Aucun avis, aucun chiffre de prix.
 */
export default function AVerifierAvantEngagement({ points, onVoir, onVoirPenalites }: {
  points: readonly PointAVerifier[]
  onVoir?: (s: SourceFait) => void
  onVoirPenalites?: () => void
}) {
  if (points.length === 0) return null
  // UNE liste (jury, tour 1 : sept cartes sur deux colonnes, sept pastilles ambre « À vérifier », une carte orpheline) : le titre
  // de la section dit déjà que tout ici est à vérifier ; chaque ligne donne le point, ce que dit le dossier, et sa source.
  return (
    <SectionEtape titre="À vérifier avant de vous engager">
      <div data-liste-a-verifier="" className="divide-y divide-bord rounded-carte border border-bord bg-surface-0">
        {points.map((p) => {
          const source = p.source
          const libelle = source ? libelleSource(source) ?? source.document : null
          return (
            <div key={p.id} data-a-verifier={p.id} className="grid gap-x-6 gap-y-0.5 px-5 py-3 max-sm:px-4 md:grid-cols-[13rem_minmax(0,1fr)_minmax(0,18rem)] md:items-baseline">
              <p className="text-sm font-medium text-fg-2">{p.libelle}</p>
              <p className="min-w-0 break-words font-semibold text-fg">
                {p.valeur}
                {p.versTresorerie && onVoirPenalites && (
                  <Bouton variante="lien" className="ml-3" onClick={onVoirPenalites}>Voir les pénalités <ArrowDown size={14} aria-hidden /></Bouton>
                )}
              </p>
              {libelle && (
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-fg-2 md:justify-end">
                  <span className="min-w-0 break-words">Source : {libelle}</span>
                  {onVoir && source && <Bouton variante="lien" onClick={() => onVoir(source)}>Voir dans le dossier</Bouton>}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </SectionEtape>
  )
}
