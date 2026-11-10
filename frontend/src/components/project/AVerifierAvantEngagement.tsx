import { ArrowDown } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { EtatElement, SectionEtape } from '@/components/etape'
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
  return (
    <SectionEtape titre="À vérifier avant de vous engager" colonnes={2}>
      {points.map((p) => (
        <div key={p.id} data-a-verifier={p.id} className="grid min-w-0 content-start gap-1.5 rounded-carte border border-bord-2 bg-surface-1 p-5">
          <p className="text-sm font-medium text-fg-2">{p.libelle}</p>
          <p className="break-words font-semibold text-fg">{p.valeur}</p>
          {p.versTresorerie && onVoirPenalites && (
            <Bouton variante="lien" className="w-fit" onClick={onVoirPenalites}>Voir les pénalités <ArrowDown size={14} aria-hidden /></Bouton>
          )}
          <EtatElement
            etat="a-verifier"
            className="mt-1 border-t border-bord-2 pt-2"
            source={p.source ? { libelle: libelleSource(p.source) ?? p.source.document, onVoir: onVoir ? () => onVoir(p.source as SourceFait) : undefined } : undefined}
          />
        </div>
      ))}
    </SectionEtape>
  )
}
