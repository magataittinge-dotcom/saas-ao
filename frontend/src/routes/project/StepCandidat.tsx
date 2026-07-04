import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock, AlertTriangle } from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import CandidatureSectionVault from '@/components/project/CandidatureSectionVault'
import CandidatureSectionTemplates from '@/components/project/CandidatureSectionTemplates'
import VaultPickerModal from '@/components/project/VaultPickerModal'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ChecklistItem, Document } from '@/types'

const F = "'DM Sans', sans-serif"

interface Props { project: Project }

export default function StepCandidat({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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

  const { vaultItems, templateItems } = useMemo(() => {
    const vault: ChecklistItem[] = []
    const tpl: ChecklistItem[] = []
    for (const item of items) {
      if (item.source_kind === 'dce_template') tpl.push(item)
      else vault.push(item)
    }
    return { vaultItems: vault, templateItems: tpl }
  }, [items])

  const present = items.filter((i) => i.status === 'present').length
  const missing = items.filter((i) => i.status === 'manquant').length
  const total = items.length
  const pct = total > 0 ? Math.round((present / total) * 100) : 0

  // ── Mutations ───────────────────────────────────────────────────
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['checklist', project.id] })

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

  // ── Loading / empty ─────────────────────────────────────────────

  if (isLoading) return (
    <div style={{ fontFamily: F }}>
      <RequirementListSkeleton count={5} />
    </div>
  )

  if (items.length === 0) return (
    <div
      className="bg-white rounded-lg p-12 text-center"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      <p className="text-sm" style={{ color: '#94A3B8' }}>
        Aucun document requis détecté dans le DCE
      </p>
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
          onClick={() => navigate('/vault')}
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
        onOpenVault={() => navigate('/vault')}
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

      {pickerItem && (
        <VaultPickerModal
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onLink={handleLinkVaultDoc}
        />
      )}

      {createPortal(bottomBar, document.body)}
    </div>
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
