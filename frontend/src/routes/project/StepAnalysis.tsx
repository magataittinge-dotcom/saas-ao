import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Search, Calendar, MapPin, Clock,
  CheckCircle2, Sparkles, Info, Shield,
} from 'lucide-react'
import { api } from '@/services/api'
import LoadingProgress from '@/components/common/LoadingProgress'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ComplianceItem, ComplianceCategory, ProjectDocument } from '@/types'
import { useCompleteStep } from '@/hooks/useProject'

const F = "'DM Sans', sans-serif"

const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  candidature:       'Candidature',
  offre:             'Offre',
  technique:         'Technique',
  planning:          'Planning',
  criteres_notation: 'Critères de notation',
}

const CATEGORY_ORDER: ComplianceCategory[] = [
  'candidature', 'offre', 'technique', 'planning', 'criteres_notation',
]

interface Props { project: Project }
type FilterCategory = 'all' | ComplianceCategory

export default function StepAnalysis({ project }: Props) {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all')
  const [search, setSearch] = useState('')
  const { mutate: completeStep, isPending: isValidating } = useCompleteStep(project.id)

  // Charger les documents du projet pour l'ouverture de la source
  const { data: projectDocs = [] } = useQuery({
    queryKey: ['project-documents', project.id],
    queryFn: async () => {
      const { data } = await api.get<ProjectDocument[]>(`/projects/${project.id}/documents`)
      return data
    },
  })

  // Ouvrir le document source dans un nouvel onglet
  const openSourceDocument = (item: ComplianceItem) => {
    if (!item.source_document && !item.source_page) return

    const sourceDoc = (item.source_document || '').toLowerCase().trim()
    const sourceBase = sourceDoc.replace(/\s*p\.?\s*\d+/gi, '').trim()

    const matchedDoc = projectDocs.find(doc => {
      const docType = doc.type.toLowerCase()
      const docName = doc.file_name.toLowerCase()

      if (sourceBase === docType) return true
      if ((sourceBase === 'rc' || sourceBase === 'règlement de consultation' || sourceBase === 'reglement de consultation')
          && (docType === 'rc' || docName.includes('règlement') || docName.includes('reglement') || docName.includes('_rc') || docName.includes(' rc'))) return true
      if ((sourceBase === 'cctp') && (docType === 'cctp' || docName.includes('cctp'))) return true
      if ((sourceBase === 'ccap') && (docName.includes('ccap'))) return true
      if ((sourceBase === 'dpgf') && (docType === 'dpgf' || docName.includes('dpgf'))) return true
      if ((sourceBase === 'ae' || sourceBase === "acte d'engagement" || sourceBase === 'acte_engagement' || sourceBase === 'attri1' || sourceBase === 'attri')
          && (docType === 'acte_engagement' || docName.includes('engagement') || docName.includes('attri'))) return true
      if (sourceBase === 'dc1' && docName.includes('dc1')) return true
      if (sourceBase === 'dc2' && docName.includes('dc2')) return true
      if (sourceBase === 'bpu' && docName.includes('bpu')) return true
      if (sourceBase === 'cadre de réponse' && docName.includes('cadre')) return true
      if (sourceBase.length > 2 && docName.includes(sourceBase)) return true

      return false
    })

    const doc = matchedDoc || projectDocs[0]
    if (!doc) return

    const baseUrl = import.meta.env.PROD
      ? (import.meta.env.VITE_API_URL || '')
      : ''

    const fileUrlToUse = doc.pdf_preview_url || doc.file_url

    let relativePath = fileUrlToUse
    if (relativePath.startsWith('/uploads/')) {
      relativePath = relativePath.replace('/uploads/', '')
    } else if (relativePath.startsWith('http')) {
      window.open(relativePath, '_blank')
      return
    }

    const viewUrl = `${baseUrl}/api/files/view/${relativePath.split('/').map(s => encodeURIComponent(s)).join('/')}`
    const params = new URLSearchParams()

    if (item.source_page) {
      params.set('page', String(item.source_page))
    }
    if (item.source_excerpt) {
      params.set('highlight', item.source_excerpt)
    }

    const queryString = params.toString()
    const isPdf = fileUrlToUse.toLowerCase().endsWith('.pdf')

    let finalUrl = queryString ? `${viewUrl}?${queryString}` : viewUrl

    if (isPdf && item.source_page) {
      finalUrl += `#page=${item.source_page}`
    }

    window.open(finalUrl, '_blank')
  }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['compliance', project.id],
    queryFn: async () => {
      const { data } = await api.get<ComplianceItem[]>(`/projects/${project.id}/compliance`)
      return data
    },
    refetchInterval: (query) => (query.state.data?.length === 0 ? 3000 : false),
    refetchIntervalInBackground: false,
  })

  const counts = useMemo(() => {
    const map: Partial<Record<ComplianceCategory, number>> = {}
    for (const item of items) {
      map[item.category] = (map[item.category] ?? 0) + 1
    }
    return map
  }, [items])

  const filtered = useMemo(() => {
    let result = items
    if (activeFilter !== 'all') result = result.filter((i) => i.category === activeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.exigence_text.toLowerCase().includes(q) ||
          (i.source_document ?? '').toLowerCase().includes(q) ||
          (i.source_excerpt ?? '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, activeFilter, search])

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.reduce<Record<string, ComplianceItem[]>>((acc, cat) => {
        const catItems = filtered.filter((i) => i.category === cat)
        if (catItems.length > 0) acc[cat] = catItems
        return acc
      }, {}),
    [filtered],
  )

  const isStepAlreadyDone = project.completed_steps?.['3'] === true

  const handleValidate = () => {
    completeStep(3, {
      onSuccess: () => navigate(`/projects/${project.id}/candidature`),
    })
  }

  // Poll analysis progress when items are empty
  const { data: analysisProgress } = useQuery({
    queryKey: ['analysis-progress', project.id],
    queryFn: async () => {
      try {
        const { data } = await api.get<{
          total_docs: number
          analyzed_docs: number
          current_doc_name: string
          status: string
        }>(`/projects/${project.id}/analysis-progress`)
        return data
      } catch {
        return null
      }
    },
    enabled: !isLoading && items.length === 0,
    refetchInterval: 2000,
  })

  const analysisPercent = analysisProgress
    ? analysisProgress.total_docs > 0
      ? (analysisProgress.analyzed_docs / analysisProgress.total_docs) * 100
      : 10
    : 15

  // ── Lot filter computation ────────────────────────────────────
  const lotFilterInfo = useMemo(() => {
    if (!project.selected_lot || project.selected_lot === 'all') return null
    const lotNum = project.selected_lot.replace(/^lot/i, '').replace(/^0+/, '') || '0'
    const isIncluded = (doc: typeof projectDocs[0]) => {
      const tags = doc.related_lots
      if (!tags) return true
      if (tags.includes('all')) return true
      if (tags.every(t => t === 'info')) return false
      return tags.some(t => t !== 'info' && (t.replace(/^0+/, '') || '0') === lotNum)
    }
    return {
      included: projectDocs.filter(isIncluded),
      excluded: projectDocs.filter(d => !isIncluded(d)),
      lotLabel: project.selected_lot_name || `Lot ${lotNum}`,
    }
  }, [projectDocs, project.selected_lot, project.selected_lot_name])

  // ── Derived data for redesigned layout ────────────────────────
  const prixPct = useMemo(() => {
    const c = project.criteres_jugement?.find(cr => cr.nom.toLowerCase().includes('prix'))
    return c?.poids ?? 0
  }, [project.criteres_jugement])

  const techPct = useMemo(() => {
    if (!project.criteres_jugement) return 0
    return project.criteres_jugement
      .filter(c => !c.nom.toLowerCase().includes('prix'))
      .reduce((sum, c) => sum + c.poids, 0)
  }, [project.criteres_jugement])

  const obligatoireCount = useMemo(
    () => items.filter(i => i.priority === 'obligatoire').length,
    [items],
  )

  const [showLotDetails, setShowLotDetails] = useState(false)
  const lotTotal = lotFilterInfo ? lotFilterInfo.included.length + lotFilterInfo.excluded.length : 0

  // ── Loading states ────────────────────────────────────────────

  if (isLoading) return <RequirementListSkeleton count={5} />


  if (items.length === 0) return (
    <div
      className="bg-white rounded-xl p-12"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <LoadingProgress
        progress={analysisPercent}
        label="Analyse IA en cours..."
        sublabel={
          analysisProgress
            ? `Document ${analysisProgress.analyzed_docs}/${analysisProgress.total_docs} — ${analysisProgress.current_doc_name}`
            : "L'IA lit vos documents et extrait toutes les informations"
        }
        variant="analysis"
      />
    </div>
  )

  // ── Bottom bar (portalled) ────────────────────────────────────

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
      <div className="flex items-center gap-3 min-w-0">
        <CheckCircle2 size={20} className="shrink-0" style={{ color: '#0EA5E9' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#0F172A', fontFamily: F }}>
            Analyse complétée — {items.length} exigences identifiées
          </p>
          <p className="text-sm truncate" style={{ color: '#64748B', fontFamily: F }}>
            {obligatoireCount > 0
              ? `L'IA a identifié ${obligatoireCount} clauses obligatoires parmi ${items.length} exigences`
              : `${items.length} exigences extraites du dossier`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-slate-50"
          style={{ border: '1px solid #E2E8F0', color: '#475569', fontFamily: F }}
        >
          Générer Rapport PDF
        </button>
        <button
          onClick={handleValidate}
          disabled={isValidating}
          className="signature-btn"
          style={{ fontFamily: F }}
        >
          {isValidating
            ? <><Loader2 size={16} className="animate-spin" /> Validation...</>
            : isStepAlreadyDone
            ? <><CheckCircle2 size={16} /> Passer à la candidature</>
            : <><Sparkles size={16} /> Étape Suivante : Candidature</>}
        </button>
      </div>
    </div>
  )

  const infos = project.infos_marche

  // ── Main render ───────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-20" style={{ fontFamily: F }}>

      {/* ── LIGNE 1 : Title + AI badge | Doc count ──────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>
            Analyse du Dossier
          </h1>
          <span className="ai-badge">IA active</span>
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: '#64748B' }}>
          {lotFilterInfo ? (
            <>
              <span>
                <span className="font-semibold" style={{ color: '#0284C7' }}>{lotFilterInfo.included.length}</span>
                /{lotTotal} docs analysés
              </span>
              <button
                onClick={() => setShowLotDetails(v => !v)}
                className="font-medium hover:underline"
                style={{ color: '#0EA5E9' }}
              >
                {showLotDetails ? 'Masquer' : 'Détails'}
              </button>
            </>
          ) : (
            <span className="font-medium">{items.length} exigences</span>
          )}
        </div>
      </div>

      {/* ── Lot details (expanded inline) ───────────────────────── */}
      {showLotDetails && lotFilterInfo && (
        <div
          className="rounded-lg px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs -mt-2"
          style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}
        >
          {lotFilterInfo.included.map(doc => (
            <span key={doc.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0EA5E9' }} />
              <span style={{ color: '#334155' }}>{doc.file_name}</span>
            </span>
          ))}
          {lotFilterInfo.excluded.map(doc => (
            <span key={doc.id} className="flex items-center gap-1.5 opacity-40">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#94A3B8' }} />
              <span style={{ color: '#64748B' }}>{doc.file_name}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── CARTE RÉCAP ─────────────────────────────────────────── */}
      {infos && (
        <div
          className="bg-white rounded-xl p-5"
          style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          {/* ROW 1 : Objet du marché */}
          {infos.objet && (
            <p className="text-base font-semibold mb-3" style={{ color: '#1E293B' }}>
              {infos.objet}
            </p>
          )}

          {/* ROW 2 : Client/Architecte/Lot à gauche — Critères à droite */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-medium uppercase mb-0.5" style={{ color: '#94A3B8' }}>Client</p>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{infos.maitre_ouvrage || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase mb-0.5" style={{ color: '#94A3B8' }}>Architecte</p>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{infos.maitre_oeuvre || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase mb-0.5" style={{ color: '#94A3B8' }}>Lot</p>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{project.selected_lot_name || infos.lots?.join(', ') || '—'}</p>
              </div>
            </div>

            {(prixPct > 0 || techPct > 0) && (
              <div className="flex items-center gap-4 shrink-0">
                {prixPct > 0 && (
                  <div
                    className="rounded-lg px-3 py-2"
                    style={{ background: '#FFFFFF', border: '1px solid #F1F5F9' }}
                  >
                    <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Critère prix</p>
                    <p className="text-lg font-bold leading-none" style={{ color: '#F87171' }}>{prixPct}%</p>
                    <div className="mt-1.5 rounded-full overflow-hidden" style={{ width: 60, height: 4, background: '#FEE2E2' }}>
                      <div className="h-full rounded-full" style={{ width: `${prixPct}%`, background: '#F87171' }} />
                    </div>
                  </div>
                )}
                {techPct > 0 && (
                  <div
                    className="rounded-lg px-3 py-2"
                    style={{ background: '#FFFFFF', border: '1px solid #F1F5F9' }}
                  >
                    <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Critère technique</p>
                    <p className="text-lg font-bold leading-none" style={{ color: '#0EA5E9' }}>{techPct}%</p>
                    <div className="mt-1.5 rounded-full overflow-hidden" style={{ width: 60, height: 4, background: '#E0F2FE' }}>
                      <div className="h-full rounded-full" style={{ width: `${techPct}%`, background: '#0EA5E9' }} />
                    </div>
                  </div>
                )}
                {/* Conseil IA tooltip */}
                <div className="relative group">
                  <Info size={15} className="cursor-help" style={{ color: '#0EA5E9' }} />
                  <div
                    className="absolute right-0 top-full mt-1.5 z-10 bg-white rounded-lg p-3 w-56 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all pointer-events-none"
                    style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  >
                    <p className="text-xs italic" style={{ color: '#64748B' }}>
                      Soignez le mémoire technique ! Points de vigilance identifiés.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BARRE INFOS SECONDAIRES ─────────────────────────────── */}
      {infos && (infos.date_limite_reponse || infos.type_procedure || infos.visite_site || infos.duree_marche || infos.penalites_retard || infos.retenue_garantie_pct != null) && (() => {
        const isUrgent = (() => {
          if (!infos.date_limite_reponse) return false
          try {
            const d = new Date(infos.date_limite_reponse)
            return !isNaN(d.getTime()) && (d.getTime() - Date.now()) / 86400000 < 15
          } catch { return false }
        })()

        const infoItems: React.ReactNode[] = []

        if (infos.date_limite_reponse) {
          infoItems.push(
            <div key="deadline" className="flex items-start gap-2">
              <Calendar size={14} className="shrink-0 mt-0.5" style={{ color: isUrgent ? '#EF4444' : '#64748B' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Date limite de réponse</p>
                <p className="text-sm" style={{ color: isUrgent ? '#EF4444' : '#334155' }}>{infos.date_limite_reponse}</p>
              </div>
            </div>,
          )
        }

        if (infos.type_procedure) {
          infoItems.push(
            <div key="procedure" className="flex items-start gap-2">
              <Info size={14} className="shrink-0 mt-0.5" style={{ color: '#64748B' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Procédure</p>
                <p className="text-sm" style={{ color: '#334155' }}>{infos.type_procedure}</p>
              </div>
            </div>,
          )
        }

        if (infos.visite_site) {
          infoItems.push(
            <div key="visite" className="flex items-start gap-2">
              <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: infos.visite_site.obligatoire ? '#EF4444' : '#64748B' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>
                  Visite {infos.visite_site.obligatoire ? 'obligatoire' : 'facultative'}
                </p>
                <p className="text-sm" style={{ color: infos.visite_site.obligatoire ? '#EF4444' : '#334155' }}>
                  {infos.visite_site.details || (infos.visite_site.obligatoire ? 'Obligatoire' : 'Facultative')}
                </p>
              </div>
            </div>,
          )
        }

        if (infos.duree_marche) {
          infoItems.push(
            <div key="duree" className="flex items-start gap-2">
              <Clock size={14} className="shrink-0 mt-0.5" style={{ color: '#64748B' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Durée du marché</p>
                <p className="text-sm" style={{ color: '#334155' }}>{infos.duree_marche}</p>
              </div>
            </div>,
          )
        }

        if (infos.penalites_retard) {
          infoItems.push(
            <div key="penalites" className="flex items-start gap-2">
              <Shield size={14} className="shrink-0 mt-0.5" style={{ color: '#64748B' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Pénalités de retard</p>
                <p className="text-sm" style={{ color: '#334155' }}>{infos.penalites_retard}</p>
              </div>
            </div>,
          )
        }

        if (infos.retenue_garantie_pct != null) {
          infoItems.push(
            <div key="retenue" className="flex items-start gap-2">
              <Shield size={14} className="shrink-0 mt-0.5" style={{ color: '#64748B' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Retenue de garantie</p>
                <p className="text-sm" style={{ color: '#334155' }}>{infos.retenue_garantie_pct}%</p>
              </div>
            </div>,
          )
        }

        return (
          <div
            className="rounded-lg px-5 py-3 flex flex-wrap items-start gap-x-6 gap-y-2"
            style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}
          >
            {infoItems.map((item, i) => (
              <div key={i} className="flex items-start gap-x-6">
                {item}
                {i < infoItems.length - 1 && (
                  <div className="w-px self-stretch ml-6" style={{ background: '#CBD5E1', minHeight: 24 }} />
                )}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── SEARCH BAR ──────────────────────────────────────────── */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une clause ou une exigence..."
          className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', color: '#0F172A', fontFamily: F }}
        />
        <Sparkles size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#0EA5E9' }} />
      </div>

      {/* ── ONGLETS ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 pb-px" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <TabButton
          label={`Tout (${items.length})`}
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
        />
        {CATEGORY_ORDER.filter(cat => counts[cat]).map(cat => (
          <TabButton
            key={cat}
            label={`${CATEGORY_LABELS[cat]} (${counts[cat]})`}
            active={activeFilter === cat}
            onClick={() => setActiveFilter(cat)}
          />
        ))}
      </div>

      {/* ── Exigences ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm py-12" style={{ color: '#94A3B8', fontFamily: F }}>
          Aucune exigence trouvée
        </p>
      ) : (
        <div className={activeFilter === 'all' ? 'grid grid-cols-1 lg:grid-cols-2 gap-5' : 'space-y-5'}>
          {Object.entries(grouped).map(([cat, catItems]) => (
            <ExigenceColumn
              key={cat}
              category={cat as ComplianceCategory}
              items={catItems}
              onOpenSource={openSourceDocument}
            />
          ))}
        </div>
      )}

      {/* ── Sticky bottom bar ───────────────────────────────────── */}
      {createPortal(bottomBar, document.body)}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Helper Components
// ═════════════════════════════════════════════════════════════════════════════

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm transition-colors relative whitespace-nowrap ${active ? 'font-semibold' : 'font-medium'}`}
      style={{ color: active ? '#0EA5E9' : '#64748B', fontFamily: F }}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#0EA5E9' }} />
      )}
    </button>
  )
}

// ─── Exigence Column ─────────────────────────────────────────────────────────

function ExigenceColumn({
  category,
  items,
  onOpenSource,
}: {
  category: ComplianceCategory
  items: ComplianceItem[]
  onOpenSource: (item: ComplianceItem) => void
}) {
  return (
    <div
      className="bg-white rounded-xl p-5"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold" style={{ color: '#0F172A', fontFamily: F }}>
          {CATEGORY_LABELS[category]} ({items.length})
        </h3>
        <span className="text-xs font-medium" style={{ color: '#0EA5E9' }}>
          Voir tout
        </span>
      </div>

      <div>
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="flex items-start gap-3 py-3"
            style={idx < items.length - 1 ? { borderBottom: '1px solid #F8FAFC' } : undefined}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-2" style={{ background: '#0EA5E9' }} />

            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed" style={{ color: '#334155' }}>
                {item.exigence_text}
              </p>
              {item.source_excerpt && (
                <p className="text-xs mt-0.5 italic truncate" style={{ color: '#94A3B8' }}>
                  «{item.source_excerpt}»
                </p>
              )}
              {item.suggestion_ia && (
                <p className="text-xs mt-0.5 italic" style={{ color: '#0284C7' }}>
                  💡 {item.suggestion_ia}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {item.source_document && (
                <button
                  onClick={() => onOpenSource(item)}
                  className="px-2 py-0.5 rounded-md text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ background: '#F0F9FF', color: '#0284C7' }}
                  title={`Voir dans ${item.source_document}${item.source_page ? ` p.${item.source_page}` : ''}`}
                >
                  {item.source_document}
                  {item.source_page ? ` p.${item.source_page}` : ''}
                </button>
              )}
              {item.priority === 'obligatoire' ? (
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{ background: '#FEF2F2', color: '#EF4444' }}
                >
                  Obligatoire
                </span>
              ) : (
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{ background: 'rgba(100,116,139,0.08)', color: '#475569' }}
                >
                  Souhaitée
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
