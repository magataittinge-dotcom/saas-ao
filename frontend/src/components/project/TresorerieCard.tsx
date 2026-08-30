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
    <div className="rounded-lg" style={{ background: '#18181A', border: '1px solid rgba(255,255,255,.07)' }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <Banknote size={16} style={{ color: '#E8E9EB' }} />
        <h3 className="text-sm font-bold" style={{ color: '#F7F8F8' }}>Trésorerie du marché</h3>
        <span className="text-[11px]" style={{ color: '#6B6C6F' }}>ce que dit le contrat</span>
      </div>
      <div>
        {data.lignes.map((ligne, i) => (
          <button
            key={ligne.id}
            onClick={() => ligne.source && onOpenSource(ligne.source)}
            disabled={!ligne.source}
            className="w-full text-left px-5 py-3 flex items-start gap-4 transition-colors enabled:hover:bg-[#1E1E21] disabled:cursor-default"
            style={i < data.lignes.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,.07)' } : undefined}
          >
            <div className="w-40 shrink-0">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#959597' }}>
                {ligne.label}
              </p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: '#F7F8F8' }}>{ligne.valeur}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: '#959597' }}>{ligne.explication}</p>
              {ligne.formule && (
                <p className="text-[11px] font-mono mt-1 truncate" style={{ color: '#6B6C6F' }}>
                  {ligne.formule}
                </p>
              )}
            </div>
            {ligne.source && (
              <ExternalLink size={12} className="shrink-0 mt-1" style={{ color: '#6B6C6F' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
