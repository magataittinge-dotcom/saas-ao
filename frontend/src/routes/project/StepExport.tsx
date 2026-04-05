import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileDown, Archive, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, AlertTriangle, FileText, Upload,
  ExternalLink, BarChart3, ClipboardList, BookOpen, FileSpreadsheet,
} from 'lucide-react'
import { api } from '@/services/api'
import type { Project } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceExportItem {
  id: string
  exigence_text: string
  category: string
  priority: string
  status: string
}

interface ChecklistExportItem {
  id: string
  document_type_required: string
  status: string
  details: string | null
  linked_document_name: string | null
}

interface MemoireExportInfo {
  version: number
  generated_at: string
  sections_count: number
  estimated_pages: number
}

interface DpgfExportInfo {
  file_name: string
  file_id: string
}

interface ExportDetail {
  compliance_total: number
  compliance_covered: number
  checklist_total: number
  checklist_present: number
  has_memoire: boolean
  has_dpgf: boolean
  compliance_items: ComplianceExportItem[]
  checklist_items: ChecklistExportItem[]
  memoire_info: MemoireExportInfo | null
  dpgf_info: DpgfExportInfo | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  candidature: 'Candidature',
  offre: 'Offre',
  technique: 'Technique',
  planning: 'Planning',
  criteres_notation: 'Critères de notation',
}

const STATUS_ICON: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  couvert:     { icon: CheckCircle2, color: '#10B981' },
  present:     { icon: CheckCircle2, color: '#10B981' },
  non_couvert: { icon: XCircle,      color: '#EF4444' },
  manquant:    { icon: XCircle,      color: '#EF4444' },
  partiel:     { icon: AlertTriangle, color: '#F59E0B' },
  expire:      { icon: AlertTriangle, color: '#F59E0B' },
  expiration_proche: { icon: AlertTriangle, color: '#F59E0B' },
  a_generer:   { icon: AlertTriangle, color: '#F59E0B' },
}

function StatusIcon({ status }: { status: string }) {
  const cfg = STATUS_ICON[status] ?? STATUS_ICON.non_couvert
  const Icon = cfg.icon
  return <Icon size={15} className="shrink-0" style={{ color: cfg.color }} />
}

// ─── Glass card wrapper ─────────────────────────────────────────────────────

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ background: 'rgba(12,17,30,0.55)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {children}
    </div>
  )
}

// ─── Expandable section ─────────────────────────────────────────────────────

