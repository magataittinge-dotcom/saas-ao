import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Search, FileText,
  CheckCircle2, Sparkles,
} from 'lucide-react'
import { api, getSignedFileUrl } from '@/services/api'
import CriticalBanner, { type FieldSource } from '@/components/project/CriticalBanner'
import TresorerieCard from '@/components/project/TresorerieCard'
import RetroPlanning from '@/components/project/RetroPlanning'
import PdfSourceViewer from '@/components/project/PdfSourceViewer'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ComplianceItem, ComplianceCategory, ProjectDocument } from '@/types'
import { useCompleteStep } from '@/hooks/useProject'

const ANALYSIS_STEPS: StepDescriptor[] = [
  { key: 'preparation',     label: 'Lecture des documents',                 estimated_s: 2 },
  { key: 'analyzing_pass1', label: 'Analyse des exigences administratives', estimated_s: 50 },
  { key: 'analyzing_pass2', label: 'Analyse des exigences techniques',      estimated_s: 50 },
  { key: 'finalizing',      label: 'Finalisation',                          estimated_s: 5 },
]

const F = "'Inter Variable', 'Geist Sans', sans-serif"

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
  const queryClient = useQueryClient()
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

  // C6 — viewer PDF intégré (page + excerpt surligné verbatim côté serveur)
  const [viewer, setViewer] = useState<{ url: string; name: string; page: number } | null>(null)

  const openInViewer = async (
    fileUrl: string, fileName: string, page: number | null, excerpt: string | null,
  ) => {
    if (fileUrl.startsWith('http')) {
      window.open(fileUrl, '_blank')
      return
    }
    try {
      const signed = await getSignedFileUrl(fileUrl)
      const url = new URL(signed, window.location.origin)
      if (page) url.searchParams.set('page', String(page))
      if (excerpt) url.searchParams.set('highlight', excerpt.slice(0, 300))
      if (fileUrl.toLowerCase().endsWith('.pdf')) {
        setViewer({ url: url.toString(), name: fileName, page: page ?? 1 })
      } else {
        window.open(url.toString(), '_blank')  // non-PDF : téléchargement
      }
    } catch (err) {
      console.error('[StepAnalysis] source inaccessible:', err)
    }
  }

  // C5 — ouvrir la source exacte d'un champ du bandeau critique
  const openFieldSource = async (src: FieldSource) => {
    const doc = projectDocs.find(d => d.file_name === src.document)
    if (!doc) return
    await openInViewer(
      doc.pdf_preview_url || doc.file_url, doc.file_name, src.page, src.excerpt,
    )
  }

  // Ouvrir le document source dans un nouvel onglet
  const openSourceDocument = async (item: ComplianceItem) => {
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

    // C6 — ouverture dans le viewer intégré (excerpt entier surligné)
    await openInViewer(
      doc.pdf_preview_url || doc.file_url, doc.file_name,
      item.source_page ?? null, item.source_excerpt ?? null,
    )
  }

  // Multi-lots : lots analysés disponibles + lot affiché (défaut : lot sélectionné)
  const [viewLot, setViewLot] = useState<string | null>(null)
  const { data: analyzedLots = [] } = useQuery({
    queryKey: ['compliance-lots', project.id],
    queryFn: async () => {
      const { data } = await api.get<{ lots: string[] }>(`/projects/${project.id}/compliance/lots`)
      return data.lots
    },
  })
  const activeLot = viewLot ?? project.selected_lot ?? analyzedLots[0] ?? null

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['compliance', project.id, activeLot],
    queryFn: async () => {
      const { data } = await api.get<ComplianceItem[]>(
        `/projects/${project.id}/compliance${activeLot ? `?lot=${encodeURIComponent(activeLot)}` : ''}`)
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
      onSuccess: () => navigate(`/projects/${project.id}/verification`),
    })
  }

  // Real-time analysis progress via SSE. Replaces the legacy poll on a
  // dead /analysis-progress endpoint (which was always returning 404 and
  // freezing the bar at 15 %).
  // Le run est détaché : pendant qu'il tourne (processing_status='analyzing'),
  // on RESTE sur l'écran de progression même si la passe 1 a déjà persisté
  // des exigences (fil de l'eau) — sinon la barre « sautait aux résultats »
  // à ~50 % et la 2e passe devenait invisible.
  const analysisRunning = project.processing_status === 'analyzing'
  const analysisSse = useProgressStream(project.id, {
    enabled: !isLoading && (items.length === 0 || analysisRunning),
    onComplete: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
  })

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

  // Échec du run détaché : statut erreur EXPLICITE + relance — jamais de
  // régression d'étape ni d'attente infinie.
  const analysisFailed =
    analysisSse.phase === 'error' || project.processing_status === 'error'

  if (items.length === 0 && analysisFailed) return (
    <div className="max-w-lg mx-auto glass-card p-8 text-center space-y-4 animate-fade-in">
      <p className="text-base font-semibold text-ds-text">L'analyse a échoué</p>
      <p className="text-sm text-ds-text-2">
        {project.processing_detail || analysisSse.detail
          || "Une erreur est survenue pendant l'analyse. Relancez-la."}
      </p>
      <button
        onClick={async () => {
          await api.post(`/projects/${project.id}/analyze`, {}, { timeout: 60_000 })
          window.location.reload()
        }}
        className="btn-primary py-2 px-5"
      >
        Relancer l'analyse
      </button>
    </div>
  )

  if (items.length === 0 || (analysisRunning && analysisSse.phase !== 'complete')) return (
    <ProgressDisplay
      variant="modal"
      title="Analyse du DCE par l'IA"
      steps={ANALYSIS_STEPS}
      currentStep={analysisSse.step}
      progress={analysisSse.progress}
      detail={analysisSse.detail || "L'IA lit vos documents et extrait les exigences"}
      phase={analysisSse.phase}
    />
  )

  // ── Bottom bar (portalled) ────────────────────────────────────

  const bottomBar = (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 gap-4"
      style={{
        background: 'rgba(9,9,10,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,.07)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <CheckCircle2 size={16} className="shrink-0" style={{ color: '#E8E9EB' }} />
        <p className="num-mono truncate text-xs" style={{ color: '#959597', fontFamily: F }}>
          {items.length} exigences · {obligatoireCount} obligatoires
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleValidate}
          disabled={isValidating}
          className="signature-btn"
          style={{ fontFamily: F }}
        >
          {isValidating
            ? <><Loader2 size={16} className="animate-spin" /> Validation...</>
            : isStepAlreadyDone
            ? <><CheckCircle2 size={16} /> Passer à la vérification</>
            : <><Sparkles size={16} /> Étape Suivante : Vérification</>}
        </button>
      </div>
    </div>
  )

  const infos = project.infos_marche

  // ── Main render ───────────────────────────────────────────────

  return (
    <div className="space-y-3 pb-20" style={{ fontFamily: F }}>

      {/* ── Lot details (expanded inline) ───────────────────────── */}
      {showLotDetails && lotFilterInfo && (
        <div
          className="rounded-lg px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs -mt-2"
          style={{ background: '#1E1E21', border: '1px solid rgba(255,255,255,.07)' }}
        >
          {lotFilterInfo.included.map(doc => (
            <span key={doc.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#E8E9EB' }} />
              <span style={{ color: '#D8D9DB' }}>{doc.file_name}</span>
            </span>
          ))}
          {lotFilterInfo.excluded.map(doc => (
            <span key={doc.id} className="flex items-center gap-1.5 opacity-40">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#6B6C6F' }} />
              <span style={{ color: '#959597' }}>{doc.file_name}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── HÉROS DE SYNTHÈSE — grille rigide : le fait à gauche, la boussole à droite ── */}
      <div className="glass-card top-lit blueprint-grid sheen relative overflow-hidden px-5 py-4">
        <div className="relative grid items-start gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* Le résultat de l'analyse, en chiffres */}
          <div className="min-w-0">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <p className="microlabel">
                Analyse terminée{project.selected_lot_name ? ` — ${project.selected_lot_name}` : ''}
              </p>
              <span className="edge-data flex items-center gap-2 text-xs" style={{ color: '#959597' }}>
                {lotFilterInfo ? (
                  <>
                    <span>
                      <span className="font-semibold" style={{ color: '#F7F8F8' }}>{lotFilterInfo.included.length}</span>
                      /{lotTotal} docs analysés
                    </span>
                    <button
                      onClick={() => setShowLotDetails(v => !v)}
                      className="font-medium hover:underline"
                      style={{ color: '#E8E9EB' }}
                    >
                      {showLotDetails ? 'Masquer' : 'Détails'}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <span className="num-mono bg-gradient-silver-text bg-clip-text text-5xl font-bold leading-none text-transparent">
                {items.length}
              </span>
              <div className="pb-0.5">
                <p className="text-sm font-semibold" style={{ color: '#F7F8F8' }}>exigences identifiées</p>
                <p className="mt-0.5 text-xs" style={{ color: '#959597' }}>
                  <span className="font-semibold" style={{ color: 'var(--warn)' }}>{obligatoireCount} obligatoires</span>
                  {' · '}{items.length - obligatoireCount} souhaitées
                </p>
              </div>
            </div>
            {infos?.objet && (
              <p className="mt-3.5 max-w-2xl text-sm font-medium leading-snug" style={{ color: '#D8D9DB' }}>
                {infos.objet}
              </p>
            )}
            {(infos?.maitre_ouvrage || infos?.maitre_oeuvre) && (
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed" style={{ color: '#6B6C6F' }}>
                {infos?.maitre_ouvrage && <>Client&nbsp;: <span style={{ color: '#959597' }}>{infos.maitre_ouvrage}</span></>}
                {infos?.maitre_ouvrage && infos?.maitre_oeuvre && ' · '}
                {infos?.maitre_oeuvre && <>Maîtrise d&apos;œuvre&nbsp;: <span style={{ color: '#959597' }}>{infos.maitre_oeuvre}</span></>}
              </p>
            )}
          </div>

          {/* Les critères de jugement — la boussole de la réponse */}
          {(prixPct > 0 || techPct > 0) && (
            <div className="min-w-0">
              <p className="microlabel mb-2">Critères de jugement</p>
              <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                {prixPct > 0 && <div title={`Prix ${prixPct} %`} style={{ width: `${prixPct}%`, background: '#FFFFFF' }} />}
                {techPct > 0 && <div title={`Technique ${techPct} %`} style={{ width: `${techPct}%`, background: '#98999C' }} />}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span style={{ color: '#959597' }}>
                  Prix <span className="num-mono font-bold" style={{ color: '#F7F8F8' }}>{prixPct}&nbsp;%</span>
                </span>
                <span style={{ color: '#959597' }}>
                  Technique <span className="num-mono font-bold" style={{ color: '#F7F8F8' }}>{techPct}&nbsp;%</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── C6 : viewer PDF intégré (source à la bonne page, excerpt surligné) ── */}
      {viewer && (
        <PdfSourceViewer
          fileUrl={viewer.url}
          fileName={viewer.name}
          initialPage={viewer.page}
          onClose={() => setViewer(null)}
        />
      )}

      {/* Synorix Score retiré de cette page (décision produit) — composant
          et endpoint conservés, réactivables. */}

      {/* Sélecteur de lot (multi-lots mutualisé) */}
      {analyzedLots.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ds-text-2">Lot affiché :</span>
          <select
            value={activeLot ?? ''}
            onChange={(e) => setViewLot(e.target.value)}
            className="glass-input py-1.5 px-2 text-sm"
          >
            {analyzedLots.map((l) => (
              <option key={l} value={l}>
                {(project.lots_detectes || []).find(d => d.id === l)?.nom ?? l}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── BANDEAU CRITIQUE (C5) — deadline, visite, critères, pénalités ── */}
      <CriticalBanner projectId={project.id} onOpenSource={openFieldSource} />

      {/* ── TRÉSORERIE (C19) + RÉTRO-PLANNING (C20) ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr,320px] items-start">
        <TresorerieCard projectId={project.id} onOpenSource={openFieldSource} />
        <RetroPlanning projectId={project.id} />
      </div>

      {/* ── SEARCH BAR ──────────────────────────────────────────── */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#6B6C6F' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une clause ou une exigence..."
          className="glass-input w-full pl-10 pr-10 py-2.5 text-sm"
          style={{ fontFamily: F }}
        />
        <Sparkles size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#E8E9EB' }} />
      </div>

      {/* ── ONGLETS ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 pb-px" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
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
        <p className="text-center text-sm py-12" style={{ color: '#6B6C6F', fontFamily: F }}>
          Aucune exigence trouvée
        </p>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, catItems], sectionIdx) => (
            <ExigenceSection
              key={cat}
              category={cat as ComplianceCategory}
              items={catItems}
              onOpenSource={openSourceDocument}
              defaultOpen={sectionIdx === 0 || activeFilter !== 'all' || search.trim().length > 0}
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
      style={{ color: active ? '#E8E9EB' : '#959597', fontFamily: F }}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#E8E9EB' }} />
      )}
    </button>
  )
}

// ─── Exigence Column ─────────────────────────────────────────────────────────

function ExigenceSection({
  category,
  items,
  onOpenSource,
  defaultOpen = false,
}: {
  category: ComplianceCategory
  items: ComplianceItem[]
  onOpenSource: (item: ComplianceItem) => void
  defaultOpen?: boolean
}) {
  // Section REPLIABLE : avec 400+ exigences, tout-ouvert rend la page
  // interminable. Lignes denses : texte pleine largeur, source + badge
  // sur la même ligne (wrap en mobile), extrait tronqué retiré (le
  // passage complet vit dans le viewer au clic).
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-ds-bg-2"
      >
        <h3 className="text-base font-bold" style={{ color: '#F7F8F8', fontFamily: F }}>
          {CATEGORY_LABELS[category]}{' '}
          <span className="font-medium text-sm" style={{ color: '#6B6C6F' }}>({items.length})</span>
        </h3>
        <span
          className="text-xs font-medium transition-transform"
          style={{ color: '#E8E9EB', transform: open ? 'rotate(180deg)' : undefined }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-5 pb-3">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-start gap-2.5 py-2 flex-wrap sm:flex-nowrap"
              style={idx < items.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,.07)' } : undefined}
            >
              <span
                className="shrink-0 mt-0.5 text-[11px] tabular-nums w-7 text-right"
                style={{ color: '#55565A', fontFamily: '"Geist Mono", monospace' }}
              >
                {idx + 1}
              </span>

              <p className="flex-1 min-w-[240px] text-sm leading-snug" style={{ color: '#D8D9DB' }}>
                {item.exigence_text}
                {item.suggestion_ia && (
                  <span className="block text-xs mt-0.5 italic" style={{ color: '#B4B5B8' }}>
                    💡 {item.suggestion_ia}
                  </span>
                )}
              </p>

              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                {item.source_document && item.source_excerpt && (
                  <button
                    onClick={() => onOpenSource(item)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-opacity hover:opacity-70 hover:underline whitespace-nowrap"
                    style={{ background: '#1E1E21', color: '#E8E9EB', border: '1px solid rgba(255,255,255,.07)' }}
                    title={`Voir dans ${item.source_document} — passage surligné`}
                  >
                    <FileText size={11} />
                    {item.source_document}
                    {item.source_page ? ` p.${item.source_page}` : ''}
                  </button>
                )}
                {item.priority === 'obligatoire' ? (
                  // Ambre = clause du DCE à respecter (le corail reste aux vraies alertes)
                  <span
                    className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
                    style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}
                  >
                    Obligatoire
                  </span>
                ) : (
                  <span
                    className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
                    style={{ background: 'rgba(149,149,151,0.08)', color: '#959597' }}
                  >
                    Souhaitée
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
