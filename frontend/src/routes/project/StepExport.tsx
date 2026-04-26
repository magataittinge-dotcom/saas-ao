import { useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileDown, Archive, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronRight, AlertTriangle, Upload,
  ExternalLink, FileSpreadsheet,
  Download, ClipboardCheck, BookOpen, Grid3X3, Mail,
} from 'lucide-react'
import { api } from '@/services/api'
import type { Project } from '@/types'
import DocumentViewer, { type ViewableDocument } from '@/components/project/DocumentViewer'

const F = "'DM Sans', sans-serif"

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
  linked_document_id: string | null
}

interface ProjectDocumentExportItem {
  id: string
  file_name: string
  type: string
  pdf_preview_url: string | null
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

interface DpgfVerification {
  valid: boolean
  warnings: string[]
  total_ht: number | null
  nb_lignes: number
  nb_lignes_remplies: number
  nb_lignes_vides: number
}

interface DpgfRemplieInfo {
  file_name: string | null
  verification: DpgfVerification | null
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
  project_documents: ProjectDocumentExportItem[]
  memoire_info: MemoireExportInfo | null
  dpgf_info: DpgfExportInfo | null
  dpgf_remplie: DpgfRemplieInfo | null
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
  couvert:     { icon: CheckCircle2, color: '#0EA5E9' },
  present:     { icon: CheckCircle2, color: '#0EA5E9' },
  non_couvert: { icon: XCircle,      color: '#EF4444' },
  manquant:    { icon: XCircle,      color: '#EF4444' },
  partiel:     { icon: AlertTriangle, color: '#64748B' },
  expire:      { icon: AlertTriangle, color: '#EF4444' },
  expiration_proche: { icon: AlertTriangle, color: '#64748B' },
  a_generer:   { icon: AlertTriangle, color: '#64748B' },
}

function StatusIcon({ status }: { status: string }) {
  const cfg = STATUS_ICON[status] ?? STATUS_ICON.non_couvert
  const Icon = cfg.icon
  return <Icon size={15} className="shrink-0" style={{ color: cfg.color }} />
}

// ─── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, value, sublabel, ok,
}: {
  icon: typeof CheckCircle2
  label: string
  value: string
  sublabel: string
  ok: boolean
}) {
  return (
    <div
      className="bg-white rounded-xl p-5 text-center"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center justify-center mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: '#F0F9FF' }}
        >
          <Icon size={20} style={{ color: '#0EA5E9' }} />
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full"
        style={ok
          ? { background: '#ECFDF5', color: '#0284C7', border: '1px solid #A7F3D0' }
          : { background: 'rgba(100,116,139,0.08)', color: '#475569', border: '1px solid rgba(100,116,139,0.20)' }
        }
      >
        {ok ? (
          <><CheckCircle2 size={10} /> Vérifié</>
        ) : (
          <><AlertTriangle size={10} /> Attention</>
        )}
      </span>
      <p className="text-2xl font-bold mt-2" style={{ color: '#0F172A', fontFamily: F }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: '#64748B' }}>{label}</p>
      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{sublabel}</p>
    </div>
  )
}

// ─── Accordion Section ─────────────────────────────────────────────────────

