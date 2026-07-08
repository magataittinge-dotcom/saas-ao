import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Lock, AlertTriangle, FileSpreadsheet, Download, Upload, Sparkles } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import VaultPickerModal from '@/components/project/VaultPickerModal'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ChecklistItem, Document } from '@/types'

const F = "'DM Sans', sans-serif"

interface Props { project: Project }

export default function StepVerification({ project }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  // Ouvre le coffre-fort en conservant le chemin de retour vers CETTE étape.
  const openVaultPage = () =>
    navigate(`/vault?returnTo=${encodeURIComponent(location.pathname)}`)
  const completeStep = useCompleteStep(project.id)
  const isAlreadyDone = project.completed_steps?.['4'] === true

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist', project.id],
    queryFn: async () => {
      const { data } = await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)
      return data
    },
  })

  // C10 — score de conformité (les ⚠️ ne comptent pas conformes)
  const { data: score } = useQuery<{ conformes: number; total: number }>({
    queryKey: ['checklist-score', project.id, items],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${project.id}/checklist/score`)
      return data
    },
    enabled: items.length > 0,
  })

  const [pickerItem, setPickerItem] = useState<ChecklistItem | null>(null)

  // Typologie 4 groupes (document_group) : à fournir / à compléter / produit
  // par Synorix / workflow dédié. Le score ne compte que fournir + completer.
  const groups = useMemo(() => {
    const g: Record<'fournir' | 'completer' | 'synorix' | 'workflow', ChecklistItem[]> = {
      fournir: [], completer: [], synorix: [], workflow: [],
    }
    for (const item of items) {
      const key = (item.document_group as keyof typeof g) in g ? (item.document_group as keyof typeof g) : 'fournir'
      g[key].push(item)
    }
    return g
  }, [items])

  const vaultItems = groups.fournir
  const templateItems = groups.completer

  // Complétion = pièces sous responsabilité de l'entreprise (fournir + completer).
  const scored = [...vaultItems, ...templateItems]
  const present = scored.filter((i) => i.status === 'present').length
  const missing = scored.filter((i) => i.status === 'manquant').length
  const total = scored.length
  const pct = total > 0 ? Math.round((present / total) * 100) : 0

  // ── Mutations ───────────────────────────────────────────────────
  // Rafraîchit la liste ET recalcule le score, sans quitter l'étape.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['checklist', project.id] })
    queryClient.invalidateQueries({ queryKey: ['checklist-score', project.id] })
  }

  const handleUploadCompleted = async (item: ChecklistItem, file: File) => {
    const form = new FormData()
    form.append('file', file)
    await api.post(
      `/projects/${project.id}/checklist/${item.id}/upload-completed`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    await refresh()
  }

  const handleLinkVaultDoc = async (doc: Document) => {
    if (!pickerItem) return
    await api.put(
      `/projects/${project.id}/checklist/${pickerItem.id}/link`,
      { document_id: doc.id },
    )
    await refresh()
  }

  // « Choisir » → téléverser un NOUVEAU fichier pour cette pièce : on l'ajoute
  // au coffre-fort (avec le type de la pièce) puis on le rattache à l'exigence.
  const handleUploadNewVaultDoc = async (file: File) => {
    if (!pickerItem) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', pickerItem.document_type_required || 'autre')
    const { data: doc } = await api.post<Document>('/documents', fd)
    await api.put(
      `/projects/${project.id}/checklist/${pickerItem.id}/link`,
      { document_id: doc.id },
    )
    await refresh()
  }

  // ── Workflow DPGF/BPU (C12) — SUR la pièce, pas de saut vers Export ──
  const DPGF_FILENAME: Record<string, string> = {
    dpgf_template: 'DPGF.xlsx', bpu_template: 'BPU.xlsx', dqe_template: 'DQE.xlsx',
  }
  const handleDownloadTemplate = async (item: ChecklistItem) => {
    if (!item.template_project_doc_id) return
    const res = await api.get(
      `/projects/${project.id}/documents/${item.template_project_doc_id}/download`,
      { responseType: 'blob' },
    )
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = DPGF_FILENAME[item.document_type_required] || 'bordereau.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  }
  // Ré-import de la version remplie → contrôle formel dpgf_checker → ✓/⚠️.
  const handleUploadDpgf = async (item: ChecklistItem, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    await api.post(`/projects/${project.id}/checklist/${item.id}/upload-completed`, fd)
    await refresh()
  }

  // ── Loading / empty ─────────────────────────────────────────────

  if (isLoading) return (
    <div style={{ fontFamily: F }}>
      <RequirementListSkeleton count={5} />
    </div>
  )

  if (items.length === 0) return (
    <div
      className="bg-white rounded-lg p-12 text-center space-y-4"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      <p className="text-sm" style={{ color: '#94A3B8' }}>
        La checklist des pièces n'a pas encore été générée pour ce projet.
      </p>
      {/* Régénération gratuite (matching déterministe) depuis les exigences
          déjà analysées — répare aussi les projets d'avant le multi-lots. */}
      <button
        onClick={async () => {
          await api.post(`/projects/${project.id}/checklist/regenerate`)
          queryClient.invalidateQueries({ queryKey: ['checklist', project.id] })
        }}
        className="btn-primary py-2 px-5 text-sm"
      >
        Générer la checklist des pièces
      </button>
    </div>
  )

  // ── Bottom bar ──────────────────────────────────────────────────

  const bottomBar = (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 gap-4"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid #F1F5F9',
        fontFamily: F,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>
          Complétion dossier
        </span>
        <div className="rounded-full overflow-hidden" style={{ width: 120, height: 6, background: '#F1F5F9' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: '#0EA5E9' }}
          />
        </div>
        <span className="text-sm font-bold" style={{ color: '#0EA5E9' }}>{pct}%</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-slate-50"
          style={{ color: '#64748B' }}
        >
          Sauvegarder le brouillon
        </button>
        <button
          type="button"
          onClick={() =>
            isAlreadyDone
              ? navigate(`/projects/${project.id}/memoire`)
              : completeStep.mutate(4, {
                  onSuccess: () => navigate(`/projects/${project.id}/memoire`),
                })
          }
          disabled={completeStep.isPending}
          className="signature-btn"
        >
          {completeStep.isPending
            ? <><Loader2 size={16} className="animate-spin" /> Validation...</>
            : isAlreadyDone
            ? <>Aller au mémoire →</>
            : <>Suivant &gt;</>}
        </button>
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-20" style={{ fontFamily: F }}>

      {/* Title bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black">
          <span style={{ color: '#0F172A' }}>VÉRIFICATION </span>
          <span style={{ color: '#0EA5E9' }}>CANDIDATURE</span>
        </h1>
        <button
          type="button"
          onClick={openVaultPage}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-sky-50"
          style={{ border: '1px solid #0EA5E9', color: '#0EA5E9' }}
        >
          <Lock size={14} />
          Accéder au coffre-fort
        </button>
      </div>

      {/* 3-metric header — score de conformité C10 en tête */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Pièces conformes"
          value={score ? `${score.conformes} / ${score.total}` : '— / —'}
          tone="primary"
        />
        <Stat
          label="Pièces du coffre-fort"
          value={`${vaultItems.filter((i) => i.status === 'present').length} / ${vaultItems.length}`}
          tone="neutral"
        />
        <Stat
          label="Formulaires DCE complétés"
          value={`${templateItems.filter((i) => i.status === 'present').length} / ${templateItems.length}`}
          tone="neutral"
        />
      </div>

      {missing > 0 && (
        <div
          className="bg-white rounded-lg px-5 py-4 flex items-start gap-3"
          style={{ border: '1px solid #FEE2E2', background: '#FEF2F2' }}
        >
          <AlertTriangle size={18} style={{ color: '#EF4444' }} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>
              {missing} pièce{missing > 1 ? 's' : ''} manquante{missing > 1 ? 's' : ''}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#7F1D1D' }}>
              Une candidature incomplète sera automatiquement rejetée par l&apos;acheteur.
              Complétez chaque ligne avant validation.
            </p>
          </div>
        </div>
      )}

      <CandidatureSectionVault
        items={vaultItems}
        onPickFromVault={(item) => setPickerItem(item)}
        onOpenVault={openVaultPage}
      />

      <CandidatureSectionTemplates
        projectId={project.id}
        items={templateItems}
        onUploadCompleted={handleUploadCompleted}
        onToggleSignature={async (item, confirmed) => {
          await api.patch(`/projects/${project.id}/checklist/${item.id}`, {
            signature_confirmed: confirmed,
          })
          await refresh()
          queryClient.invalidateQueries({ queryKey: ['checklist-score', project.id] })
        }}
      />

      <WorkflowSection
        items={groups.workflow}
        onDownload={handleDownloadTemplate}
        onUpload={handleUploadDpgf}
      />

      <SynorixJalonSection items={groups.synorix} />

      {pickerItem && (
        <VaultPickerModal
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onLink={handleLinkVaultDoc}
          onUploadNew={handleUploadNewVaultDoc}
        />
      )}

      {createPortal(bottomBar, document.body)}
    </div>
  )
}

// ── Workflow dédié (DPGF/BPU) — download → remplir → re-import SUR la pièce ────
// C12 : télécharger la trame du DCE, remplir hors ligne, ré-importer → contrôle
// formel dpgf_checker → ✓/⚠️. Tout se passe ICI, aucun saut vers Export.
function WorkflowSection({
  items, onDownload, onUpload,
}: {
  items: ChecklistItem[]
  onDownload: (item: ChecklistItem) => Promise<void>
  onUpload: (item: ChecklistItem, file: File) => Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <section
      className="bg-white rounded-lg overflow-hidden"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      <header className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FEF3C7' }}>
          <FileSpreadsheet size={18} style={{ color: '#D97706' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Bordereaux de prix (DPGF / BPU)</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            Téléchargez la trame, remplissez-la puis ré-importez-la — contrôle automatique des lignes.
          </p>
        </div>
      </header>
      <ul>
        {items.map((i) => (
          <WorkflowRow key={i.id} item={i} onDownload={onDownload} onUpload={onUpload} />
        ))}
      </ul>
    </section>
  )
}

function WorkflowRow({
  item, onDownload, onUpload,
}: {
  item: ChecklistItem
  onDownload: (item: ChecklistItem) => Promise<void>
  onUpload: (item: ChecklistItem, file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'dl' | 'up' | null>(null)
  const done = item.status === 'present'
  const warn = item.status === 'warning'

  const run = async (kind: 'dl' | 'up', fn: () => Promise<void>) => {
    setBusy(kind)
    try { await fn() } finally { setBusy(null) }
  }

  return (
    <li className="flex items-center gap-3 px-6 py-3 flex-wrap" style={{ borderTop: '1px solid #F8FAFC' }}>
      <FileSpreadsheet size={15} style={{ color: '#D97706' }} className="shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm" style={{ color: '#334155' }}>{item.details}</p>
        <span className="text-xs" style={{ color: done ? '#16A34A' : warn ? '#B45309' : '#94A3B8' }}>
          {done ? '✓ Rempli et vérifié' : warn ? '⚠️ À corriger (lignes sans prix)' : 'À remplir'}
        </span>
      </div>
      {item.lot && (
        <span className="text-[11px] px-1.5 rounded-full shrink-0" style={{ background: 'rgba(14,165,233,0.08)', color: '#0284C7' }}>
          {item.lot.replace(/^lot/i, 'Lot ')}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm,.ods,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) run('up', () => onUpload(item, f))
          e.target.value = ''
        }}
      />
      {item.template_project_doc_id && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('dl', () => onDownload(item))}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-amber-50 disabled:opacity-60"
          style={{ border: '1px solid #E2E8F0', color: '#64748B' }}
        >
          {busy === 'dl' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Télécharger la trame
        </button>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: '#D97706' }}
      >
        {busy === 'up' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {done || warn ? 'Remplacer' : 'Importer remplie'}
      </button>
    </li>
  )
}

// ── Produit par Synorix (mémoire technique) — jalon informatif, jamais upload ─
function SynorixJalonSection({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null
  return (
    <section
      className="bg-white rounded-lg overflow-hidden"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      <header className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F0F9FF' }}>
          <Sparkles size={18} style={{ color: '#0EA5E9' }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Généré par Synorix</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            Produit automatiquement à l&apos;étape suivante — aucune pièce à fournir ici.
          </p>
        </div>
      </header>
      <ul>
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-6 py-3" style={{ borderTop: '1px solid #F8FAFC' }}>
            <Sparkles size={15} style={{ color: '#0EA5E9' }} className="shrink-0" />
            <span className="text-sm flex-1 min-w-0" style={{ color: '#334155' }}>{i.details}</span>
            {i.lot && (
              <span className="text-[11px] px-1.5 rounded-full shrink-0" style={{ background: 'rgba(14,165,233,0.08)', color: '#0284C7' }}>
                {i.lot.replace(/^lot/i, 'Lot ')}
              </span>
            )}
            <span className="text-xs shrink-0" style={{ color: '#94A3B8' }}>Étape Mémoire</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Stat({
  label, value, tone,
}: {
  label: string
  value: string
  tone: 'primary' | 'neutral'
}) {
  const accent = tone === 'primary' ? '#0EA5E9' : '#475569'
  return (
    <div
      className="bg-white rounded-lg px-5 py-4"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
        {label}
      </p>
      <p className="text-2xl font-black mt-1" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}
