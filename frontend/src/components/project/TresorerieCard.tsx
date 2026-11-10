import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { Sigle } from '@/components/common/Sigle'
import { Bouton } from '@/components/ui/bouton'
import { Carte, TitreCarte } from '@/components/ui/carte'
import { api } from '@/services/api'
import type { FieldSource } from './CriticalBanner'

/** Ancre du bloc : les pénalités de retard ne sont détaillées qu'ici, les autres blocs y renvoient (V3). */
export const ID_TRESORERIE = 'tresorerie-du-marche'

/** Amène le bloc « Trésorerie du marché » à l'écran (sans animation si le mouvement est réduit). */
export function voirTresorerie(): void {
  const bloc = document.getElementById(ID_TRESORERIE)
  if (!bloc) return
  const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  bloc.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' })
}

interface TresorerieLigne {
  id: string
  label: string
  valeur: string
  explication: string
  formule?: string | null
  source: FieldSource | null
}

interface Props {
  projectId: string
  onOpenSource: (source: FieldSource) => void
}

/**
 * C19 — « Trésorerie du marché » : traduction en clair des clauses CCAP
 * (avance, délai de paiement, retenue de garantie, pénalités, révision).
 * Lecture factuelle du contrat — aucun commentaire de prix, jamais.
 * Chaque ligne est cliquable vers sa source dans le document.
 */
export default function TresorerieCard({ projectId, onOpenSource }: Props) {
  const { data } = useQuery<{ lot: string | null; lignes: TresorerieLigne[] }>({
    queryKey: ['tresorerie', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/tresorerie`)
      return data
    },
    staleTime: 60_000,
  })

  if (!data || data.lignes.length === 0) return null

  return (
    <Carte sansMarge id={ID_TRESORERIE} className="min-w-0 scroll-mt-20">
      <header className="grid gap-1 border-b border-bord px-5 py-4 sm:px-6">
        <TitreCarte>Trésorerie du marché</TitreCarte>
        <p className="text-sm text-fg-2">Ce que dit le <Sigle code="CCAP" />, clause par clause.</p>
      </header>
      <ul>
        {data.lignes.map((ligne) => {
          const contenu = (
            <>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-xs font-medium text-fg-3">{ligne.label}</span>
                <span className="break-words text-base font-semibold text-fg">{ligne.valeur}</span>
                <span className="break-words text-sm text-fg-2">{ligne.explication}</span>
                {ligne.formule && <span className="chiffres break-words text-xs text-fg-3">{ligne.formule}</span>}
              </span>
              {ligne.source && <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="mt-1 shrink-0 text-fg-3" />}
            </>
          )
          return (
            <li key={ligne.id} className="border-b border-bord">
              {ligne.source ? (
                // la rangée entière ouvre le passage du contrat
                <Bouton variante="discret" aria-label={`${ligne.label} : ${ligne.valeur}. Voir dans le dossier`}
                  className="h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none px-5 py-3 text-left font-normal sm:px-6"
                  onClick={() => { if (ligne.source) onOpenSource(ligne.source) }}>
                  {contenu}
                </Bouton>
              ) : (
                <div className="flex items-start gap-3 px-5 py-3 sm:px-6">{contenu}</div>
              )}
            </li>
          )
        })}
      </ul>
      {/* « Retenue de garantie » n'est plus dans la barre : le chiffre du contrat est ici, le calcul est un lien plus loin */}
      <div className="px-5 py-2 sm:px-6">
        <Bouton asChild variante="lien" className="min-h-11">
          <Link to="/outils">Calculer ma retenue de garantie <ArrowRight size={16} strokeWidth={1.5} aria-hidden /></Link>
        </Bouton>
      </div>
    </Carte>
  )
}