function AccordionSection({
  title, ok, expanded, onToggle, children,
}: {
  title: string
  ok: boolean
  expanded: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      className="bg-white rounded-xl overflow-hidden"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          {ok
            ? <CheckCircle2 size={16} style={{ color: '#0EA5E9' }} />
            : <AlertTriangle size={16} style={{ color: '#64748B' }} />
          }
          <span className="text-sm font-semibold" style={{ color: '#0F172A', fontFamily: F }}>
            {title}
          </span>
        </div>
        {expanded
          ? <ChevronDown size={16} style={{ color: '#94A3B8' }} />
          : <ChevronRight size={16} style={{ color: '#94A3B8' }} />
        }
      </button>
      {expanded && children && (
        <div style={{ borderTop: '1px solid #F1F5F9' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepExport({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dpgfUploading, setDpgfUploading] = useState(false)
  const [dpgfDragging, setDpgfDragging] = useState(false)
  const [dpgfError, setDpgfError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

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

  // ── DPGF download ────────────────────────────────────────────────────────
  const handleDownloadDpgf = useCallback(async () => {
    if (!detail?.dpgf_info) return
    const response = await api.get(
      `/projects/${project.id}/documents/${detail.dpgf_info.file_id}/download`,
      { responseType: 'blob' },
    )
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = detail.dpgf_info.file_name
    a.click()
    URL.revokeObjectURL(url)
  }, [project.id, detail?.dpgf_info])

  // ── DPGF filled upload ───────────────────────────────────────────────────
  const handleDpgfUpload = useCallback(async (file: File) => {
    setDpgfUploading(true)
    setDpgfError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/projects/${project.id}/dpgf-upload`, fd)
      queryClient.invalidateQueries({ queryKey: ['export-detail', project.id] })
    } catch {
      setDpgfError("Erreur lors de l'upload de la DPGF")
    } finally {
      setDpgfUploading(false)
    }
  }, [project.id, queryClient])

  const onDpgfDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDpgfDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleDpgfUpload(file)
  }, [handleDpgfUpload])

  // ── Viewable documents for the DocumentViewer ────────────────────────────
  const viewableDocs: ViewableDocument[] = useMemo(() => {
    if (!detail) return []
    return detail.project_documents.map((d) => ({
      id: d.id,
      name: d.file_name,
      source: 'project' as const,
    }))
  }, [detail])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading || !detail) {
    return (
      <div
        className="bg-white rounded-xl p-12 flex flex-col items-center gap-3"
        style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <Loader2 size={32} className="animate-spin" style={{ color: '#0EA5E9' }} />
        <p className="font-medium" style={{ color: '#0F172A', fontFamily: F }}>
          Chargement de la vérification...
        </p>
      </div>
    )
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const complianceByCategory: Record<string, ComplianceExportItem[]> = {}
  for (const item of detail.compliance_items) {
    const cat = item.category || 'offre'
    if (!complianceByCategory[cat]) complianceByCategory[cat] = []
    complianceByCategory[cat].push(item)
  }

  const complianceOk = detail.compliance_total > 0 && detail.compliance_covered === detail.compliance_total
  const checklistOk = detail.checklist_total > 0 && detail.checklist_present === detail.checklist_total
  const memoireOk = detail.has_memoire
  const dpgfOk = detail.has_dpgf && (detail.dpgf_remplie?.verification?.valid ?? false)

  const alertCount =
    (complianceOk ? 0 : 1) +
    (checklistOk ? 0 : 1) +
    (memoireOk ? 0 : 1) +
    (dpgfOk ? 0 : 1)

  const dpgfLignes = detail.dpgf_remplie?.verification?.nb_lignes ?? 0

  // ── Bottom bar ──────────────────────────────────────────────────────────
  const bottomBar = (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center px-6 py-3 gap-3"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid #F1F5F9',
      }}
    >
      <button
        onClick={() => exportZip()}
        disabled={isExportingZip}
        className="signature-btn disabled:opacity-40"
        style={{ fontFamily: F, padding: '12px 32px', fontSize: '16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(14,165,233,0.30)' }}
      >
        {isExportingZip ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
        Télécharger le dossier ZIP
      </button>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-24" style={{ fontFamily: F }}>

      {/* ── Centered title ──────────────────────────────────────── */}
      <div className="text-center">
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
          Vérification finale &amp; Export
        </h1>
        <p className="text-sm mt-2" style={{ color: '#64748B' }}>
          Votre dossier de réponse est complet et prêt pour la signature électronique.
        </p>
      </div>

      {/* ── 4 Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={ClipboardCheck}
          label="Conformité candidature"
          value={detail.compliance_total > 0 ? `${Math.round((detail.compliance_covered / detail.compliance_total) * 100)}/100` : '--'}
          sublabel="Score de pertinence IA"
          ok={complianceOk}
        />
        <SummaryCard
          icon={BookOpen}
          label="Mémoire technique"
          value={memoireOk ? 'PRÊT' : '--'}
          sublabel={detail.memoire_info ? `${detail.memoire_info.estimated_pages} pages générées` : 'Non généré'}
          ok={memoireOk}
        />
        <SummaryCard
          icon={Grid3X3}
          label="DPGF"
          value={dpgfOk ? 'COMPLET' : detail.has_dpgf ? 'PARTIEL' : '--'}
          sublabel={dpgfLignes > 0 ? `${dpgfLignes} lignes vérifiées` : 'Aucune DPGF'}
          ok={dpgfOk}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Alertes restantes"
          value={String(alertCount)}
          sublabel={alertCount > 0 ? 'Vérification manuelle requise' : 'Aucune alerte'}
          ok={alertCount === 0}
        />
      </div>

      {/* ── Détails des points de contrôle ──────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={18} style={{ color: '#0EA5E9' }} />
          <h2 className="text-base font-semibold" style={{ color: '#0F172A', fontFamily: F }}>
            Détails des points de contrôle
          </h2>
        </div>

        <div className="space-y-3">

          {/* 1. Pièces Administratives */}
          <AccordionSection
            title={`Pièces Administratives (${detail.checklist_present}/${detail.checklist_total})`}
            ok={checklistOk}
            expanded={expanded === 'checklist'}
            onToggle={() => toggle('checklist')}
          >
            <div className="p-4 space-y-1 max-h-[400px] overflow-y-auto">
              {detail.checklist_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <StatusIcon status={item.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: '#1E293B' }}>
                        {item.document_type_required}
                      </p>
                      {item.linked_document_name && (
                        <p className="text-xs truncate" style={{ color: '#64748B' }}>
                          {item.linked_document_name}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.status !== 'present' && (
                    <span className="text-xs font-medium shrink-0 cursor-pointer" style={{ color: '#0EA5E9' }}>
                      À corriger
                    </span>
                  )}
                </div>
              ))}
              {detail.checklist_items.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Aucun document requis détecté</p>
              )}
            </div>
          </AccordionSection>

          {/* 2. Mémoire Technique & Offre */}
          <AccordionSection
            title="Mémoire Technique &amp; Offre"
            ok={memoireOk}
            expanded={expanded === 'memoire'}
            onToggle={() => toggle('memoire')}
          >
            <div className="p-4">
              {detail.memoire_info ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <CheckCircle2 size={15} style={{ color: '#0EA5E9' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: '#1E293B' }}>
                        Mémoire technique v{detail.memoire_info.version}
                      </p>
                      <p className="text-xs" style={{ color: '#64748B' }}>
                        {detail.memoire_info.estimated_pages} pages, {detail.memoire_info.sections_count} sections — généré le{' '}
                        {new Date(detail.memoire_info.generated_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/projects/${project.id}/memoire`)}
                      className="flex items-center gap-1 text-xs font-medium shrink-0 transition-colors"
                      style={{ color: '#0EA5E9' }}
                    >
                      <ExternalLink size={12} /> Voir
                    </button>
                  </div>
                  <p className="text-xs px-3" style={{ color: '#94A3B8' }}>
                    Les documents de réponse seront inclus dans le ZIP.
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <AlertTriangle size={16} className="mx-auto mb-2" style={{ color: '#64748B' }} />
                  <p className="text-xs" style={{ color: '#64748B' }}>Le mémoire technique n&apos;a pas encore été généré.</p>
                  <button
                    onClick={() => navigate(`/projects/${project.id}/memoire`)}
                    className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-sky-50"
                    style={{ border: '1px solid #0EA5E9', color: '#0EA5E9' }}
                  >
                    Aller à l&apos;étape Mémoire →
                  </button>
                </div>
              )}
            </div>
          </AccordionSection>

          {/* 3. Analyse du Bordereau de Prix (DPGF) */}
          <AccordionSection
            title="Analyse du Bordereau de Prix (DPGF)"
            ok={dpgfOk}
            expanded={expanded === 'dpgf'}
            onToggle={() => toggle('dpgf')}
          >
            <div className="p-4 space-y-4">
              {/* Download original DPGF */}
              {detail.dpgf_info && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: '#F8FAFC' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet size={16} style={{ color: '#0EA5E9' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#1E293B' }}>{detail.dpgf_info.file_name}</p>
                      <p className="text-[11px]" style={{ color: '#64748B' }}>DPGF originale du DCE</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadDpgf}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 hover:bg-sky-50"
                    style={{ border: '1px solid #0EA5E9', color: '#0EA5E9' }}
                  >
                    <Download size={13} /> Télécharger
                  </button>
                </div>
              )}

              {/* Upload filled DPGF */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#1E293B' }}>
                  Déposer votre DPGF remplie
                </p>
                <div
                  className="relative rounded-xl p-4 text-center transition-all cursor-pointer"
                  style={{
                    border: `2px dashed ${dpgfDragging ? '#0EA5E9' : '#CBD5E1'}`,
                    background: dpgfDragging ? 'rgba(16,185,129,0.04)' : '#FAFBFC',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDpgfDragging(true) }}
                  onDragLeave={() => setDpgfDragging(false)}
                  onDrop={onDpgfDrop}
                >
                  {dpgfUploading ? (
                    <Loader2 size={20} className="mx-auto animate-spin" style={{ color: '#0EA5E9' }} />
                  ) : (
                    <>
                      <Upload size={20} className="mx-auto mb-1.5" style={{ color: '#94A3B8' }} />
                      <p className="text-xs" style={{ color: '#64748B' }}>
                        Glissez votre DPGF remplie ici ou{' '}
                        <label className="cursor-pointer font-medium" style={{ color: '#0EA5E9' }}>
                          parcourir
                          <input
                            type="file"
                            accept=".xlsx,.xls,.ods,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleDpgfUpload(f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#94A3B8' }}>XLSX, XLS, ODS, PDF</p>
                    </>
                  )}
                </div>
                {dpgfError && (
                  <p className="text-xs mt-1.5" style={{ color: '#EF4444' }}>{dpgfError}</p>
                )}
              </div>

              {/* Verification result */}
              {detail.dpgf_remplie?.verification && (() => {
                const v = detail.dpgf_remplie!.verification!
                const isValid = v.valid
                const hasWarnings = v.warnings.length > 0
                return (
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: isValid ? 'rgba(16,185,129,0.04)' : hasWarnings ? 'rgba(245,158,11,0.04)' : 'rgba(239,68,68,0.04)',
                      border: `1px solid ${isValid ? 'rgba(16,185,129,0.15)' : hasWarnings ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isValid
                          ? <CheckCircle2 size={16} style={{ color: '#0EA5E9' }} />
                          : <AlertTriangle size={16} style={{ color: hasWarnings ? '#64748B' : '#EF4444' }} />
                        }
                        <span
                          className="text-xs font-semibold"
                          style={{ color: isValid ? '#0EA5E9' : hasWarnings ? '#475569' : '#EF4444' }}
                        >
                          {isValid ? 'DPGF conforme' : hasWarnings ? 'DPGF avec avertissements' : 'DPGF non conforme'}
                        </span>
                      </div>
                      <span className="text-[11px]" style={{ color: '#94A3B8' }}>
                        {detail.dpgf_remplie!.file_name}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center py-1.5 rounded-lg" style={{ background: '#F8FAFC' }}>
                        <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{v.nb_lignes}</p>
                        <p className="text-[10px]" style={{ color: '#94A3B8' }}>lignes</p>
                      </div>
                      <div className="text-center py-1.5 rounded-lg" style={{ background: '#F8FAFC' }}>
                        <p className="text-sm font-bold" style={{ color: '#0EA5E9' }}>{v.nb_lignes_remplies}</p>
                        <p className="text-[10px]" style={{ color: '#94A3B8' }}>remplies</p>
                      </div>
                      <div className="text-center py-1.5 rounded-lg" style={{ background: '#F8FAFC' }}>
                        <p className="text-sm font-bold" style={{ color: v.nb_lignes_vides > 0 ? '#EF4444' : '#0EA5E9' }}>{v.nb_lignes_vides}</p>
                        <p className="text-[10px]" style={{ color: '#94A3B8' }}>vides</p>
                      </div>
                    </div>

                    {v.total_ht != null && (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg mb-2" style={{ background: '#F8FAFC' }}>
                        <span className="text-xs" style={{ color: '#64748B' }}>Total HT</span>
                        <span className="text-sm font-bold tabular-nums font-mono" style={{ color: '#0F172A' }}>
                          {v.total_ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    )}

                    {v.warnings.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {v.warnings.map((w, i) => (
                          <p key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: '#475569' }}>
                            <span className="shrink-0 mt-0.5">&#8226;</span>
                            {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {!detail.dpgf_info && !detail.dpgf_remplie && (
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Aucun fichier DPGF détecté dans les documents du projet.
                </p>
              )}
            </div>
          </AccordionSection>

          {/* 4. Matrice de conformité */}
          <AccordionSection
            title={`Matrice de conformité (${detail.compliance_covered}/${detail.compliance_total})`}
            ok={complianceOk}
            expanded={expanded === 'compliance'}
            onToggle={() => toggle('compliance')}
          >
            <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
              {Object.entries(complianceByCategory).map(([cat, items]) => {
                const covered = items.filter((i) => i.status === 'couvert').length
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                      <span className="text-[11px] font-medium" style={{ color: covered === items.length ? '#0EA5E9' : '#64748B' }}>
                        {covered}/{items.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                          <StatusIcon status={item.status} />
                          <span className="text-sm leading-relaxed flex-1" style={{ color: '#334155' }}>
                            {item.exigence_text}
                          </span>
                          {item.priority === 'obligatoire' && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-auto"
                              style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}
                            >
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
                <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Aucune exigence extraite</p>
              )}
            </div>
          </AccordionSection>
        </div>
      </div>

      {/* ── Export buttons (centered) ────────────────────────────── */}
      <div className="text-center mt-8 space-y-3">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => exportDocx()}
            disabled={isExportingDocx || !detail.has_memoire}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-sky-50 disabled:opacity-40"
            style={{ color: '#0EA5E9' }}
          >
            {isExportingDocx ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Générer rapport PDF
          </button>
          <button
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-sky-50"
            style={{ color: '#0EA5E9' }}
          >
            <Mail size={14} />
            Envoyer par email
          </button>
        </div>
        <p className="text-xs max-w-lg mx-auto" style={{ color: '#94A3B8' }}>
          Le dossier compressé (.zip) contient l&apos;ensemble des pièces nommées selon les exigences du règlement de consultation.
        </p>
      </div>

      {/* ── Sticky bottom bar ───────────────────────────────────── */}
      {createPortal(bottomBar, document.body)}

      {/* Document viewer modal */}
      {viewerIndex !== null && viewableDocs.length > 0 && (
        <DocumentViewer
          projectId={project.id}
          documents={viewableDocs}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}
