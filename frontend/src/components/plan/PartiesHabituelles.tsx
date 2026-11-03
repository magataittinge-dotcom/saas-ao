import { SectionEtape } from '@/components/etape'
import type { PartiePlan } from '@/lib/planMemoire'
import PartieHabituelle from './PartieHabituelle'

/**
 * La section « Parties habituelles, à ajouter si utile » : les parties du modèle que le plan ne retient pas par défaut.
 * Rien ne s'affiche quand il n'y en a pas.
 */
export default function PartiesHabituelles({ parties, onAjouter }: { parties: readonly PartiePlan[]; onAjouter: (cle: string) => void }) {
  if (parties.length === 0) return null
  return (
    <SectionEtape
      titre="PARTIES HABITUELLES, À AJOUTER SI UTILE"
      description="Ces parties ne servent aucun sous-critère du règlement et le dossier ne les demande pas : elles restent hors du plan. Ajoutez celles qui servent votre dossier."
    >
      <ul className="grid min-w-0 gap-3 md:grid-cols-2" aria-label="Parties habituelles, à ajouter si utile">
        {parties.map((p) => <PartieHabituelle key={p.cle} partie={p} onAjouter={() => onAjouter(p.cle)} />)}
      </ul>
    </SectionEtape>
  )
}
