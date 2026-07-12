import { useState } from 'react'
import { Archive } from 'lucide-react'
import { api } from '@/services/api'
import { DOC_TYPE_LABELS } from '@/lib/vault'

export interface VaultSuggestion {
  docId: string
  fileName: string
  type: string
  category: string
}

interface Props {
  suggestion: VaultSuggestion
  onDone: (docId: string) => void
}

/**
 * C16 — coffre-fort progressif. Bandeau discret, non-bloquant, affiché quand
 * un document perso (URSSAF, KBIS…) est uploadé dans un projet.
 * 1 tap → enregistré + classé au coffre. Refus → plus jamais re-proposé
 * pour ce document (flag en base).
 */
export default function VaultSavePrompt({ suggestion, onDone }: Props) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await api.post('/documents/from-project-doc', { project_doc_id: suggestion.docId })
      setSaved(true)
      setTimeout(() => onDone(suggestion.docId), 1800)
    } catch (err) {
      console.error('[VaultSavePrompt] enregistrement impossible:', err)
      onDone(suggestion.docId)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    onDone(suggestion.docId)  // disparition immédiate, le flag part en fond
    try {
      await api.post('/documents/vault-prompt/dismiss', { project_doc_id: suggestion.docId })
    } catch (err) {
      console.error('[VaultSavePrompt] dismiss non enregistré:', err)
    }
  }

  const typeLabel = DOC_TYPE_LABELS[suggestion.type] ?? suggestion.type

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-2.5 mt-3"
      style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.15)' }}
    >
      <Archive size={16} className="shrink-0" style={{ color: '#22D3EE' }} />
      <p className="flex-1 text-xs" style={{ color: '#9AA3AE' }}>
        {saved ? (
          <>« {suggestion.fileName} » enregistré dans votre coffre-fort ({typeLabel}).</>
        ) : (
          <>
            « {suggestion.fileName} » ressemble à un document de votre entreprise ({typeLabel}).
            L&apos;enregistrer dans votre coffre-fort pour vos prochains appels d&apos;offres ?
          </>
        )}
      </p>
      {!saved && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={save}
            disabled={busy}
            className="edge-cta px-2.5 py-1 rounded-md text-xs font-semibold disabled:opacity-60"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={dismiss}
            className="px-2 py-1 rounded-md text-xs font-medium hover:bg-[#232730]"
            style={{ color: '#6B7280' }}
          >
            Non merci
          </button>
        </div>
      )}
    </div>
  )
}
