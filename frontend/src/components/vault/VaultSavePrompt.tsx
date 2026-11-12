import { useState } from 'react'
import { Archive } from 'lucide-react'
import { api } from '@/services/api'
import { DOC_TYPE_LABELS } from '@/lib/vault'
import { Button } from '@/components/ui/button'
import { resumeErreur } from '@/lib/erreurs'

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
      console.error('[VaultSavePrompt] enregistrement impossible:', resumeErreur(err))
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
      console.error('[VaultSavePrompt] dismiss non enregistré:', resumeErreur(err))
    }
  }

  const typeLabel = DOC_TYPE_LABELS[suggestion.type] ?? suggestion.type

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-bord-2 bg-surface-1 px-4 py-2.5">
      <Archive size={16} className="shrink-0 text-accent-text" aria-hidden />
      <p className="min-w-0 flex-1 text-xs text-fg-2">
        {saved ? (
          <>«&nbsp;{suggestion.fileName}&nbsp;» enregistré dans votre coffre-fort ({typeLabel}).</>
        ) : (
          <>
            «&nbsp;{suggestion.fileName}&nbsp;» ressemble à un document de votre entreprise ({typeLabel}).
            L’enregistrer dans votre coffre-fort pour vos prochains appels d’offres ?
          </>
        )}
      </p>
      {!saved && (
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={save} disabled={busy} className="h-8 text-xs">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss} className="h-8 text-xs">
            Non merci
          </Button>
        </div>
      )}
    </div>
  )
}
