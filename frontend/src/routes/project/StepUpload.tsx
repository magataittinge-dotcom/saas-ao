import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, FileSpreadsheet, File, Trash2, AlertCircle, Layers, CloudUpload } from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { uploadService } from '@/services/upload'
import LoadingProgress from '@/components/common/LoadingProgress'
import type { Project, ProjectDocument, ProjectDocumentType } from '@/types'
import { cn } from '@/lib/utils'

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

const TYPE_COLORS: Record<ProjectDocumentType, string> = {
  rc:              'bg-sky-500/15 text-sky-400 border-sky-500/25',
  cctp:            'bg-violet-500/15 text-violet-400 border-violet-500/25',
  ccap:            'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  dpgf:            'bg-amber-500/15 text-amber-400 border-amber-500/25',
  acte_engagement: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  plan:            'bg-blue-400/15 text-blue-300 border-blue-400/25',
  autre:           'bg-white/5 text-ds-text-2 border-white/10',
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return <FileText size={17} className="shrink-0" style={{ color: '#F87171' }} />
  if (ext === 'docx' || ext === 'doc') return <FileText size={17} className="shrink-0" style={{ color: '#60A5FA' }} />
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') return <FileSpreadsheet size={17} className="shrink-0" style={{ color: '#34D399' }} />
  return <File size={17} className="shrink-0" style={{ color: '#94A3B8' }} />
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
  const [nextError, setNextError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  // Interval refs for cleanup
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(false) // permanent guard — once done, never re-trigger

  const { data: documents = [] } = useQuery({
    queryKey: ['project-documents', project.id],
    queryFn: async () => {
      const { data } = await api.get<ProjectDocument[]>(`/projects/${project.id}/documents`)
      return data
    },
  })

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

  // ─── Start simulated progress + polling (called when 100% bytes sent) ────────
  const speedRef = useRef(0.15)
  const processingStartedRef = useRef(false)

  const startProcessing = useCallback(() => {
    // Idempotent guard — onUploadProgress fires multiple times at 100%
    if (processingStartedRef.current || doneRef.current) return
    processingStartedRef.current = true

    setPhase('processing')
    setDisplayPct(30)
    setLabel("Extraction de l'archive...")
    setSublabel('')
    speedRef.current = 0.15 // start slow

    // 1) Animation: smooth crawl from 30% to 95%
    //    Slow phase (ZIP): +0.15/200ms ≈ 0.75%/s → reaches ~50% after 25s
    //    Fast phase (text): +0.3/200ms ≈ 1.5%/s → accelerates once backend starts extracting
    if (animRef.current) clearInterval(animRef.current)
    animRef.current = setInterval(() => {
      setDisplayPct(prev => Math.min(prev + speedRef.current, 95))
    }, 200)

    // 2) Polling: check backend every 2s, use REAL progress when available
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      // Permanent guard — once done, never process another poll tick
      if (doneRef.current) return

      try {
        const { data } = await api.get<{ status: string; progress: number; detail: string }>(
          `/projects/${project.id}/processing-status`
        )

        if (doneRef.current) return // re-check after await

        // Backend started text extraction with real progress → stop crawl, use real values
        if (data.status === 'extracting_text' && data.progress > 0) {
          if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
          const realPct = 30 + (data.progress / 100) * 65
          setDisplayPct(realPct)
          setLabel('Extraction des documents...')
          if (data.detail) setSublabel(data.detail)
        } else if (data.status === 'extracting_text') {
          setLabel('Extraction des documents...')
        } else if (data.status === 'extracting_zip') {
          setLabel("Extraction de l'archive...")
        }

        if (data.status === 'ready' || data.status === 'error') {
          // Mark done FIRST — prevents any re-trigger
          doneRef.current = true

          // Stop ALL intervals BEFORE changing any state
          if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }

          // Show 100%
          setDisplayPct(100)
          setLabel('Traitement terminé !')
          setSublabel('')
          setPhase('done')

          if (data.status === 'error') {
            setUploadErrors(prev => [...prev, 'Erreur lors du traitement des documents.'])
          }

          queryClient.invalidateQueries({ queryKey: ['project-documents', project.id] })

          // Dismiss after 1s — phase goes idle but doneRef stays true
          setTimeout(() => {
            setPhase('idle')
            setDisplayPct(0)
          }, 1000)
        }
      } catch {
        // ignore poll errors
      }
    }, 2000)

    // 3) Safety timeout: 10 minutes max
    safetyRef.current = setTimeout(() => {
      if (doneRef.current) return
      doneRef.current = true
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
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
      setPhase('uploading')
      setDisplayPct(0)
      setLabel('Upload des fichiers...')
      setSublabel('')
      processingStartedRef.current = false // reset guard for new upload
      doneRef.current = false // allow new processing cycle

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
              const filePct = total > 0 ? loaded / total : 0
              const overallPct = ((i + filePct) / acceptedFiles.length) * 100
              const mapped = Math.round(Math.min(overallPct, 100) * 0.3)
              setDisplayPct(mapped)
              setSublabel(`${Math.round(overallPct)}% envoyé`)

              // Bytes fully sent → start processing simulation immediately
              // Don't wait for server response (ZIP extraction takes 20-30s)
              if (hasZip && loaded >= total && total > 0) {
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

      // Server responded — processing already started from onUploadProgress
      if (errors.length > 0) {
        setUploadErrors(errors)
        // Stop processing if it was started
        if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
        processingStartedRef.current = false
        setPhase('idle')
        setDisplayPct(0)
      } else if (!hasZip) {
        setPhase('idle')
        setDisplayPct(0)
      }
      // If hasZip + no errors: processing was already started, do nothing

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

  return (
    <>
      {showOverlay && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(8,11,18,0.85)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card p-8 max-w-sm">
            <LoadingProgress
              progress={Math.round(displayPct)}
              label={label}
              sublabel={sublabel}
              variant="upload"
            />
          </div>
        </div>,
        document.body,
      )}

      <div className="glass-card p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-ds-text">Étape 1 — Upload des documents DCE</h2>
          <p className="text-sm text-ds-text-2 mt-1">
            Uploadez les fichiers du Dossier de Consultation des Entreprises (PDF, DOCX, XLSX).
          </p>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'rounded-xl p-10 text-center cursor-pointer transition-all duration-200',
            isDragActive ? 'dropzone-active' : '',
          )}
          style={{
            border: isDragActive
              ? '2px dashed rgba(59,130,246,0.60)'
              : '2px dashed rgba(59,130,246,0.30)',
            background: isDragActive
              ? 'rgba(59,130,246,0.06)'
              : 'rgba(59,130,246,0.02)',
            boxShadow: isDragActive
              ? '0 0 40px rgba(59,130,246,0.15), inset 0 0 30px rgba(59,130,246,0.05)'
              : 'none',
            transition: 'border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!isDragActive) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.50)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.04)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(59,130,246,0.1)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragActive) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.30)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.02)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }
          }}
        >
          <input {...getInputProps()} />

          <div className="flex justify-center mb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: isDragActive ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.20)',
                boxShadow: isDragActive
                  ? '0 0 30px rgba(59,130,246,0.30)'
                  : '0 4px 12px rgba(59,130,246,0.10)',
                transition: 'all 0.2s ease',
              }}
            >
              {isDragActive
                ? <CloudUpload size={28} style={{ color: '#3B82F6' }} />
                : <Upload size={26} style={{ color: '#60A5FA' }} />
              }
            </div>
          </div>

          <p
            className="text-sm font-semibold mb-1"
            style={{
              color: isDragActive ? '#93C5FD' : '#CBD5E1',
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            }}
          >
            {isDragActive ? 'Déposez les fichiers ici...' : 'Glissez-déposez vos fichiers DCE ici'}
          </p>
          <p className="text-xs mb-1" style={{ color: '#475569' }}>
            PDF, DOCX, XLSX, ODS, ZIP — 2 Go max par fichier
          </p>
          <p className="text-xs mb-4" style={{ color: '#60A5FA' }}>
            Type de document détecté automatiquement selon le nom du fichier
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); open() }}
            className="btn-primary px-5 py-2"
          >
            Parcourir les fichiers
          </button>
        </div>

        {/* Upload errors */}
        {uploadErrors.length > 0 && (
          <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
            <p className="text-sm font-medium text-red-400 mb-1">Erreurs lors de l'upload :</p>
            {uploadErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-300">• {err}</p>
            ))}
          </div>
        )}

        {/* ZIP extraction warnings */}
        {uploadWarnings.length > 0 && (
          <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#F59E0B' }}>Certains fichiers n'ont pas pu être extraits :</p>
            {uploadWarnings.map((w, i) => (
              <p key={i} className="text-xs" style={{ color: '#FCD34D' }}>• {w}</p>
            ))}
          </div>
        )}

        {/* Uploaded files */}
        {hasDocuments && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ds-text-2">
              Fichiers uploadés ({documents.length})
            </h3>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 hover:bg-white/[0.03]"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <FileIcon filename={doc.file_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ds-text truncate">{doc.file_name}</p>
                  {doc.file_size && (
                    <p className="text-xs text-ds-text-3">{formatSize(doc.file_size)}</p>
                  )}
                </div>

                <span
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full border shrink-0',
                    TYPE_COLORS[doc.type as ProjectDocumentType] ?? TYPE_COLORS.autre,
                  )}
                >
                  {DOC_TYPES.find((t) => t.value === doc.type)?.label.split(' — ')[0] ?? 'Autre'}
                </span>

                <select
                  value={doc.type}
                  onChange={(e) => updateDocType(doc.id, e.target.value as ProjectDocumentType)}
                  className="text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 text-ds-text"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: '#E2E8F0',
                  }}
                >
                  {DOC_TYPES.map(({ value, label: l }) => (
                    <option key={value} value={value}>{l}</option>
                  ))}
                </select>

                <button
                  onClick={() => deleteDoc(doc.id)}
                  className="p-1 text-ds-text-3 hover:text-ds-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {nextError && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{nextError}</span>
          </div>
        )}

        {/* CTA */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleNext}
            disabled={!hasDocuments || anyUploading || isProcessing || isNavigating}
            className="btn-primary flex items-center gap-2 px-6 py-2.5"
          >
            <Layers size={16} />
            Continuer →
          </button>
        </div>
      </div>
    </>
  )
}
