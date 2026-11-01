import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Upload, Sparkles, X } from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { MemoireConfig } from '@/types'

// Import d'un mémoire existant (.docx ou .pdf) : l'IA pré-remplit le profil, l'utilisateur vérifie avant d'enregistrer.
// Déplacé depuis l'ancienne page « Configuration du mémoire » (supprimée le 1er/11) sans changement de comportement.

// ─── Import progress overlay ───────────────────────────────────────────────────

function ImportProgress({ isImporting }: { isImporting: boolean }) {
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isImporting) return
    setProgress(0)
    let current = 0
    const STAGES = [
      { upTo: 15, ms: 150 },
      { upTo: 40, ms: 400 },
      { upTo: 80, ms: 600 },
      { upTo: 99, ms: 1200 },
    ]
    const tick = () => {
      current += 1
      setProgress(current)
      if (current < 99) {
        const stage = STAGES.find((s) => current < s.upTo) ?? STAGES[STAGES.length - 1]
        timerRef.current = setTimeout(tick, stage.ms)
      }
    }
    timerRef.current = setTimeout(tick, 150)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [isImporting])

  if (!isImporting) return null

  const RADIUS = 70
  const CIRC = 2 * Math.PI * RADIUS
  const offset = CIRC * (1 - progress / 100)

  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-voile backdrop-blur-sm">
      <div className="flex min-w-64 flex-col items-center gap-5 rounded-2xl border border-bord-2 bg-surface-pop p-10 shadow-pop">
        <div className="relative h-40 w-40">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160" aria-hidden>
            <circle cx="80" cy="80" r={RADIUS} fill="none" className="stroke-surface-2" strokeWidth="10" />
            <circle
              cx="80" cy="80" r={RADIUS} fill="none"
              className="stroke-accent-ui" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.35s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-3xl font-bold text-fg">{progress}%</span>
          </div>
        </div>
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold text-fg">
            {progress < 20 ? 'Lecture du document...' :
             progress < 60 ? 'Analyse par Synorix IA...' :
             progress < 90 ? 'Extraction des informations...' :
             'Finalisation...'}
          </p>
          <p className="text-sm text-fg-2">L'IA extrait vos données (~15s)</p>
        </div>
      </div>
    </div>
  )
}

// ─── Import dialog ─────────────────────────────────────────────────────────────

export interface ImportDialogProps {
  onClose: () => void
  onImported: (extracted: Partial<MemoireConfig>, count: number) => void
}

export function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { mutate: doImport, isPending } = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      const { data } = await api.post<{ extracted: Record<string, unknown>; fields_count: number }>(
        '/memoire-config/import',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data
    },
    onSuccess: ({ extracted, fields_count }) => {
      onImported(extracted as Partial<MemoireConfig>, fields_count)
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? "Erreur lors de l'import")
        : "Erreur lors de l'import"
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(docx|pdf)$/i)) {
      setError('Seuls les fichiers .docx et .pdf sont acceptés')
      return
    }
    setFile(f)
    setError(null)
  }

  return (
    <>
      <ImportProgress isImporting={isPending} />
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-voile backdrop-blur-sm"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-titre"
          className="mx-4 w-full max-w-md rounded-2xl border border-bord-2 bg-surface-pop shadow-pop"
        >
          {/* En-tête */}
          <div className="flex items-center justify-between border-b border-bord px-6 py-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-accent-text" aria-hidden />
              <h2 id="import-titre" className="font-semibold text-fg">Importer un mémoire existant</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="grid size-9 place-items-center rounded-md text-fg-2 transition-colors duration-base ease-lien hover:bg-surface-1 hover:text-fg [@media(pointer:coarse)]:size-11"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          {/* Corps */}
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-fg-2">
              Déposez un mémoire technique existant (.docx ou .pdf).
              Synorix IA extraira automatiquement toutes les informations et pré-remplira le formulaire.
            </p>

            {/* Zone de dépôt */}
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              className={cn(
                'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors duration-base ease-lien',
                dragOver || file ? 'border-accent-ring bg-accent-tint' : 'border-input bg-surface-1 hover:border-fg-3',
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 size={28} className="text-success" aria-hidden />
                  <p className="text-sm font-medium text-fg">{file.name}</p>
                  <p className="text-xs text-fg-3">{(file.size / 1024).toFixed(0)} Ko</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={28} className="text-fg-3" aria-hidden />
                  <p className="text-sm font-medium text-fg-2">Glissez votre fichier ici</p>
                  <p className="text-xs text-fg-3">ou cliquez pour parcourir • .docx, .pdf</p>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          {/* Pied */}
          <div className="flex items-center justify-end gap-3 border-t border-bord px-6 py-4">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={() => file && doImport(file)} disabled={!file || isPending}>
              <Sparkles size={15} aria-hidden />
              {isPending ? "Extraction en cours..." : "Importer et pré-remplir"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

