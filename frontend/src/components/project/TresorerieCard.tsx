import { useQuery } from '@tanstack/react-query'
import { Banknote, ExternalLink } from 'lucide-react'
import { api } from '@/services/api'
import type { FieldSource } from './CriticalBanner'

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
    <div className="rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <Banknote size={16} style={{ color: '#0EA5E9' }} />
        <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Trésorerie du marché</h3>
        <span className="text-[11px]" style={{ color: '#94A3B8' }}>ce que dit le contrat</span>
      </div>
      <div>
        {data.lignes.map((ligne, i) => (
          <button
            key={ligne.id}
            onClick={() => ligne.source && onOpenSource(ligne.source)}
            disabled={!ligne.source}
            className="w-full text-left px-5 py-3 flex items-start gap-4 transition-colors enabled:hover:bg-[#F8FAFC] disabled:cursor-default"
            style={i < data.lignes.length - 1 ? { borderBottom: '1px solid #F1F5F9' } : undefined}
          >
            <div className="w-40 shrink-0">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>
                {ligne.label}
              </p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: '#0F172A' }}>{ligne.valeur}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: '#64748B' }}>{ligne.explication}</p>
              {ligne.formule && (
                <p className="text-[11px] font-mono mt-1 truncate" style={{ color: '#94A3B8' }}>
                  {ligne.formule}
                </p>
              )}
            </div>
            {ligne.source && (
              <ExternalLink size={12} className="shrink-0 mt-1" style={{ color: '#94A3B8' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
