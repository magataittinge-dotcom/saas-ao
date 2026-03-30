import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, FileSpreadsheet, File, Trash2, AlertCircle, Layers, CloudUpload } from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { uploadService } from '@/services/upload'
import type { Project, ProjectDocument, ProjectDocumentType } from '@/types'
import { cn } from '@/lib/utils'

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
  plan:            'bg-teal-500/15 text-teal-400 border-teal-500/25',
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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])  // AMÉLIORATION 9
  const [nextError, setNextError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

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

  const { mutate: detectLots } = useMutation({
    mutationFn: () => api.get(`/projects/${project.id}/lots`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      navigate(`/projects/${project.id}/lots`)
    },
    onError: (err) => {
      setIsNavigating(false)
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? 'Erreur lors de la détection des lots')
        : 'Erreur lors de la détection des lots'
      setNextError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      setUploadErrors([])
      setUploadWarnings([])
      setUploadProgress({ current: 0, total: acceptedFiles.length, fileName: '' })

      const errors: string[] = []
      const warnings: string[] = []
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i]
        setUploadProgress({ current: i + 1, total: acceptedFiles.length, fileName: file.name })
        setUploading((prev) => ({ ...prev, [file.name]: true }))
        try {
          const detectedType = detectDocType(file.name)
          const result = await uploadService.uploadProjectDocument(project.id, file, detectedType)
          // AMÉLIORATION 9: collect ZIP extraction warnings
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

      setUploadProgress(null)
      if (errors.length > 0) setUploadErrors(errors)
      if (warnings.length > 0) setUploadWarnings(warnings)
    },
    [project.id, queryClient],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected: (files) => {
      const msgs = files.map((f) => {
        // AMÉLIORATION 4: friendly message for .rar / .7z
        const name = f.file.name.toLowerCase()
        if (name.endsWith('.rar') || name.endsWith('.7z')) {
          return `${f.file.name} : Les fichiers .rar et .7z ne sont pas supportés. Veuillez convertir votre archive en .zip avant de l'uploader. Vous pouvez utiliser 7-Zip (gratuit) ou simplement extraire les fichiers et les re-zipper.`
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
      // AMÉLIORATION 1: .ods (LibreOffice Calc)
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

  const handleNext = () => {
    setNextError(null)
    setIsNavigating(true)
    detectLots()
  }

  return (
    <>

      {uploadProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(8,11,18,0.85)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card p-8 flex flex-col items-center gap-4 max-w-sm">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(14,165,233,0.15)" strokeWidth="6" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#0EA5E9" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(uploadProgress.current / uploadProgress.total) * 264} 264`}
                  style={{ transition: 'stroke-dasharray 0.5s ease', filter: 'drop-shadow(0 0 6px rgba(14,165,233,0.4))' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold" style={{ color: '#0EA5E9', fontFamily: '"JetBrains Mono", monospace' }}>
                  {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                </span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-ds-text font-medium">Upload {uploadProgress.current}/{uploadProgress.total} fichiers...</p>
              <p className="text-sm text-ds-text-2 mt-1 truncate max-w-xs">{uploadProgress.fileName}</p>
            </div>
          </div>
        </div>
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
              ? '2px dashed rgba(14,165,233,0.60)'
              : '2px dashed rgba(14,165,233,0.18)',
            background: isDragActive
              ? 'rgba(14,165,233,0.06)'
              : 'rgba(14,165,233,0.02)',
            ...(isDragActive ? {} : {
              transition: 'border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
            }),
          }}
          onMouseEnter={(e) => {
            if (!isDragActive) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(14,165,233,0.35)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(14,165,233,0.04)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragActive) {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(14,165,233,0.18)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(14,165,233,0.02)'
            }
          }}
        >
          <input {...getInputProps()} />

          {/* Upload icon with glow */}
          <div className="flex justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: isDragActive ? 'rgba(14,165,233,0.18)' : 'rgba(14,165,233,0.08)',
                border: '1px solid rgba(14,165,233,0.20)',
                boxShadow: isDragActive ? '0 0 24px rgba(14,165,233,0.25)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {isDragActive
                ? <CloudUpload size={26} style={{ color: '#0EA5E9' }} />
                : <Upload size={24} style={{ color: '#64748B' }} />
              }
            </div>
          </div>

          <p
            className="text-sm font-semibold mb-1"
            style={{
              color: isDragActive ? '#7DD3FC' : '#CBD5E1',
              fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            }}
          >
            {isDragActive ? 'Déposez les fichiers ici...' : 'Glissez-déposez vos fichiers DCE ici'}
          </p>
          <p className="text-xs mb-1" style={{ color: '#475569' }}>
            PDF, DOCX, XLSX, ODS, ZIP — 2 Go max par fichier
          </p>
          <p className="text-xs mb-4" style={{ color: '#38BDF8' }}>
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

        {/* ZIP extraction warnings (AMÉLIORATION 9) */}
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
                  {DOC_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
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
            disabled={!hasDocuments || anyUploading || isNavigating}
            className="btn-primary flex items-center gap-2 px-6 py-2.5"
          >
            {isNavigating ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#fff' }} />
                Détection des lots...
              </>
            ) : (
              <>
                <Layers size={16} />
                Continuer →
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
