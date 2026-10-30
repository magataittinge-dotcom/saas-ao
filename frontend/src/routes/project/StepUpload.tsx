import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, FileSpreadsheet, File, Trash2, AlertCircle,
  CloudUpload, CheckCircle2, ChevronRight, FileArchive, Clock,
} from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { uploadService } from '@/services/upload'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import type { Project, ProjectDocument, ProjectDocumentType } from '@/types'
import { cn } from '@/lib/utils'
import { AiTipsBlock, type TipData } from '@/components/common/AiTip'
import VaultSavePrompt, { type VaultSuggestion } from '@/components/vault/VaultSavePrompt'
import { takePendingUpload } from '@/lib/pendingUpload'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'

const UPLOAD_STEPS: StepDescriptor[] = [
  { key: 'uploading',       label: 'Transfert du dossier',   estimated_s: 30 },
  { key: 'extracting_zip',  label: 'Extraction du ZIP',      estimated_s: 5 },
  { key: 'extracting_text', label: 'Indexation des documents', estimated_s: 60 },
]

const F = "'Inter Variable', 'Geist Sans', sans-serif"

type Phase = 'idle' | 'uploading' | 'processing' | 'done'

function detectDocType(filename: string): ProjectDocumentType {
  const lower = filename.toLowerCase()
  if (/\brc\b/.test(lower) || /r[eè]glement/.test(lower)) return 'rc'
  if (/\bcctp\b/.test(lower)) return 'cctp'
  if (/\bdpgf\b|\bbpu\b/.test(lower)) return 'dpgf'
  if (/attri/.test(lower) || /acte.{0,6}engagement/i.test(lower)) return 'acte_engagement'
  if (/\bplan\b|\bplans?\b/.test(lower)) return 'plan'
  return 'autre'
}