function SummaryRow({
  icon: Icon, iconColor, label, ok, detail, expanded, onToggle, children,
}: {
  icon: typeof CheckCircle2
  iconColor: string
  label: string
  ok: boolean
  detail: string
  expanded: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <GlassCard>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}
          >
            <Icon size={18} style={{ color: iconColor }} />
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#E8ECF4' }}>
              {label}
            </span>
            <p className="text-[11px] mt-0.5" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
              {detail}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ok
            ? <CheckCircle2 size={18} style={{ color: '#10B981' }} />
            : <XCircle size={18} style={{ color: '#EF4444' }} />
          }
          {expanded
            ? <ChevronUp size={16} className="text-ds-text-3" />
            : <ChevronDown size={16} className="text-ds-text-3" />
          }
        </div>
      </button>
      {expanded && children && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {children}
        </div>
      )}
    </GlassCard>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepExport({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key))

  const { data: detail, isLoading } = useQuery({
    queryKey: ['export-detail', project.id],
    queryFn: async () => {
      const { data } = await api.get<ExportDetail>(`/projects/${project.id}/export/detail`)
      return data
    },
  })

  const { mutate: exportDocx, isPending: isExportingDocx } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/export/docx`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Memoire_Technique_${project.name.replace(/\s+/g, '_')}.docx`
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  const { mutate: exportZip, isPending: isExportingZip } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/export/zip`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Dossier_AO_${project.name.replace(/\s+/g, '_')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  // ── Upload candidature docs ───────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('type', 'candidature')
        await api.post(`/projects/${project.id}/documents/upload`, fd)
      }
      queryClient.invalidateQueries({ queryKey: ['export-detail', project.id] })
    } finally {
      setUploading(false)
    }
  }, [project.id, queryClient])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading || !detail) {
    return (
      <div className="glass-card p-12 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#3B82F6' }} />
      </div>
    )
  }

  // ── Group compliance by category ──────────────────────────────────────────
  const complianceByCategory: Record<string, ComplianceExportItem[]> = {}
  for (const item of detail.compliance_items) {
    const cat = item.category || 'offre'
    if (!complianceByCategory[cat]) complianceByCategory[cat] = []
    complianceByCategory[cat].push(item)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-ds-text" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Étape 6 — Vérification Finale &amp; Export
        </h2>
        <p className="text-sm mt-1" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
          Vérifiez votre dossier avant soumission. Cliquez sur chaque section pour voir le détail.
        </p>
      </div>

      {/* 1. Matrice de conformité */}
      <SummaryRow
        icon={BarChart3}
        iconColor={detail.compliance_covered === detail.compliance_total ? '#10B981' : '#EF4444'}
        label="Matrice de conformité"
        ok={detail.compliance_total > 0 && detail.compliance_covered === detail.compliance_total}
        detail={`${detail.compliance_covered}/${detail.compliance_total} exigences couvertes`}
        expanded={expanded === 'compliance'}
        onToggle={() => toggle('compliance')}
      >
        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {Object.entries(complianceByCategory).map(([cat, items]) => {
            const covered = items.filter((i) => i.status === 'couvert').length
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B95A9' }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: covered === items.length ? '#10B981' : '#F59E0B' }}>
                    {covered}/{items.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <StatusIcon status={item.status} />
                      <span className="text-xs leading-relaxed" style={{ color: '#C8CED8' }}>
                        {item.exigence_text}
                      </span>
                      {item.priority === 'obligatoire' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-auto" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
                          Obligatoire
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {detail.compliance_items.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: '#64748B' }}>Aucune exigence extraite</p>
          )}
        </div>
      </SummaryRow>

      {/* 2. Documents candidature */}
      <SummaryRow
        icon={ClipboardList}
        iconColor={detail.checklist_present === detail.checklist_total && detail.checklist_total > 0 ? '#10B981' : '#EF4444'}
        label="Documents candidature"
        ok={detail.checklist_total > 0 && detail.checklist_present === detail.checklist_total}
        detail={`${detail.checklist_present}/${detail.checklist_total} documents présents`}
        expanded={expanded === 'checklist'}
        onToggle={() => toggle('checklist')}
      >
        <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
          {detail.checklist_items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <StatusIcon status={item.status} />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: '#E8ECF4' }}>
                    {item.document_type_required}
                  </p>
                  {item.linked_document_name && (
                    <p className="text-[11px] truncate" style={{ color: '#64748B' }}>
                      {item.linked_document_name}
                    </p>
                  )}
                </div>
              </div>
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                style={
                  item.status === 'present'
                    ? { background: 'rgba(16,185,129,0.12)', color: '#34D399' }
                    : { background: 'rgba(239,68,68,0.12)', color: '#F87171' }
                }
              >
                {item.status === 'present' ? 'Présent' : item.status === 'expire' ? 'Expiré' : 'Manquant'}
              </span>
            </div>
          ))}
          {detail.checklist_items.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: '#64748B' }}>Aucun document requis détecté</p>
          )}
        </div>
      </SummaryRow>

      {/* 3. Mémoire technique */}
      <SummaryRow
        icon={BookOpen}
        iconColor={detail.has_memoire ? '#10B981' : '#EF4444'}
        label="Mémoire technique"
        ok={detail.has_memoire}
        detail={detail.has_memoire ? 'Généré' : 'Non généré'}
        expanded={expanded === 'memoire'}
        onToggle={() => toggle('memoire')}
      >
        <div className="p-4">
          {detail.memoire_info ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-lg font-bold" style={{ color: '#60A5FA' }}>{detail.memoire_info.estimated_pages}</p>
                  <p className="text-[11px]" style={{ color: '#8B95A9' }}>pages estimées</p>
                </div>
                <div className="text-center py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-lg font-bold" style={{ color: '#60A5FA' }}>{detail.memoire_info.sections_count}</p>
                  <p className="text-[11px]" style={{ color: '#8B95A9' }}>sections</p>
                </div>
                <div className="text-center py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-lg font-bold" style={{ color: '#60A5FA' }}>v{detail.memoire_info.version}</p>
                  <p className="text-[11px]" style={{ color: '#8B95A9' }}>version</p>
                </div>
              </div>
              <p className="text-[11px]" style={{ color: '#64748B' }}>
                Généré le {new Date(detail.memoire_info.generated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <button
                onClick={() => navigate(`/projects/${project.id}/memoire`)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-blue-500/20"
                style={{ color: '#60A5FA', border: '1px solid rgba(59,130,246,0.30)' }}
              >
                <ExternalLink size={13} /> Voir / Modifier le mémoire
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs" style={{ color: '#64748B' }}>Le mémoire technique n'a pas encore été généré.</p>
              <button
                onClick={() => navigate(`/projects/${project.id}/memoire`)}
                className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ color: '#60A5FA', border: '1px solid rgba(59,130,246,0.30)' }}
              >
                Aller à l'étape Mémoire →
              </button>
            </div>
          )}
        </div>
      </SummaryRow>

      {/* 4. DPGF */}
      <SummaryRow
        icon={FileSpreadsheet}
        iconColor={detail.has_dpgf ? '#10B981' : '#F59E0B'}
        label="DPGF"
        ok={detail.has_dpgf}
        detail={detail.has_dpgf ? 'Présente' : 'Manquante'}
        expanded={expanded === 'dpgf'}
        onToggle={() => toggle('dpgf')}
      >
        <div className="p-4">
          {detail.dpgf_info ? (
            <div className="flex items-center gap-3">
              <FileText size={16} style={{ color: '#64748B' }} />
              <span className="text-xs" style={{ color: '#C8CED8' }}>{detail.dpgf_info.file_name}</span>
            </div>
          ) : (
            <p className="text-xs" style={{ color: '#64748B' }}>
              Aucun fichier DPGF détecté dans les documents du projet.
            </p>
          )}
        </div>
      </SummaryRow>

      {/* 5. Upload candidature docs */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(59,130,246,0.12)' }}
          >
            <Upload size={18} style={{ color: '#60A5FA' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ fontFamily: 'Outfit, sans-serif', color: '#E8ECF4' }}>
              Documents de candidature
            </h3>
            <p className="text-[11px] mt-0.5" style={{ fontFamily: 'DM Sans, sans-serif', color: '#8B95A9' }}>
              Déposez vos attestations, certificats et documents administratifs
            </p>
          </div>
        </div>
        <div
          className="relative rounded-xl p-6 text-center transition-all"
          style={{
            border: `2px dashed ${isDragging ? 'rgba(59,130,246,0.60)' : 'rgba(255,255,255,0.10)'}`,
            background: isDragging ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)',
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <Loader2 size={24} className="mx-auto animate-spin" style={{ color: '#60A5FA' }} />
          ) : (
            <>
              <Upload size={24} className="mx-auto mb-2" style={{ color: '#475569' }} />
              <p className="text-xs" style={{ color: '#8B95A9' }}>
                Glissez-déposez vos fichiers ici ou{' '}
                <label className="cursor-pointer font-medium" style={{ color: '#60A5FA' }}>
                  parcourir
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  />
                </label>
              </p>
              <p className="text-[10px] mt-1" style={{ color: '#475569' }}>
                PDF, DOCX, JPG, PNG
              </p>
            </>
          )}
        </div>
      </GlassCard>

      {/* 6. Export buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => exportDocx()}
          disabled={isExportingDocx || !detail.has_memoire}
          className="btn-primary flex items-center justify-center gap-2 flex-1 py-3 px-6 disabled:opacity-40"
        >
          {isExportingDocx ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
          Télécharger le mémoire (.docx)
        </button>

        <button
          onClick={() => exportZip()}
          disabled={isExportingZip}
          className="btn-glass flex items-center justify-center gap-2 flex-1 py-3 px-6 font-semibold"
        >
          {isExportingZip ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
          Dossier complet (.zip)
        </button>
      </div>
    </div>
  )
}
