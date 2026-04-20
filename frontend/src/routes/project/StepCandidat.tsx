import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Clock, Upload, Eye,
  ChevronDown, ChevronRight, AlertTriangle,
  Loader2, Lock,
} from 'lucide-react'
import { api } from '@/services/api'
import { useCompleteStep } from '@/hooks/useProject'
import type { Project, ChecklistItem } from '@/types'

const F = "'DM Sans', sans-serif"

// ─── Category helpers ────────────────────────────────────────────────────────

type DocCategory = 'administratif' | 'assurances' | 'financier' | 'technique'

const CATEGORY_ORDER: DocCategory[] = ['administratif', 'assurances', 'financier', 'technique']

const CATEGORY_LABELS: Record<DocCategory, string> = {
  administratif: 'PIÈCES ADMINISTRATIVES',
  assurances:    'ASSURANCES',
  financier:     'CAPACITÉS FINANCIÈRES',
  technique:     'CAPACITÉS TECHNIQUES',
}

function categorizeDoc(item: ChecklistItem): DocCategory {
  const text = `${item.document_type_required} ${item.details || ''}`.toLowerCase()
  if (/assurance|décennale|decennale|rc[_ ]?(civile|professionnelle)|rc_civile/.test(text))
    return 'assurances'
  if (/chiffre|ca\b|bilan|financ|effectif/.test(text))
    return 'financier'
  if (/qualibat|certificat|référence|reference|qualification|technique|caces|amiante|compétence/.test(text))
    return 'technique'
  return 'administratif'
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepCandidat({ project }: Props) {
  const navigate = useNavigate()
  const completeStep = useCompleteStep(project.id)
  const isAlreadyDone = project.completed_steps?.['4'] === true

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist', project.id],
    queryFn: async () => {
      const { data } = await api.get<ChecklistItem[]>(`/projects/${project.id}/checklist`)
      return data
    },
  })

  const present = items.filter((i) => i.status === 'present').length
  const missing = items.filter((i) => i.status === 'manquant')
  const total   = items.length
  const pct     = total > 0 ? Math.round((present / total) * 100) : 0

  const [expandedCats, setExpandedCats] = useState<Set<DocCategory>>(
    new Set(CATEGORY_ORDER),
  )

  const grouped = useMemo(() => {
    const map: Record<DocCategory, ChecklistItem[]> = {
      administratif: [], assurances: [], financier: [], technique: [],
    }
    for (const item of items) {
      map[categorizeDoc(item)].push(item)
    }
    return map
  }, [items])

  const toggleCat = (cat: DocCategory) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  // ── Loading / empty ─────────────────────────────────────────────

  if (isLoading) return (
    <div
      className="bg-white rounded-xl p-12 flex flex-col items-center gap-3"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <Loader2 size={32} className="animate-spin" style={{ color: '#0EA5E9' }} />
      <p className="font-medium" style={{ color: '#0F172A', fontFamily: F }}>
        Chargement de la checklist...
      </p>
    </div>
  )

  if (items.length === 0) return (
    <div
      className="bg-white rounded-xl p-12 text-center"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <p className="text-sm" style={{ color: '#94A3B8', fontFamily: F }}>
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
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>
          Complétion dossier
        </span>
        <div className="rounded-full overflow-hidden" style={{ width: 120, height: 6, background: '#F1F5F9' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: '#0EA5E9' }}
          />
        </div>
        <span className="text-sm font-bold" style={{ color: '#0EA5E9', fontFamily: F }}>{pct}%</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-slate-50"
          style={{ color: '#64748B', fontFamily: F }}
        >
          Sauvegarder le brouillon
        </button>
        <button
          onClick={() =>
            isAlreadyDone
              ? navigate(`/projects/${project.id}/memoire`)
              : completeStep.mutate(4, {
                  onSuccess: () => navigate(`/projects/${project.id}/memoire`),
                })
          }
          disabled={completeStep.isPending}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-colors"
          style={{ background: '#0EA5E9', fontFamily: F }}
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
    <div className="space-y-4 pb-20" style={{ fontFamily: F }}>

      {/* ── Title bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black">
          <span style={{ color: '#0F172A' }}>VÉRIFICATION </span>
          <span style={{ color: '#0EA5E9' }}>CANDIDATURE</span>
        </h1>
        <button
          onClick={() => navigate('/vault')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-sky-50"
          style={{ border: '1px solid #0EA5E9', color: '#0EA5E9' }}
        >
          <Lock size={14} />
          Accéder au Coffre-fort
        </button>
      </div>

      {/* ── 2-column layout ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-6 items-start">

        {/* LEFT COLUMN — Summary */}
        <div className="space-y-5">

          {/* Donut chart card */}
          <div
            className="bg-white rounded-xl p-6 flex flex-col items-center"
            style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <DonutChart present={present} total={total} />
            <p className="text-sm mt-4 text-center leading-relaxed" style={{ color: '#64748B' }}>
              L&apos;analyse intelligente Synorix a détecté{' '}
              <strong style={{ color: '#334155' }}>{total}</strong> documents
              obligatoires d&apos;après le Règlement de Consultation (RC).
            </p>
          </div>

          {/* Critical alert */}
          {missing.length > 0 && (
            <div
              className="bg-white rounded-xl p-5"
              style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} style={{ color: '#EF4444' }} />
                <span className="text-base font-bold" style={{ color: '#0F172A' }}>
                  Alerte Critique
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>
                <strong>{missing.length}</strong> document{missing.length > 1 ? 's' : ''} manquant{missing.length > 1 ? 's' : ''} —
                si vous validez cet envoi, votre candidature sera automatiquement{' '}
                <span className="underline">rejetée</span> par l&apos;acheteur.
              </p>
              <button className="mt-3 text-sm font-medium" style={{ color: '#0EA5E9' }}>
                Compléter maintenant
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — Documents by category */}
        <div className="space-y-4">
          {CATEGORY_ORDER.filter(cat => grouped[cat].length > 0).map(cat => {
            const catItems = grouped[cat]
            const isOpen = expandedCats.has(cat)
            return (
              <div
                key={cat}
                className="bg-white rounded-xl overflow-hidden"
                style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                {/* Category header */}
                <button
                  onClick={() => toggleCat(cat)}
                  className="w-full flex items-center justify-between px-5 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#94A3B8' }}>
                      {catItems.length} Doc{catItems.length > 1 ? 's' : ''}
                    </span>
                    {isOpen
                      ? <ChevronDown size={16} style={{ color: '#94A3B8' }} />
                      : <ChevronRight size={16} style={{ color: '#94A3B8' }} />}
                  </div>
                </button>

                {/* Category items */}
                {isOpen && (
                  <div className="px-5 pb-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                    {catItems.map(item => (
                      <DocRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Sticky bottom bar ───────────────────────────────────── */}
      {createPortal(bottomBar, document.body)}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Helper Components
// ═════════════════════════════════════════════════════════════════════════════

function DonutChart({ present, total }: { present: number; total: number }) {
  const pct = total > 0 ? present / total : 0
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)

  return (
    <div className="relative flex items-center justify-center" style={{ width: 150, height: 150 }}>
      <svg viewBox="0 0 140 140" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke="#0EA5E9" strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold" style={{ color: '#0F172A', fontFamily: "'DM Sans', sans-serif" }}>
          {present}/{total}
        </span>
        <span className="text-xs" style={{ color: '#64748B' }}>Fournis</span>
      </div>
    </div>
  )
}

function DocRow({ item }: { item: ChecklistItem }) {
  const statusIcon =
    item.status === 'present'
      ? <CheckCircle2 size={18} style={{ color: '#10B981' }} />
      : item.status === 'manquant'
      ? <XCircle size={18} style={{ color: '#EF4444' }} />
      : <Clock size={18} style={{ color: '#F59E0B' }} />

  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid #F8FAFC' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0">{statusIcon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: '#1E293B' }}>
            {item.details || item.document_type_required}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.source_in_rc && (
              <span className="text-xs" style={{ color: '#94A3B8' }}>{item.source_in_rc}</span>
            )}
            {item.linked_document_id && (
              <span className="text-xs font-medium" style={{ color: '#0EA5E9' }}>Coffre-fort</span>
            )}
          </div>
        </div>
      </div>

      {item.status === 'present' ? (
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors hover:bg-slate-50"
          style={{ border: '1px solid #E2E8F0', color: '#64748B' }}
        >
          <Eye size={13} />
          Voir
        </button>
      ) : (
        <button
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white shrink-0 transition-colors hover:opacity-90"
          style={{ background: '#0F172A' }}
        >
          <Upload size={13} />
          {item.status === 'expire' ? 'Mettre à jour' : 'Uploader'}
        </button>
      )}
    </div>
  )
}