const TYPE_BADGE: Record<ProjectDocumentType, { color: string; bg: string; border: string }> = {
  rc:              { color: 'var(--text-1)', bg: 'color-mix(in srgb, var(--text-1) 10%, transparent)', border: 'var(--border-2)' },
  cctp:           { color: 'var(--text-2)', bg: 'color-mix(in srgb, var(--text-1) 8%, transparent)', border: 'var(--border-2)' },
  ccap:           { color: 'var(--text-1)', bg: 'color-mix(in srgb, var(--text-1) 10%, transparent)', border: 'var(--border-2)' },
  dpgf:           { color: 'var(--text-3)', bg: 'color-mix(in srgb, var(--text-3) 8%, transparent)', border: 'color-mix(in srgb, var(--text-3) 20%, transparent)' },
  acte_engagement: { color: 'var(--text-2)', bg: 'color-mix(in srgb, var(--text-1) 10%, transparent)', border: 'var(--border-2)' },
  plan:           { color: 'var(--text-3)', bg: 'var(--surface-1)', border: 'var(--surface-1)' },
  autre:          { color: 'var(--text-3)', bg: 'transparent', border: 'transparent' },
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return <FileText size={18} className="shrink-0" style={{ color: 'var(--text-3)' }} />
  if (ext === 'docx' || ext === 'doc') return <FileText size={18} className="shrink-0" style={{ color: 'var(--text-1)' }} />
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') return <FileSpreadsheet size={18} className="shrink-0" style={{ color: 'var(--text-1)' }} />
  if (ext === 'zip') return <FileArchive size={18} className="shrink-0" style={{ color: 'var(--text-3)' }} />
  return <File size={18} className="shrink-0" style={{ color: 'var(--text-3)' }} />
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const DOC_TYPES: { value: ProjectDocumentType; label: string }[] = [
  { value: 'rc',              label: 'RC — Règlement de Consultation' },
  { value: 'cctp',            label: 'CCTP — Cahier des Clauses Techniques' },
  { value: 'ccap',            label: 'CCAP — Cahier des Clauses Administratives' },
  { value: 'dpgf',            label: 'DPGF — Décomposition Prix' },
  { value: 'acte_engagement', label: "Acte d'Engagement" },
  { value: 'plan',            label: 'Plans' },
  { value: 'autre',           label: 'Autre' },
]

interface Props { project: Project }

export default function StepUpload({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // ─── Simple progress state ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [displayPct, setDisplayPct] = useState(0)
  const [label, setLabel] = useState('')
  const [sublabel, setSublabel] = useState('')
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [vaultPrompts, setVaultPrompts] = useState<VaultSuggestion[]>([])
  // 1.13 — aucune perte en un clic : chaque suppression est confirmée, nommée
  const [aSupprimer, setASupprimer] = useState<{ tous: true } | { doc: ProjectDocument } | null>(null)
  const [largeFileNotice, setLargeFileNotice] = useState<{ message: string; tone: 'cyan' | 'orange' } | null>(null)
  const [nextError, setNextError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  // Interval refs for cleanup
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false)
  const lastProgressUpdateRef = useRef(0)

  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set())

  const { data: documents = [] } = useQuery({
    queryKey: ['project-documents', project.id],
    queryFn: async () => {
      const { data } = await api.get<ProjectDocument[]>(`/projects/${project.id}/documents`)
      return data
    },
  })

  const uploadTips = useMemo<TipData[]>(() => {
    const tips: TipData[] = []
    const totalSize = documents.reduce((s, d) => s + (d.file_size || 0), 0)
    if (totalSize > 500 * 1024 * 1024) {
      tips.push({ id: 'upload-large', variant: 'warning', text: 'Les fichiers volumineux peuvent prendre quelques minutes à traiter.' })
    }
    tips.push({ id: 'upload-zip', variant: 'info', text: 'Astuce : déposez le ZIP complet du DCE pour une détection automatique de tous les documents et lots.' })
    return tips
  }, [documents])

  const { mutateAsync: deleteDoc } = useMutation({
    mutationFn: (docId: string) => api.delete(`/projects/${project.id}/documents/${docId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] }),
  })

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animRef.current) clearInterval(animRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (safetyRef.current) clearTimeout(safetyRef.current)
    }
  }, [])

  const processingStartedRef = useRef(false)

  // ─── Backend extraction tracked via SSE on /progress-stream ──────────────
  // (replaces the legacy 2s polling on /processing-status). The SSE hook
  // handles reconnect + fallback automatically.
  // SSE ouvert dès l'ENVOI : le middleware serveur publie la progression de
  // réception réelle (0-30) pendant que FastAPI lit le multipart — c'était
  // la fenêtre muette responsable du gel à 30 %.
  const sse = useProgressStream(project.id, {
    enabled: phase === 'uploading' || phase === 'processing',
    onComplete: () => {
      doneRef.current = true
      setDisplayPct(100)
      setLabel('Traitement terminé !')
      setSublabel('')
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
      setLargeFileNotice(null)
      if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
      setTimeout(() => { setPhase('idle'); setDisplayPct(0) }, 1000)
    },
    onError: () => {
      doneRef.current = true
      setUploadErrors(prev => [...prev, 'Erreur lors du traitement des documents.'])
      setPhase('idle')
      if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
    },
  })

  // Map the SSE progress into the page's display state.
  // Le tracker serveur émet DÉJÀ l'échelle globale 0-100 (transfert 0-30,
  // extraction ZIP 30-40, indexation 40-100) : on l'affiche telle quelle —
  // l'ancien re-mapping 30+p×0,65 faisait sauter la barre de 30 à 49,5.
  useEffect(() => {
    if ((phase !== 'processing' && phase !== 'uploading') || doneRef.current) return
    // Pendant l'envoi, seuls les événements de réception (status uploading)
    // sont pris : un snapshot init d'un pipeline PRÉCÉDENT (progress 100)
    // ne doit pas faire sauter la barre.
    if (phase === 'uploading' && sse.step !== 'uploading') return
    // Cap 99 (pas 95) : les événements réels 96-99 de fin d'extraction
    // s'affichent — l'ancien cap créait un palier artificiel à 95.
    setDisplayPct(prev => Math.max(prev, Math.min(sse.progress, 99)))
    if (sse.detail) setSublabel(sse.detail)
    if (sse.step) setLabel(sse.step)
  }, [sse.progress, sse.detail, sse.step, phase])

  const startProcessing = useCallback(() => {
    if (processingStartedRef.current || doneRef.current) return
    processingStartedRef.current = true

    setPhase('processing')
    setDisplayPct(prev => Math.max(prev, 25))
    setLabel("Extraction de l'archive...")
    setSublabel('')

    // Hard timeout safety net (10 minutes) in case neither SSE nor fallback
    // ever delivers a complete event (network split-brain).
    safetyRef.current = setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      setDisplayPct(100)
      setLabel('Traitement terminé !')
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
      setTimeout(() => { setPhase('idle'); setDisplayPct(0) }, 1000)
    }, 600_000)
  }, [project.id, queryClient])

  // ─── File drop handler ─────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      setUploadErrors([])
      setUploadWarnings([])
      const largestSize = acceptedFiles.reduce((m, f) => Math.max(m, f.size), 0)
      const MB = 1024 * 1024
      const GB = 1024 * MB
      const mb = Math.round(largestSize / MB)
      if (largestSize > 1 * GB) {
        setLargeFileNotice({
          tone: 'orange',
          message: `Très gros DCE détecté (${mb} Mo). Envoi jusqu'à 15 minutes selon votre connexion. Restez sur cette page.`,
        })
      } else if (largestSize > 500 * MB) {
        setLargeFileNotice({
          tone: 'cyan',
          message: 'Envoi volumineux, ~3-7 minutes. Ne fermez pas l\'onglet.',
        })
      } else if (largestSize > 100 * MB) {
        setLargeFileNotice({
          tone: 'cyan',
          message: 'Envoi en cours, ~1-3 minutes.',
        })
      } else {
        setLargeFileNotice(null)
      }
      setPhase('uploading')
      setDisplayPct(0)
      setLabel('Envoi des fichiers…')
      setSublabel('')
      processingStartedRef.current = false
      doneRef.current = false
      lastProgressUpdateRef.current = 0

      const errors: string[] = []
      const warnings: string[] = []
      let hasZip = false

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i]
        setUploading((prev) => ({ ...prev, [file.name]: true }))
        if (file.name.toLowerCase().endsWith('.zip')) hasZip = true
        try {
          const detectedType = detectDocType(file.name)
          const result = await uploadService.uploadProjectDocument(
            project.id, file, detectedType,
            ({ loaded, total }) => {
              const isComplete = total > 0 && loaded >= total
              const now = Date.now()
              if (!isComplete && now - lastProgressUpdateRef.current < 500) return
              lastProgressUpdateRef.current = now

              const filePct = total > 0 ? loaded / total : 0
              const overallPct = ((i + filePct) / acceptedFiles.length) * 100
              const mapped = Math.round(Math.min(overallPct, 100) * 0.25)
              // max : la réception serveur (SSE) peut être devant l'envoi
              // axios throttlé — jamais de retour en arrière.
              setDisplayPct(prev => Math.max(prev, mapped))

              const MB = 1024 * 1024
              const loadedMb = (loaded / MB).toFixed(1)
              const totalMb = total > 0 ? (total / MB).toFixed(1) : '?'
              const pct = Math.round(overallPct)
              setSublabel(`${loadedMb} / ${totalMb} Mo (${pct}%)`)

              if (hasZip && isComplete) {
                startProcessing()
              }
            },
          )
          if (result && typeof result === 'object' && 'warnings' in result) {
            const w = (result as { warnings?: string[] }).warnings
            if (w && w.length > 0) warnings.push(...w)
          }
          // C16 — doc perso reconnu → bandeau coffre-fort (non-bloquant)
          if (result && typeof result === 'object' && 'vault_suggestion' in result) {
            const r = result as { id: string; file_name: string; vault_suggestion?: { type: string; category: string } | null }
            if (r.vault_suggestion) {
              const s: VaultSuggestion = {
                docId: r.id, fileName: r.file_name,
                type: r.vault_suggestion.type, category: r.vault_suggestion.category,
              }
              setVaultPrompts((prev) => prev.some(p => p.docId === s.docId) ? prev : [...prev, s])
            }
          }
          queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
        } catch (err) {
          const msg = axios.isAxiosError(err)
            ? (err.response?.data?.detail ?? err.message)
            : String(err)
          errors.push(`${file.name} : ${msg}`)
        } finally {
          setUploading((prev) => ({ ...prev, [file.name]: false }))
        }
      }

      if (errors.length > 0) {
        setUploadErrors(errors)
        if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
        processingStartedRef.current = false
        setPhase('idle')
        setDisplayPct(0)
        setLargeFileNotice(null)
      } else if (!hasZip) {
        setPhase('idle')
        setDisplayPct(0)
        setLargeFileNotice(null)
      }

      if (warnings.length > 0) setUploadWarnings(warnings)
    },
    [project.id, queryClient, startProcessing],
  )

  // C15 — fichier déposé sur l'écran d'accueil (premier AO offert) :
  // récupéré une seule fois au montage et uploadé automatiquement.
  useEffect(() => {
    const pending = takePendingUpload()
    if (pending) onDrop([pending])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (files) => {
      const msgs = files.map((f) => {
        const name = f.file.name.toLowerCase()
        if (name.endsWith('.rar') || name.endsWith('.7z')) {
          return `${f.file.name} : Les fichiers .rar et .7z ne sont pas supportés. Veuillez convertir votre archive en .zip.`
        }
        return `${f.file.name} : ${f.errors.map((e) => e.message).join(', ')}`
      })
      setUploadErrors(msgs)
    },
    noClick: true,
    accept: {
      'application/pdf':        ['.pdf'],
      'application/msword':     ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel':                                                ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       ['.xlsx'],
      'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
      'application/zip':              ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'application/octet-stream':     ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.ods'],
    },
    maxSize: 2 * 1024 * 1024 * 1024,
  })

  const updateDocType = async (docId: string, type: ProjectDocumentType) => {
    await api.patch(`/projects/${project.id}/documents/${docId}`, { type })
    queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })
  }

  const hasDocuments = documents.length > 0
  const totalBytes = documents.reduce((s, d) => s + (d.file_size || 0), 0)
  const anyUploading = Object.values(uploading).some(Boolean)
  const isProcessing = phase !== 'idle'
  const showOverlay = phase === 'uploading' || phase === 'processing' || phase === 'done'

  const handleNext = () => {
    setNextError(null)
    setIsNavigating(true)
    navigate(`/projects/${project.id}/lots`)
  }

  /* ════════════════════════════════════════════════════════════════
     JSX
     ════════════════════════════════════════════════════════════════ */
  return (
    <>
      {aSupprimer && (
        <DeleteConfirmModal
          title={'tous' in aSupprimer
            ? `Supprimer les ${documents.length} fichiers du DCE ?`
            : `Supprimer « ${aSupprimer.doc.file_name} » ?`}
          detail={'tous' in aSupprimer
            ? 'Les fichiers ne seront plus dans le dossier de cet AO.'
            : 'Le fichier ne sera plus dans le dossier de cet AO.'}
          onConfirm={async () => {
            if ('tous' in aSupprimer) await Promise.all(documents.map((d) => deleteDoc(d.id)))
            else await deleteDoc(aSupprimer.doc.id)
            setASupprimer(null)
          }}
          onCancel={() => setASupprimer(null)}
        />
      )}

      {/* Upload overlay */}
      {showOverlay && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-8 max-w-sm w-full mx-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', boxShadow: '0 20px 60px color-mix(in srgb, var(--surface-dark) 15%, transparent)' }}>
            <ProgressDisplay
              variant="inline"
              steps={UPLOAD_STEPS}
              currentStep={
                phase === 'uploading' ? 'uploading'
                  : phase === 'processing' ? 'extracting_text'
                  : 'extracting_text'
              }
              progress={Math.round(displayPct)}
              detail={sublabel || label}
              phase={phase === 'done' ? 'complete' : 'in_progress'}
            />
          </div>
        </div>,
        document.body,
      )}

      <div style={{ fontFamily: F }}>

        {/* ── AiTips ──────────────────────────────────────── */}
        <AiTipsBlock tips={uploadTips} dismissed={dismissedTips} onDismiss={(id) => setDismissedTips((s) => new Set(s).add(id))} />

        {/* ── DROPZONE ADAPTATIVE ──────────────────────────
            Vide : grande zone d'accueil. Fichiers importés : bandeau
            compact — la place revient au contenu, pas au vide. */}
        {!hasDocuments ? (
          <div
            {...getRootProps()}
            className={cn(
              'blueprint-grid overflow-hidden rounded-2xl text-center cursor-pointer transition-all duration-200 mt-4',
              isDragActive ? 'ring-2 ring-fg' : '',
            )}
            style={{
              border: '1px dashed',
              borderColor: isDragActive ? 'var(--text-1)' : 'var(--border-2)',
              background: isDragActive ? 'color-mix(in srgb, var(--text-1) 6%, transparent)' : 'var(--surface-1)',
              padding: '56px 24px',
            }}
          >
            <input {...getInputProps()} />

            <div className="relative flex justify-center mb-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--text-1) 8%, transparent)',
                  boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-1) 12%, transparent)',
                }}
              >
                <CloudUpload size={26} style={{ color: 'var(--text-1)' }} />
              </div>
            </div>

            <p className="relative text-lg font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
              {isDragActive ? 'Déposez les fichiers ici…' : 'Déposez le DCE complet'}
            </p>
            <p className="relative text-sm mb-6" style={{ color: 'var(--text-3)' }}>
              Le ZIP entier suffit — Synorix identifie chaque pièce et chaque lot automatiquement.
            </p>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); open() }}
              className="glass-btn text-ds-text relative px-6 py-2.5 rounded-lg text-sm font-semibold"
            >
              Parcourir les fichiers
            </button>

            <p className="relative num-mono mt-5 text-xs" style={{ color: 'var(--text-3)' }}>
              .pdf · .docx · .xlsx · .ods · .zip — jusqu&apos;à 2 Go
            </p>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={cn(
              'rounded-xl cursor-pointer transition-all duration-200 mt-4',
              isDragActive ? 'ring-2 ring-fg' : '',
            )}
            style={{
              border: '1px dashed',
              borderColor: isDragActive ? 'var(--text-1)' : 'var(--border-2)',
              background: isDragActive ? 'color-mix(in srgb, var(--text-1) 6%, transparent)' : 'var(--surface-1)',
            }}
          >
            <input {...getInputProps()} />
            <div className="flex items-center gap-4 px-5 py-3.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--text-1) 8%, transparent)', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-1) 10%, transparent)' }}
              >
                <CloudUpload size={19} style={{ color: 'var(--text-1)' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {isDragActive ? 'Déposez ici…' : 'Ajouter des fichiers au dossier'}
                </p>
                <p className="num-mono mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                  glisser-déposer · .pdf .docx .xlsx .ods .zip · 2 Go max
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); open() }}
                className="glass-btn text-ds-text shrink-0 rounded-lg px-4 py-2 text-xs font-semibold"
              >
                Parcourir
              </button>
            </div>
          </div>
        )}

        {/* ── Large-file reassurance (cyan for normal, orange for very large) ─ */}
        {largeFileNotice && (phase === 'uploading' || phase === 'processing') && (
          <div
            className="rounded-xl p-4 mt-4 flex items-start gap-3"
            style={
              largeFileNotice.tone === 'orange'
                ? { background: 'color-mix(in srgb, var(--text-3) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text-3) 25%, transparent)' }
                : { background: 'color-mix(in srgb, var(--text-1) 6%, transparent)', border: '1px solid var(--border-2)' }
            }
          >
            <Clock
              size={16}
              style={{ color: largeFileNotice.tone === 'orange' ? 'var(--text-3)' : 'var(--text-1)' }}
              className="shrink-0 mt-0.5"
            />
            <p className="text-sm" style={{ color: 'var(--text-1)' }}>{largeFileNotice.message}</p>
          </div>
        )}

        {/* ── Upload errors ───────────────────────────────── */}
        {uploadErrors.length > 0 && (
          <div className="rounded-xl p-4 mt-4" style={{ background: 'color-mix(in srgb, var(--danger-fg) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--danger-fg) 15%, transparent)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--danger-fg)' }}>Erreurs lors de l&apos;envoi :</p>
            {uploadErrors.map((err, i) => (
              <p key={i} className="text-xs" style={{ color: 'var(--danger-fg)' }}>• {err}</p>
            ))}
          </div>
        )}

        {/* ── ZIP warnings ────────────────────────────────── */}
        {uploadWarnings.length > 0 && (
          <div className="rounded-xl p-4 mt-4" style={{ background: 'color-mix(in srgb, var(--text-3) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text-3) 15%, transparent)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-3)' }}>Certains fichiers n&apos;ont pas pu être extraits :</p>
            {uploadWarnings.map((w, i) => (
              <p key={i} className="text-xs" style={{ color: 'var(--text-3)' }}>• {w}</p>
            ))}
          </div>
        )}

        {/* ── C16 : bandeau coffre-fort progressif ─────────── */}
        {vaultPrompts.map((s) => (
          <VaultSavePrompt
            key={s.docId}
            suggestion={s}
            onDone={(docId) => setVaultPrompts((prev) => prev.filter(p => p.docId !== docId))}
          />
        ))}

        {/* ── FILES TABLE ─────────────────────────────────── */}
        {hasDocuments && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>Documents du DCE</h3>
                <p className="num-mono mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                  {documents.length} fichier{documents.length > 1 ? 's' : ''} · {formatSize(totalBytes)}
                </p>
              </div>
              {documents.length > 1 && (
                <button
                  onClick={() => setASupprimer({ tous: true })}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger-fg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  Tout supprimer
                </button>
              )}
            </div>

            <div className="glass-card overflow-hidden">
              {/* Table header */}
              <div
                className="hidden sm:grid items-center gap-3 px-5 py-2.5"
                style={{
                  borderBottom: '1px solid var(--line)',
                  gridTemplateColumns: '2fr 80px 130px 40px',
                }}
              >
                <span className="microlabel">Nom du fichier</span>
                <span className="microlabel">Taille</span>
                <span className="microlabel">Type détecté</span>
                <span />
              </div>

              {documents.map((doc, i) => {
                const badge = TYPE_BADGE[doc.type as ProjectDocumentType] ?? TYPE_BADGE.autre
                const isFilled = doc.type === 'ccap' || doc.type === 'rc'

                return (
                  <div
                    key={doc.id}
                    className="grid items-center gap-3 px-5 py-2.5 transition-colors hover:bg-ds-bg-2"
                    style={{
                      borderBottom: i < documents.length - 1 ? '1px solid var(--line)' : 'none',
                      gridTemplateColumns: '2fr 80px 130px 40px',
                    }}
                  >
                    {/* Filename */}
                    <div className="flex items-center gap-3 min-w-0">
                      <FileIcon filename={doc.file_name} />
                      <span className="text-sm truncate" style={{ color: 'var(--text-2)' }}>{doc.file_name}</span>
                    </div>

                    {/* Size */}
                    <span className="num-mono text-xs" style={{ color: 'var(--text-3)' }}>
                      {formatSize(doc.file_size)}
                    </span>

                    {/* Type badge — clickable select */}
                    <div className="relative">
                      <select
                        value={doc.type}
                        onChange={(e) => updateDocType(doc.id, e.target.value as ProjectDocumentType)}
                        className="appearance-none text-xs font-semibold rounded-full pl-2.5 pr-6 py-1 cursor-pointer outline-none"
                        style={{
                          color: isFilled ? 'var(--text-1)' : badge.color,
                          background: isFilled ? badge.bg : badge.bg,
                          border: `1px solid ${isFilled ? 'transparent' : badge.border}`,
                        }}
                      >
                        {DOC_TYPES.map(({ value, label: l }) => (
                          <option key={value} value={value}>{l.split(' — ')[0]}</option>
                        ))}
                      </select>
                      <ChevronRight size={10} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" style={{ color: isFilled ? 'var(--text-1)' : badge.color }} />
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => setASupprimer({ doc })}
                      aria-label={`Supprimer ${doc.file_name}`}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: 'var(--text-3)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger-fg)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--danger-fg) 6%, transparent)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────── */}
        {nextError && (
          <div
            className="flex items-start gap-2 p-4 rounded-xl text-sm mt-4"
            style={{ color: 'var(--danger-fg)', background: 'color-mix(in srgb, var(--danger-fg) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--danger-fg) 15%, transparent)' }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{nextError}</span>
          </div>
        )}

        {/* ── BOTTOM BAR ──────────────────────────────────── */}
        <div
          className="sticky bottom-0 mt-6 -mx-3 sm:-mx-4 px-5 py-3.5 flex items-center justify-between"
          style={{
            background: 'color-mix(in srgb, var(--surface-0) 92%, transparent)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderTop: '1px solid var(--border-1)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: hasDocuments ? 'var(--text-1)' : 'var(--text-3)' }} />
            <span className="text-sm" style={{ color: hasDocuments ? 'var(--text-3)' : 'var(--text-3)' }}>
              {hasDocuments
                ? `${documents.length} fichier${documents.length > 1 ? 's déposés' : ' déposé'} dans le dossier.`
                : 'Importez des fichiers pour continuer.'
              }
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: 'var(--text-3)', border: '1px solid var(--border-1)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)'; e.currentTarget.style.color = 'var(--text-3)' }}
            >
              Annuler
            </button>
            <button
              onClick={handleNext}
              disabled={!hasDocuments || anyUploading || isProcessing || isNavigating}
              className="signature-btn disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Étape suivante : Lots
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
