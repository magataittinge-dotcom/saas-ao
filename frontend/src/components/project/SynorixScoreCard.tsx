import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ExternalLink, Gauge, Minus, TriangleAlert, X } from 'lucide-react'
import { api } from '@/services/api'
import type { FieldSource } from './CriticalBanner'

interface Composante {
  id: string
  label: string
  statut: 'ok' | 'warning' | 'ko' | 'non_evaluable'
  explication: string
  source: FieldSource | null
  action: 'completer_profil' | null
}

interface ScorePayload {
  score: number | null
  verdict: 'go' | 'vigilance' | 'no_go' | null
  composantes: Composante[]
}

const VERDICT_STYLE = {
  go:        { label: 'Go',        bg: 'rgba(110,231,168,0.10)', color: '#6EE7A8', border: 'rgba(110,231,168,0.25)' },
  vigilance: { label: 'Vigilance', bg: 'rgba(245,158,11,0.10)', color: '#F5C26B', border: 'rgba(245,158,11,0.25)' },
  no_go:     { label: 'No-Go',     bg: 'rgba(245,142,134,0.10)',  color: '#F58E86', border: 'rgba(245,142,134,0.25)' },
}

function StatutIcon({ statut }: { statut: Composante['statut'] }) {
  if (statut === 'ok') return <Check size={14} style={{ color: '#6EE7A8' }} />
  if (statut === 'warning') return <TriangleAlert size={14} style={{ color: '#F5C26B' }} />
  if (statut === 'ko') return <X size={14} style={{ color: '#F58E86' }} />
  return <Minus size={14} style={{ color: '#788295' }} />
}

interface Props {
  projectId: string
  onOpenSource: (source: FieldSource) => void
}

/**
 * C18 — Synorix Score go/no-go. 100 % déterministe (croisement factuel
 * DCE × profil) : ni LLM ni commentaire de prix. Les composantes non
 * évaluables (profil incomplet) sont neutres et proposent de compléter
 * le profil.
 */
export default function SynorixScoreCard({ projectId, onOpenSource }: Props) {
  const [open, setOpen] = useState(false)
  const { data } = useQuery<ScorePayload>({
    queryKey: ['synorix-score', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/synorix-score`)
      return data
    },
    staleTime: 60_000,
  })

  if (!data || data.verdict === null) return null
  const v = VERDICT_STYLE[data.verdict]

  return (
    <div className="rounded-lg" style={{ background: '#151A23', border: '1px solid rgba(186,205,234,.13)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
      >
        <Gauge size={18} style={{ color: '#E4E9F2' }} />
        <span className="text-sm font-bold" style={{ color: '#F4F6FA' }}>Synorix Score</span>
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-bold"
          style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}
        >
          {v.label}
        </span>
        {data.score !== null && (
          <span className="text-sm font-semibold tabular-nums" style={{ color: v.color }}>
            {data.score}/100
          </span>
        )}
        <span className="flex-1" />
        <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
          style={{ color: '#788295' }} />
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(186,205,234,.13)' }}>
          {data.composantes.map((comp, i) => (
            <div key={comp.id} className="px-5 py-2.5 flex items-start gap-3"
              style={i < data.composantes.length - 1 ? { borderBottom: '1px solid rgba(186,205,234,.13)' } : undefined}>
              <span className="mt-0.5 shrink-0"><StatutIcon statut={comp.statut} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: '#E8EBF2' }}>{comp.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#9BA4B5' }}>
                  {comp.explication}
                  {comp.action === 'completer_profil' && (
                    <>
                      {' '}
                      <Link to="/company" className="font-medium underline" style={{ color: '#E4E9F2' }}>
                        Compléter mon profil
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {comp.source && (
                <button onClick={() => onOpenSource(comp.source!)} title={`Source — ${comp.source.document}`}
                  className="shrink-0 p-1 rounded" style={{ color: '#788295' }}>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
