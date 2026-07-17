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

const UPLOAD_STEPS: StepDescriptor[] = [
  { key: 'uploading',       label: 'Transfert du dossier',   estimated_s: 30 },
  { key: 'extracting_zip',  label: 'Extraction du ZIP',      estimated_s: 5 },
  { key: 'extracting_text', label: 'Indexation des documents', estimated_s: 60 },
]

const F = "'Geist', sans-serif"

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
  rc:              { color: '#E4E9F2', bg: 'rgba(228,233,242,0.10)', border: 'rgba(228,233,242,0.20)' },
  cctp:           { color: '#C3CCDC', bg: 'rgba(228,233,242,0.08)', border: 'rgba(228,233,242,0.20)' },
  ccap:           { color: '#E4E9F2', bg: 'rgba(228,233,242,0.10)', border: 'rgba(228,233,242,0.20)' },
  dpgf:           { color: '#C7CEDA', bg: 'rgba(120,130,149,0.08)', border: 'rgba(120,130,149,0.20)' },
  acte_engagement: { color: '#C3CCDC', bg: 'rgba(228,233,242,0.10)', border: 'rgba(228,233,242,0.20)' },
  plan:           { color: '#9BA4B5', bg: '#1C222D', border: 'rgba(186,205,234,.13)' },
  autre:          { color: '#788295', bg: 'transparent', border: 'transparent' },
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return <FileText size={18} className="shrink-0" style={{ color: '#F58E86' }} />
  if (ext === 'docx' || ext === 'doc') return <FileText size={18} className="shrink-0" style={{ color: '#E4E9F2' }} />
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') return <FileSpreadsheet size={18} className="shrink-0" style={{ color: '#E4E9F2' }} />
  if (ext === 'zip') return <FileArchive size={18} className="shrink-0" style={{ color: '#9BA4B5' }} />
  return <File size={18} className="shrink-0" style={{ color: '#788295' }} />
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
      tips.push({ id: 'upload-large', variant: 'warning', text: 'Les fichiers volumineux peuvent prendre quelques minutes a traiter.' })
    }
    tips.push({ id: 'upload-zip', variant: 'info', text: 'Astuce : uploadez le ZIP complet du DCE pour une detection automatique de tous les documents et lots.' })
    return tips
  }, [documents])

  const { mutate: deleteDoc } = useMutation({
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
  const sse = useProgressStream(project.id, {
    enabled: phase === 'processing',
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

  // Map the SSE progress into the page's display state during processing.
  useEffect(() => {
    if (phase !== 'processing' || doneRef.current) return
    // Backend covers upload + extraction in 0-100. We map onto 30-95 so
    // the overall bar continues from where axios-upload left off (0-30).
    const realPct = 30 + (sse.progress / 100) * 65
    setDisplayPct(prev => Math.max(prev, Math.min(realPct, 95)))
    if (sse.detail) setSublabel(sse.detail)
    if (sse.step) setLabel(sse.step)
  }, [sse.progress, sse.detail, sse.step, phase])

  const startProcessing = useCallback(() => {
    if (processingStartedRef.current || doneRef.current) return
    processingStartedRef.current = true

    setPhase('processing')
    setDisplayPct(30)
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
          message: `Très gros DCE détecté (${mb} Mo). Upload jusqu'à 15 minutes selon votre connexion. Restez sur cette page.`,
        })
      } else if (largestSize > 500 * MB) {
        setLargeFileNotice({
          tone: 'cyan',
          message: 'Upload volumineux, ~3-7 minutes. Ne fermez pas l\'onglet.',
        })
      } else if (largestSize > 100 * MB) {
        setLargeFileNotice({
          tone: 'cyan',
          message: 'Upload en cours, ~1-3 minutes.',
        })
      } else {
        setLargeFileNotice(null)
      }
      setPhase('uploading')
      setDisplayPct(0)
      setLabel('Upload des fichiers...')
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
              const mapped = Math.round(Math.min(overallPct, 100) * 0.3)
              setDisplayPct(mapped)

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
      {/* Upload overlay */}
      {showOverlay && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-8 max-w-sm w-full mx-4" style={{ background: '#151A23', border: '1px solid rgba(186,205,234,.13)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
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

        {/* ── DROPZONE ────────────────────────────────────── */}
        <div
          {...getRootProps()}
          className={cn(
            'rounded-2xl text-center cursor-pointer transition-all duration-200 mt-4',
            isDragActive ? 'ring-2 ring-[#E4E9F2]' : '',
          )}
          style={{
            border: '2px dashed',
            borderColor: isDragActive ? '#E4E9F2' : 'rgba(186,205,234,.13)',
            background: isDragActive ? 'rgba(228,233,242,0.06)' : '#151A23',
            padding: '48px 24px',
          }}
          onMouseEnter={(e) => {
            if (!isDragActive) {
              e.currentTarget.style.borderColor = '#5C6678'
              e.currentTarget.style.background = '#0F1218'
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragActive) {
              e.currentTarget.style.borderColor = 'rgba(186,205,234,.13)'
              e.currentTarget.style.background = '#F4F6FA'
            }
          }}
        >
          <input {...getInputProps()} />

          <div className="flex justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: isDragActive ? 'rgba(228,233,242,0.12)' : 'rgba(228,233,242,0.08)' }}
            >
              <CloudUpload size={28} style={{ color: '#E4E9F2' }} />
            </div>
          </div>

          <p className="text-lg font-semibold mb-1" style={{ color: '#F4F6FA' }}>
            {isDragActive ? 'Déposez les fichiers ici...' : 'Glissez vos fichiers DCE ici'}
          </p>
          <p className="text-sm mb-5" style={{ color: '#788295' }}>
            Analysez automatiquement vos pièces écrites grâce à l&apos;IA
          </p>

          {/* Separator */}
          <div className="flex items-center gap-4 max-w-xs mx-auto mb-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(186,205,234,.13)' }} />
            <span className="text-xs font-semibold uppercase" style={{ color: '#5C6678' }}>ou</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(186,205,234,.13)' }} />
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open() }}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-[#0F1218] transition-colors"
            style={{ background: '#E9EDF5' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#C3CCDC' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E4E9F2' }}
          >
            Parcourir les fichiers
          </button>

          <p className="text-xs mt-4" style={{ color: '#5C6678' }}>
            Formats acceptés : .pdf .docx .xlsx .ods .zip — jusqu&apos;à 2 Go
          </p>
        </div>

        {/* ── Large-file reassurance (cyan for normal, orange for very large) ─ */}
        {largeFileNotice && (phase === 'uploading' || phase === 'processing') && (
          <div
            className="rounded-xl p-4 mt-4 flex items-start gap-3"
            style={
              largeFileNotice.tone === 'orange'
                ? { background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.25)' }
                : { background: 'rgba(228,233,242,0.06)', border: '1px solid rgba(228,233,242,0.20)' }
            }
          >
            <Clock
              size={16}
              style={{ color: largeFileNotice.tone === 'orange' ? '#F5C26B' : '#E4E9F2' }}
              className="shrink-0 mt-0.5"
            />
            <p className="text-sm" style={{ color: '#F4F6FA' }}>{largeFileNotice.message}</p>
          </div>
        )}

        {/* ── Upload errors ───────────────────────────────── */}
        {uploadErrors.length > 0 && (
          <div className="rounded-xl p-4 mt-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#F58E86' }}>Erreurs lors de l&apos;upload :</p>
            {uploadErrors.map((err, i) => (
              <p key={i} className="text-xs" style={{ color: '#F58E86' }}>• {err}</p>
            ))}
          </div>
        )}

        {/* ── ZIP warnings ────────────────────────────────── */}
        {uploadWarnings.length > 0 && (
          <div className="rounded-xl p-4 mt-4" style={{ background: 'rgba(120,130,149,0.06)', border: '1px solid rgba(120,130,149,0.15)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#C7CEDA' }}>Certains fichiers n&apos;ont pas pu être extraits :</p>
            {uploadWarnings.map((w, i) => (
              <p key={i} className="text-xs" style={{ color: '#9BA4B5' }}>• {w}</p>
            ))}
          </div>
        )}

        {/* ── FILES TABLE ─────────────────────────────────── */}
        {hasDocuments && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold" style={{ color: '#F4F6FA' }}>Fichiers importés</h3>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: '#9BA4B5', background: '#1C222D' }}
                >
                  {documents.length}
                </span>
              </div>
              {documents.length > 1 && (
                <button
                  onClick={() => documents.forEach((d) => deleteDoc(d.id))}
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#F58E86' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#F58E86' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#F58E86' }}
                >
                  Tout supprimer
                </button>
              )}
            </div>

            <div
              className="rounded-xl overflow-hidden"
              style={{ background: '#151A23', border: '1px solid rgba(186,205,234,.13)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
            >
              {/* Table header */}
              <div
                className="hidden sm:grid items-center gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  color: '#788295',
                  borderBottom: '1px solid rgba(186,205,234,.13)',
                  gridTemplateColumns: '2fr 80px 130px 40px',
                }}
              >
                <span>Nom du fichier</span>
                <span>Taille</span>
                <span>Type détecté</span>
                <span />
              </div>

              {documents.map((doc, i) => {
                const badge = TYPE_BADGE[doc.type as ProjectDocumentType] ?? TYPE_BADGE.autre
                const isFilled = doc.type === 'ccap' || doc.type === 'rc'

                return (
                  <div
                    key={doc.id}
                    className="grid items-center gap-3 px-5 py-3 transition-colors"
                    style={{
                      borderBottom: i < documents.length - 1 ? '1px solid rgba(186,205,234,.10)' : 'none',
                      gridTemplateColumns: '2fr 80px 130px 40px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#0F1218' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Filename */}
                    <div className="flex items-center gap-3 min-w-0">
                      <FileIcon filename={doc.file_name} />
                      <span className="text-sm truncate" style={{ color: '#F4F6FA' }}>{doc.file_name}</span>
                    </div>

                    {/* Size */}
                    <span className="text-sm" style={{ color: '#788295' }}>
                      {formatSize(doc.file_size)}
                    </span>

                    {/* Type badge — clickable select */}
                    <div className="relative">
                      <select
                        value={doc.type}
                        onChange={(e) => updateDocType(doc.id, e.target.value as ProjectDocumentType)}
                        className="appearance-none text-[11px] font-semibold rounded-full pl-2.5 pr-6 py-1 cursor-pointer outline-none"
                        style={{
                          color: isFilled ? '#F4F6FA' : badge.color,
                          background: isFilled ? badge.bg : badge.bg,
                          border: `1px solid ${isFilled ? 'transparent' : badge.border}`,
                        }}
                      >
                        {DOC_TYPES.map(({ value, label: l }) => (
                          <option key={value} value={value}>{l.split(' — ')[0]}</option>
                        ))}
                      </select>
                      <ChevronRight size={10} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" style={{ color: isFilled ? '#F4F6FA' : badge.color }} />
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteDoc(doc.id)}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: '#5C6678' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#F58E86'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#5C6678'; e.currentTarget.style.background = 'transparent' }}
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
            style={{ color: '#F58E86', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{nextError}</span>
          </div>
        )}

        {/* ── BOTTOM BAR ──────────────────────────────────── */}
        <div
          className="sticky bottom-0 mt-6 -mx-3 sm:-mx-4 px-5 py-3.5 flex items-center justify-between"
          style={{
            background: 'rgba(10,12,17,0.92)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(186,205,234,.13)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: hasDocuments ? '#E4E9F2' : '#5C6678' }} />
            <span className="text-sm" style={{ color: hasDocuments ? '#9BA4B5' : '#5C6678' }}>
              {hasDocuments
                ? "Tous les fichiers ont été vérifiés pour l'intégrité."
                : 'Importez des fichiers pour continuer.'
              }
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: '#9BA4B5', border: '1px solid rgba(186,205,234,.13)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#5C6678'; e.currentTarget.style.color = '#F4F6FA' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(186,205,234,.13)'; e.currentTarget.style.color = '#9BA4B5' }}
            >
              Annuler
            </button>
            <button
              onClick={handleNext}
              disabled={!hasDocuments || anyUploading || isProcessing || isNavigating}
              className="signature-btn disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant &gt;
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
