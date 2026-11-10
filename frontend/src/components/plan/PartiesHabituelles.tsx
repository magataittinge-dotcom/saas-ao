import { SectionEtape } from '@/components/etape'
import { Carte } from '@/components/ui/carte'
import type { PartiePlan } from '@/lib/planMemoire'
import PartieHabituelle from './PartieHabituelle'

/**
 * La section « Parties habituelles, à ajouter si utile » : les parties du modèle que le plan ne retient pas par défaut,
 * en rangées à filet dans une seule carte (deux colonnes sur ordinateur). Rien ne s'affiche quand il n'y en a pas.
 */
export default function PartiesHabituelles({ parties, onAjouter }: { parties: readonly PartiePlan[]; onAjouter: (cle: string) => void }) {
  if (parties.length === 0) return null
  return (
    <SectionEtape
      titre="Parties habituelles, à ajouter si utile"
      description="Ces parties ne servent aucun sous-critère du règlement et le dossier ne les demande pas : elles restent hors du plan. Ajoutez celles qui servent votre dossier."
    >
      <Carte sansMarge>
        <ul className="grid min-w-0 md:grid-cols-2 md:gap-x-6" aria-label="Parties habituelles, à ajouter si utile">
          {parties.map((p) => <PartieHabituelle key={p.cle} partie={p} onAjouter={() => onAjouter(p.cle)} />)}
        </ul>
      </Carte>
    </SectionEtape>
  )
}
