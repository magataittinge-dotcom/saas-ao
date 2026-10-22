import { useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileDown, Archive, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronRight, AlertTriangle, Upload,
  ExternalLink, FileSpreadsheet, FileText, Eye,
  Download,
} from 'lucide-react'
import { api } from '@/services/api'
import type { Project } from '@/types'
import DocumentViewer, { type ViewableDocument } from '@/components/project/DocumentViewer'
import { DocumentRowSkeleton } from '@/components/skeletons'
import EchecAction from '@/components/common/EchecAction'
import { messageErreur } from '@/lib/erreurs'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

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
  source_kind: string
  signature_confirmed: boolean
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
  naming_convention: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  candidature: 'Candidature',
  offre: 'Offre',
  technique: 'Technique',
  planning: 'Planning',
  criteres_notation: 'Critères de notation',
}

// Statuts métier : vert = conforme, ambre = à traiter, corail = vraie alerte
const STATUS_ICON: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  couvert:     { icon: CheckCircle2, color: '#6EE7A8' },
  present:     { icon: CheckCircle2, color: '#6EE7A8' },
  non_couvert: { icon: XCircle,      color: '#F58E86' },
  manquant:    { icon: XCircle,      color: '#F58E86' },
  partiel:     { icon: AlertTriangle, color: '#D9A441' },
  expire:      { icon: AlertTriangle, color: '#F58E86' },
  expiration_proche: { icon: AlertTriangle, color: '#959597' },
  a_generer:   { icon: AlertTriangle, color: '#959597' },
}

function StatusIcon({ status }: { status: string }) {
  const cfg = STATUS_ICON[status] ?? STATUS_ICON.non_couvert
  const Icon = cfg.icon
  return <Icon size={15} className="shrink-0" style={{ color: cfg.color }} />
}

// ─── Hero check (ligne de contrôle compacte du héros) ──────────────────────

