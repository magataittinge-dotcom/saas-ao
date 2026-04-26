import { useRef, useState } from 'react'
import {
  CheckCircle2, AlertCircle, Download, Upload, FileText, Loader2,
} from 'lucide-react'
import type { ChecklistItem } from '@/types'

const F = "'DM Sans', sans-serif"

const TEMPLATE_LABELS: Record<string, string> = {
  dc1_template: 'Formulaire DC1',
  dc2_template: 'Formulaire DC2',
  acte_engagement_template: 'Acte d\'engagement',
  dpgf_template: 'DPGF',
  bpu_template: 'Bordereau de prix unitaires',
  dqe_template: 'Détail quantitatif estimatif',
  cadre_reponse: 'Cadre de réponse',
  attestation_visite_template: 'Attestation de visite',
}

interface Props {
  projectId: string
  items: ChecklistItem[]
  onUploadCompleted: (item: ChecklistItem, file: File) => Promise<void>
}

export default function CandidatureSectionTemplates({ projectId, items, onUploadCompleted }: Props) {
  if (items.length === 0) return null

  const present = items.filter((i) => i.status === 'present').length

  return (
    <section
      className="bg-white rounded-lg overflow-hidden"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#F0F9FF' }}
          >
            <FileText size={18} style={{ color: '#0EA5E9' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>
              Formulaires à compléter (DCE)
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {present}/{items.length} complétés — téléchargez le modèle vierge, complétez-le, puis ré-uploadez la version finale
            </p>
          </div>
        </div>
      </header>

      <ul className="divide-y" style={{ borderColor: '#F1F5F9' }}>
        {items.map((item) => (
          <TemplateRow
            key={item.id}
            projectId={projectId}
            item={item}
            onUploadCompleted={onUploadCompleted}
          />
        ))}
      </ul>
    </section>
  )
}

function TemplateRow({
  projectId, item, onUploadCompleted,
}: {
  projectId: string
  item: ChecklistItem
  onUploadCompleted: (item: ChecklistItem, file: File) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPresent = item.status === 'present'
  const hasTemplate = !!item.template_project_doc_id
  const label = TEMPLATE_LABELS[item.document_type_required] || item.document_type_required

  const downloadHref = item.template_project_doc_id
    ? `/api/projects/${projectId}/documents/${item.template_project_doc_id}/preview`
    : undefined

  const completedHref = item.completed_project_doc_id
    ? `/api/projects/${projectId}/documents/${item.completed_project_doc_id}/preview`
    : undefined

  const handlePick = () => fileRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await onUploadCompleted(item, file)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Échec de l\'upload'
      setError(msg)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <li className="px-6 py-4 flex items-start gap-4">
      {/* Status icon */}
      <span className="shrink-0 mt-0.5">
        {isPresent
          ? <CheckCircle2 size={18} style={{ color: '#10B981' }} />
          : <AlertCircle size={18} style={{ color: hasTemplate ? '#F59E0B' : '#EF4444' }} />}
      </span>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{label}</span>
          {!hasTemplate && (
            <span className="text-[11px]" style={{ color: '#EF4444' }}>
              Modèle non trouvé dans le DCE
            </span>
          )}
          {hasTemplate && !isPresent && (
            <span className="text-[11px]" style={{ color: '#F59E0B' }}>
              À compléter
            </span>
          )}
          {isPresent && (
            <span className="text-[11px]" style={{ color: '#10B981' }}>
              Complété
            </span>
          )}
        </div>
        {item.details && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#64748B' }}>
            {item.details}
          </p>
        )}
        {item.source_in_rc && (
          <p className="text-[11px] mt-1 italic" style={{ color: '#94A3B8' }}>
            « {item.source_in_rc} »
          </p>
        )}
        {error && (
          <p className="text-[11px] mt-1.5" style={{ color: '#EF4444' }}>{error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {hasTemplate && downloadHref && (
          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100"
            style={{ border: '1px solid #E2E8F0', color: '#475569' }}
          >
            <Download size={13} />
            Modèle vierge
          </a>
        )}
        {isPresent && completedHref && (
          <a
            href={completedHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100"
            style={{ border: '1px solid #E2E8F0', color: '#475569' }}
          >
            <FileText size={13} />
            Voir version finale
          </a>
        )}
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          style={{ background: isPresent ? '#475569' : '#0EA5E9' }}
        >
          {uploading
            ? <><Loader2 size={13} className="animate-spin" /> Envoi...</>
            : <><Upload size={13} /> {isPresent ? 'Remplacer' : 'Uploader complété'}</>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </div>
    </li>
  )
}
