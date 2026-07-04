import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Sparkles, X } from 'lucide-react'
import { api } from '@/services/api'

export interface PassageSelection {
  text: string
  start: number
  end: number
}

interface Props {
  projectId: string
  selection: PassageSelection | null
  onApply: (start: number, end: number, rewritten: string) => void
}

const ACTIONS: { id: string; label: string }[] = [
  { id: 'reformuler', label: 'Reformuler' },
  { id: 'plus_technique', label: 'Plus technique' },
  { id: 'plus_concis', label: 'Plus concis' },
]

/**
 * C9b — réécriture IA ciblée : agit sur le passage sélectionné SEUL,
 * montre le diff avant/après, n'applique qu'à l'acceptation explicite.
 */
export default function RewritePassageBar({ projectId, selection, onApply }: Props) {
  const [busy, setBusy] = useState(false)
  const [insistText, setInsistText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [diff, setDiff] = useState<{
    original: string; rewritten: string; start: number; end: number
  } | null>(null)

  const run = async (action: string) => {
    if (!selection || busy) return
    setBusy(true)
    setError(null)
    const { text, start, end } = selection
    try {
      const { data } = await api.post(`/projects/${projectId}/memoire/rewrite-passage`, {
        passage: text,
        action,
        ...(action === 'insister' ? { instruction: insistText } : {}),
      }, { timeout: 120_000 })
      setDiff({ original: data.original, rewritten: data.rewritten, start, end })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'La réécriture a échoué — réessayez.')
    } finally {
      setBusy(false)
    }
  }

  const hasSelection = !!selection && selection.text.trim().length > 0

  return (
    <>
      <div
        className="flex items-center gap-2 px-6 py-2 flex-wrap"
        style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}
      >
        <Sparkles size={13} style={{ color: hasSelection ? '#0EA5E9' : '#CBD5E1' }} />
        <span className="text-xs" style={{ color: hasSelection ? '#475569' : '#94A3B8' }}>
          {hasSelection
            ? `Réécrire la sélection (${selection!.text.length} car.) :`
            : 'Sélectionnez un passage pour le réécrire avec l\'IA'}
        </span>
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            disabled={!hasSelection || busy}
            onClick={() => run(a.id)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
            style={{ border: '1px solid #E2E8F0', color: '#334155', background: '#FFFFFF' }}
          >
            {a.label}
          </button>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            value={insistText}
            onChange={(e) => setInsistText(e.target.value)}
            placeholder="Insister sur…"
            disabled={!hasSelection || busy}
            className="px-2 py-1 rounded-md text-xs w-40 disabled:opacity-40 focus:outline-none"
            style={{ border: '1px solid #E2E8F0', color: '#334155' }}
          />
          <button
            disabled={!hasSelection || busy || !insistText.trim()}
            onClick={() => run('insister')}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
            style={{ border: '1px solid #E2E8F0', color: '#334155', background: '#FFFFFF' }}
          >
            OK
          </button>
        </span>
        {busy && <Loader2 size={13} className="animate-spin" style={{ color: '#0EA5E9' }} />}
        {error && <span className="text-xs" style={{ color: '#DC2626' }}>{error}</span>}
      </div>

      {/* ── Diff avant/après → accepter ou rejeter ── */}
      {diff && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setDiff(null)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
              <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>Réécriture proposée</h3>
              <button onClick={() => setDiff(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={16} style={{ color: '#64748B' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto grid sm:grid-cols-2 gap-0">
              <div className="p-4" style={{ borderRight: '1px solid #F1F5F9' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Avant</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: '#64748B' }}>{diff.original}</p>
              </div>
              <div className="p-4" style={{ background: 'rgba(14,165,233,0.03)' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: '#0284C7' }}>Après</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: '#0F172A' }}>{diff.rewritten}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => setDiff(null)}
                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50"
                style={{ color: '#475569' }}>
                Rejeter
              </button>
              <button
                onClick={() => { onApply(diff.start, diff.end, diff.rewritten); setDiff(null) }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#0EA5E9' }}>
                Accepter la réécriture
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