function HeroCheck({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {ok
        ? <CheckCircle2 size={13} className="shrink-0" style={{ color: '#6EE7A8' }} />
        : <AlertTriangle size={13} className="shrink-0" style={{ color: '#D9A441' }} />}
      <span style={{ color: '#959597' }}>{label}</span>
      <span className="num-mono font-semibold" style={{ color: '#F7F8F8' }}>{value}</span>
    </span>
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
      className="glass-card rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-ds-bg-2"
      >
        <div className="flex items-center gap-2.5">
          {ok
            ? <CheckCircle2 size={16} style={{ color: '#6EE7A8' }} />
            : <AlertTriangle size={16} style={{ color: '#D9A441' }} />
          }
          <span className="text-sm font-semibold" style={{ color: '#F7F8F8', fontFamily: F }}>
            {title}
          </span>
        </div>
        {expanded
          ? <ChevronDown size={16} style={{ color: '#6B6C6F' }} />
          : <ChevronRight size={16} style={{ color: '#6B6C6F' }} />
        }
      </button>
      {expanded && children && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
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

  // Gate ZIP (C10) — score de conformité : X < Y → export ambre non-bloquant
  const { data: score } = useQuery<{ conformes: number; total: number }>({
    queryKey: ['checklist-score', project.id],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${project.id}/checklist/score`)
      return data
    },
  })
  const [showGateWarning, setShowGateWarning] = useState(false)
  // 1.16 — un livrable qui ne se télécharge pas : on le dit, avec « Réessayer »
  const [echec, setEchec] = useState<{ message: string; relancer: () => void } | null>(null)

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
    onMutate: () => setEchec(null),
    onError: async (err) => setEchec({
      message: await messageErreur(err, "Le téléchargement du mémoire Word n'a pas abouti."),
      relancer: () => exportDocx(),
    }),
  })

  // C13a — PDF fidèle : la version dépôt (le Word reste pour la retouche)
  const { mutate: exportPdf, isPending: isExportingPdf } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/memoire/export-pdf`, {
        responseType: 'blob', timeout: 180_000,
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Memoire_Technique_${project.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
    onMutate: () => setEchec(null),
    onError: async (err) => setEchec({
      message: await messageErreur(err, "Le téléchargement du mémoire PDF n'a pas abouti."),
      relancer: () => exportPdf(),
    }),
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
    onMutate: () => setEchec(null),
    onError: async (err) => setEchec({
      message: await messageErreur(err, "Le téléchargement du dossier ZIP n'a pas abouti."),
      relancer: () => exportZip(),
    }),
  })

  // ── DPGF download ────────────────────────────────────────────────────────
  const handleDownloadDpgf = useCallback(async () => {
    if (!detail?.dpgf_info) return
    setEchec(null)
    try {
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
    } catch (err) {
      setEchec({
        message: await messageErreur(err, "Le téléchargement de la DPGF n'a pas abouti."),
        relancer: () => { void handleDownloadDpgf() },
      })
    }
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
      setDpgfError("L'envoi de la DPGF n'a pas abouti.")
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
      <div className="space-y-3">
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
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

  // ── Gate ZIP (C10) : X < Y pièces conformes → ambre + avertissement ──────
  const gateBlocked = !!score && score.total > 0 && score.conformes < score.total
  const CONFORME_STATUSES = new Set(['present', 'expiration_proche', 'non_applicable'])
  const SIGNABLE = new Set(['acte_engagement_template', 'dc1_template', 'dc2_template'])
  const nonConformes = (detail?.checklist_items ?? []).filter((i) =>
    i.status !== 'non_applicable' && (
      !CONFORME_STATUSES.has(i.status)
      || (i.source_kind === 'dce_template' && SIGNABLE.has(i.document_type_required) && !i.signature_confirmed)
    ),
  )

  // ── Faits du héros : l'état du dossier en un chiffre ─────────────────────
  const lotName = project.selected_lot_name || ''
  const conformes = score?.conformes ?? detail.checklist_present
  const totalPieces = score?.total ?? detail.checklist_total
  const readyForDeposit = !gateBlocked && alertCount === 0

  // ── Bottom bar ──────────────────────────────────────────────────────────
  const bottomBar = (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center px-6 py-3 gap-2"
      style={{
        background: 'rgba(9,9,10,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,.07)',
      }}
    >
      {gateBlocked && showGateWarning && (
        <div className="w-full max-w-xl rounded-xl px-4 py-3 text-left"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: '#D9A441' }}>
            {score!.conformes}/{score!.total} pièces conformes — à vérifier avant dépôt :
          </p>
          <ul className="text-xs space-y-0.5" style={{ color: '#D9A441' }}>
            {nonConformes.slice(0, 6).map((i) => (
              <li key={i.id}>
                • {i.linked_document_name || i.document_type_required}
                {' '}({i.status === 'manquant' ? 'à fournir'
                  : i.status === 'expire' ? 'expirée'
                  : i.status === 'warning' ? 'à vérifier'
                  : 'signature non confirmée'})
              </li>
            ))}
            {nonConformes.length > 6 && <li>… et {nonConformes.length - 6} autre(s)</li>}
          </ul>
          <button
            onClick={() => exportZip()}
            disabled={isExportingZip}
            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'rgba(217,164,65,0.10)', color: '#D9A441', border: '1px solid rgba(217,164,65,0.25)' }}
          >
            {isExportingZip ? 'Export…' : 'Exporter quand même'}
          </button>
        </div>
      )}
      <button
        onClick={() => (gateBlocked ? setShowGateWarning(s => !s) : exportZip())}
        disabled={isExportingZip}
        className="signature-btn disabled:opacity-40"
        style={{
          fontFamily: F, padding: '12px 32px', fontSize: '16px', borderRadius: '12px',
          ...(gateBlocked
            ? { background: 'linear-gradient(135deg, #D9A441, #D9A441)', boxShadow: '0 2px 8px rgba(245,158,11,0.30)' }
            : { boxShadow: '0 2px 8px rgba(255,255,255,0.30)' }),
        }}
      >
        {isExportingZip ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
        {gateBlocked
          ? `Télécharger le ZIP (${score!.conformes}/${score!.total} conformes)`
          : 'Télécharger le dossier ZIP'}
      </button>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-24" style={{ fontFamily: F }}>

      {/* ── HÉROS — le verdict : combien de pièces sont prêtes, que reste-t-il ── */}
      <div className="glass-card top-lit blueprint-grid sheen relative overflow-hidden px-5 py-4">
        <div className="relative grid items-start gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* L'état du dossier, en un chiffre */}
          <div className="min-w-0">
            <p className="microlabel mb-2.5">
              Export du dossier{lotName ? ` — ${lotName}` : ''}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <span className="num-mono bg-gradient-silver-text bg-clip-text text-5xl font-bold leading-none text-transparent">
                {conformes}/{totalPieces}
              </span>
              <div className="pb-0.5">
                <p className="text-sm font-semibold" style={{ color: '#F7F8F8' }}>pièces conformes</p>
                <p className="mt-0.5 text-xs font-medium" style={{ color: readyForDeposit ? '#6EE7A8' : 'var(--warn)' }}>
                  {readyForDeposit
                    ? 'Dossier prêt pour le dépôt'
                    : gateBlocked
                      ? `${totalPieces - conformes} pièce${totalPieces - conformes > 1 ? 's' : ''} à corriger avant le dépôt`
                      : `${alertCount} point${alertCount > 1 ? 's' : ''} de contrôle à vérifier`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <HeroCheck
                ok={complianceOk}
                label="Exigences couvertes"
                value={`${detail.compliance_covered}/${detail.compliance_total}`}
              />
              <HeroCheck
                ok={memoireOk}
                label="Mémoire"
                value={detail.memoire_info ? `${detail.memoire_info.estimated_pages} pages` : 'non généré'}
              />
              <HeroCheck
                ok={dpgfOk}
                label="DPGF"
                value={dpgfLignes > 0 ? `${dpgfLignes} lignes` : detail.has_dpgf ? 'à compléter' : 'aucune dans le DCE'}
              />
            </div>
          </div>

          {/* Livrables individuels — le ZIP reste LE CTA, en barre basse */}
          <div className="min-w-0">
            <p className="microlabel mb-2">Livrables</p>
            <div className="space-y-1.5">
              <button
                onClick={() => exportPdf()}
                disabled={isExportingPdf || !detail.has_memoire}
                className="glass-btn w-full flex items-center gap-2 py-1.5 px-3 text-xs font-semibold rounded-lg disabled:opacity-40"
                style={{ color: '#D8D9DB' }}
              >
                {isExportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                Mémoire PDF (dépôt)
              </button>
              <button
                onClick={() => exportDocx()}
                disabled={isExportingDocx || !detail.has_memoire}
                className="w-full flex items-center gap-2 py-1.5 px-3 text-xs font-medium rounded-lg transition-colors hover:bg-ds-bg-2 disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,.07)', color: '#959597' }}
              >
                {isExportingDocx ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                Mémoire Word (retouche)
              </button>
            </div>
            {detail.naming_convention && (
              <p className="mt-3 text-[11px] leading-relaxed" style={{ color: '#6B6C6F' }}>
                Pièces du ZIP nommées selon le RC&nbsp;:{' '}
                <span className="num-mono" style={{ color: '#959597' }}>
                  {detail.naming_convention.replace('{lot}', 'Lot').replace('{entreprise}', 'Entreprise').replace('{piece}', 'Pièce')}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {echec && (
        <EchecAction
          message={echec.message}
          onReessayer={() => { const relancer = echec.relancer; setEchec(null); relancer() }}
          onFermer={() => setEchec(null)}
        />
      )}

      {/* ── Points de contrôle ──────────────────────────────────── */}
      <div>
        <p className="microlabel mb-3">Points de contrôle</p>

        <div className="space-y-2.5">

          {/* 1. Pièces Administratives */}
          <AccordionSection
            title={`Pièces Administratives (${detail.checklist_present}/${detail.checklist_total})`}
            ok={checklistOk}
            expanded={expanded === 'checklist'}
            onToggle={() => toggle('checklist')}
          >
            <div className="px-3 py-2 space-y-0.5 max-h-[400px] overflow-y-auto">
              {detail.checklist_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-ds-bg-2 transition-colors"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <StatusIcon status={item.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: '#F7F8F8' }}>
                        {item.document_type_required}
                      </p>
                      {item.linked_document_name && (
                        <p className="text-xs truncate" style={{ color: '#959597' }}>
                          {item.linked_document_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {detail.checklist_items.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: '#6B6C6F' }}>Aucun document requis détecté</p>
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
            <div className="p-3.5">
              {detail.memoire_info ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-lg hover:bg-ds-bg-2 transition-colors">
                    <CheckCircle2 size={15} style={{ color: '#6EE7A8' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: '#F7F8F8' }}>
                        Mémoire technique v{detail.memoire_info.version}
                      </p>
                      <p className="text-xs" style={{ color: '#959597' }}>
                        {detail.memoire_info.estimated_pages} pages, {detail.memoire_info.sections_count} sections — généré le{' '}
                        {new Date(detail.memoire_info.generated_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/projects/${project.id}/memoire`)}
                      className="flex items-center gap-1 text-xs font-medium shrink-0 transition-colors"
                      style={{ color: '#E8E9EB' }}
                    >
                      <ExternalLink size={12} /> Voir
                    </button>
                  </div>
                  <p className="text-xs px-3" style={{ color: '#6B6C6F' }}>
                    Les documents de réponse seront inclus dans le ZIP.
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <AlertTriangle size={16} className="mx-auto mb-2" style={{ color: '#959597' }} />
                  <p className="text-xs" style={{ color: '#959597' }}>Le mémoire technique n&apos;a pas encore été généré.</p>
                  <button
                    onClick={() => navigate(`/projects/${project.id}/memoire`)}
                    className="glass-btn mt-2 text-xs font-semibold px-3.5 py-1.5 rounded-lg"
                    style={{ color: '#D8D9DB' }}
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
            <div className="p-3.5 space-y-3.5">
              {/* Download original DPGF */}
              {detail.dpgf_info && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: '#1E1E21' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet size={16} style={{ color: '#E8E9EB' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#F7F8F8' }}>{detail.dpgf_info.file_name}</p>
                      <p className="text-[11px]" style={{ color: '#959597' }}>DPGF originale du DCE</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadDpgf}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 hover:bg-ds-bg-2"
                    style={{ border: '1px solid rgba(255,255,255,.07)', color: '#C2C3C6' }}
                  >
                    <Download size={13} /> Télécharger
                  </button>
                </div>
              )}

              {/* Upload filled DPGF */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#F7F8F8' }}>
                  Déposer votre DPGF remplie
                </p>
                <div
                  className="relative rounded-xl p-4 text-center transition-all cursor-pointer"
                  style={{
                    border: `2px dashed ${dpgfDragging ? '#E8E9EB' : '#55565A'}`,
                    background: dpgfDragging ? 'rgba(255,255,255,0.04)' : '#121213',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDpgfDragging(true) }}
                  onDragLeave={() => setDpgfDragging(false)}
                  onDrop={onDpgfDrop}
                >
                  {dpgfUploading ? (
                    <Loader2 size={20} className="mx-auto animate-spin" style={{ color: '#E8E9EB' }} />
                  ) : (
                    <>
                      <Upload size={20} className="mx-auto mb-1.5" style={{ color: '#6B6C6F' }} />
                      <p className="text-xs" style={{ color: '#959597' }}>
                        Glissez votre DPGF remplie ici ou{' '}
                        <label className="cursor-pointer font-medium" style={{ color: '#E8E9EB' }}>
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
                      <p className="text-[10px] mt-0.5" style={{ color: '#6B6C6F' }}>XLSX, XLS, ODS, PDF</p>
                    </>
                  )}
                </div>
                {dpgfError && (
                  <p className="text-xs mt-1.5" style={{ color: '#F58E86' }}>{dpgfError}</p>
                )}
              </div>

              {/* Verification result */}
              {detail.dpgf_remplie?.verification && (() => {
                const v = detail.dpgf_remplie!.verification!
                const isValid = v.valid
                const hasWarnings = v.warnings.length > 0
                return (
                  <div
                    className="rounded-lg p-3.5"
                    style={{
                      background: isValid ? 'rgba(110,231,168,0.04)' : hasWarnings ? 'rgba(217,164,65,0.04)' : 'rgba(245,142,134,0.04)',
                      border: `1px solid ${isValid ? 'rgba(110,231,168,0.15)' : hasWarnings ? 'rgba(217,164,65,0.15)' : 'rgba(245,142,134,0.15)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isValid
                          ? <CheckCircle2 size={16} style={{ color: '#6EE7A8' }} />
                          : <AlertTriangle size={16} style={{ color: hasWarnings ? '#D9A441' : '#F58E86' }} />
                        }
                        <span
                          className="text-xs font-semibold"
                          style={{ color: isValid ? '#6EE7A8' : hasWarnings ? '#D9A441' : '#F58E86' }}
                        >
                          {isValid ? 'DPGF conforme' : hasWarnings ? 'DPGF avec avertissements' : 'DPGF non conforme'}
                        </span>
                      </div>
                      <span className="text-[11px]" style={{ color: '#6B6C6F' }}>
                        {detail.dpgf_remplie!.file_name}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center py-1.5 rounded-lg" style={{ background: '#1E1E21' }}>
                        <p className="text-sm font-bold" style={{ color: '#F7F8F8' }}>{v.nb_lignes}</p>
                        <p className="text-[10px]" style={{ color: '#6B6C6F' }}>lignes</p>
                      </div>
                      <div className="text-center py-1.5 rounded-lg" style={{ background: '#1E1E21' }}>
                        <p className="text-sm font-bold" style={{ color: '#E8E9EB' }}>{v.nb_lignes_remplies}</p>
                        <p className="text-[10px]" style={{ color: '#6B6C6F' }}>remplies</p>
                      </div>
                      <div className="text-center py-1.5 rounded-lg" style={{ background: '#1E1E21' }}>
                        <p className="text-sm font-bold" style={{ color: v.nb_lignes_vides > 0 ? '#F58E86' : '#E8E9EB' }}>{v.nb_lignes_vides}</p>
                        <p className="text-[10px]" style={{ color: '#6B6C6F' }}>vides</p>
                      </div>
                    </div>

                    {v.total_ht != null && (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg mb-2" style={{ background: '#1E1E21' }}>
                        <span className="text-xs" style={{ color: '#959597' }}>Total HT</span>
                        <span className="text-sm font-bold tabular-nums font-mono" style={{ color: '#F7F8F8' }}>
                          {v.total_ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    )}

                    {v.warnings.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {v.warnings.map((w, i) => (
                          <p key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: '#959597' }}>
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
                <p className="text-xs" style={{ color: '#6B6C6F' }}>
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
            <div className="p-3.5 space-y-3.5 max-h-[400px] overflow-y-auto">
              {Object.entries(complianceByCategory).map(([cat, items]) => {
                const covered = items.filter((i) => i.status === 'couvert').length
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#959597' }}>
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                      <span className="text-[11px] font-medium" style={{ color: covered === items.length ? '#E8E9EB' : '#959597' }}>
                        {covered}/{items.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-ds-bg-2 transition-colors">
                          <StatusIcon status={item.status} />
                          <span className="text-sm leading-relaxed flex-1" style={{ color: '#D8D9DB' }}>
                            {item.exigence_text}
                          </span>
                          {item.priority === 'obligatoire' && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-auto"
                              style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}
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
                <p className="text-xs text-center py-4" style={{ color: '#6B6C6F' }}>Aucune exigence extraite</p>
              )}
            </div>
          </AccordionSection>

          {/* 5. Contenu du ZIP — chaque pièce jointe, avec aperçu */}
          <AccordionSection
            title={`Pièces du dossier ZIP (${detail.project_documents.length})`}
            ok={detail.project_documents.length > 0}
            expanded={expanded === 'documents'}
            onToggle={() => toggle('documents')}
          >
            <div className="px-3 py-2 max-h-[360px] overflow-y-auto">
              {detail.project_documents.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setViewerIndex(i)}
                  className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-ds-bg-2 transition-colors text-left"
                >
                  <FileText size={15} className="shrink-0" style={{ color: '#959597' }} />
                  <span className="text-sm font-medium truncate flex-1" style={{ color: '#F7F8F8' }}>
                    {d.file_name}
                  </span>
                  <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: '#6B6C6F' }}>
                    <Eye size={12} /> Aperçu
                  </span>
                </button>
              ))}
              {detail.project_documents.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: '#6B6C6F' }}>
                  Aucune pièce jointe pour l&apos;instant
                </p>
              )}
            </div>
          </AccordionSection>
        </div>
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
