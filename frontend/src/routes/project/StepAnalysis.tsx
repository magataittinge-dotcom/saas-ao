import { useState, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Search, Eye,
  CheckCircle2, Sparkles,
} from 'lucide-react'
import { api, getSignedFileUrl } from '@/services/api'
import CriticalBanner, { type FieldSource } from '@/components/project/CriticalBanner'
import CarteAO30s from '@/components/project/CarteAO30s'
import TresorerieCard from '@/components/project/TresorerieCard'
import SynorixScoreCard from '@/components/project/SynorixScoreCard'
import RetroPlanning from '@/components/project/RetroPlanning'
import PanneauSource, { type SelectionSource } from '@/components/project/source/PanneauSource'
import VueTableau, { enAncreTableur } from '@/components/project/source/VueTableau'
import { pageCitee, reponseDeChamp } from '@/lib/ancre'
import { precharger, abandonner } from '@/services/sources'
import { useVisible } from '@/hooks/useVisible'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import { RequirementListSkeleton } from '@/components/skeletons'
import type { Project, ComplianceItem, ComplianceCategory, ProjectDocument } from '@/types'
import { useCompleteStep } from '@/hooks/useProject'
import EchecAction from '@/components/common/EchecAction'
import { messageErreur } from '@/lib/erreurs'
import { PASSAGE_INTROUVABLE, trouverPieceCitee } from '@/lib/pieceCitee'

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

  // « Voir dans le DCE » : le panneau à trois vues (Passage, Page, Document), à côté de la liste
  // sur ordinateur, en feuille qui monte du bas sur téléphone. Le serveur fournit l'ancre.
  const [selection, setSelection] = useState<SelectionSource | null>(null)
  const fermerSelection = useCallback(() => setSelection(null), [])
  // 1.16 — ce qui n'a pas abouti est dit (source introuvable, document qui ne s'ouvre pas, relance)
  const [avis, setAvis] = useState<{ message: string; relancer?: () => void } | null>(null)
  const [relanceEnCours, setRelanceEnCours] = useState(false)

  const nombrePagesDe = (nomPiece: string | null | undefined): number | null =>
    (nomPiece ? projectDocs.find((d) => d.file_name === nomPiece)?.page_count : null) ?? null

  // C5 — ouvrir la source exacte d'un champ du bandeau critique (ni ancre ni images serveur :
  // la page citée par l'analyse dans le document, et l'extrait tel quel).
  const openFieldSource = async (src: FieldSource) => {
    const doc = projectDocs.find(d => d.file_name === src.document)
    if (!doc) { setAvis({ message: PASSAGE_INTROUVABLE }); return }
    if (doc.file_url.startsWith('http')) { window.open(doc.file_url, '_blank'); return }
    try {
      const origine = await getSignedFileUrl(doc.file_url)
      const pdfRel = [doc.file_url, doc.pdf_preview_url].find((u) => u && u.toLowerCase().endsWith('.pdf')) ?? null
      const pdf = pdfRel === null ? null : pdfRel === doc.file_url ? origine : await getSignedFileUrl(pdfRel)
      setSelection({
        type: 'champ', nombrePages: doc.page_count ?? null,
        reponse: reponseDeChamp(doc, { page: src.page, excerpt: src.excerpt }, { pdf, origine }),
      })
      setAvis(null)
    } catch {
      setAvis({
        message: "Le document source n'a pas pu s'ouvrir.",
        relancer: () => { void openFieldSource(src) },
      })
    }
  }

  // Ouvrir la source d'une exigence : le panneau lit l'ancre auprès du serveur (au premier clic
  // pour un ancien AO) ; jamais de repli sur une autre pièce du dossier (1.16).
  const openSourceDocument = (item: ComplianceItem) => {
    if (!item.source_document && !item.source_page) return
    setAvis(null)
    setSelection({
      type: 'exigence', id: item.id, titre: item.source_document,
      nombrePages: nombrePagesDe(trouverPieceCitee(item.source_document, projectDocs)?.file_name),
    })
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
      {avis && <EchecAction message={avis.message} />}
      <button
        onClick={async () => {
          setAvis(null)
          setRelanceEnCours(true)
          try {
            await api.post(`/projects/${project.id}/analyze`, {}, { timeout: 60_000 })
            window.location.reload()
          } catch (err) {
            setAvis({ message: await messageErreur(err, "La relance de l'analyse n'a pas abouti. Réessayez dans un instant.") })
            setRelanceEnCours(false)
          }
        }}
        disabled={relanceEnCours}
        className="btn-primary py-2 px-5 disabled:opacity-60"
      >
        {avis ? 'Réessayer' : "Relancer l'analyse"}
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
      avis="Vous pouvez fermer cette page : Synorix vous prévient par e-mail."
      onArrierePlan={() => navigate('/dashboard')}
    />
  )

  // ── Bottom bar (portalled) ────────────────────────────────────

  const bottomBar = (
    <div
      className="sticky -bottom-5 z-30 -mx-3 sm:-mx-4 mt-6 rounded-t-lg flex items-center justify-between px-6 py-3 gap-4"
      style={{
        background: 'color-mix(in srgb, var(--surface-0) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--border-1)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <CheckCircle2 size={16} className="shrink-0" style={{ color: 'var(--text-1)' }} />
        <p className="num-mono truncate text-xs" style={{ color: 'var(--text-3)', fontFamily: F }}>
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
            ? <><CheckCircle2 size={16} /> Étape suivante : Vérification</>
            : <><Sparkles size={16} /> Étape suivante : Vérification</>}
        </button>
      </div>
    </div>
  )

  const infos = project.infos_marche

  // ── Main render ───────────────────────────────────────────────

  return (
    <div className="space-y-3" style={{ fontFamily: F }}>

      {/* ── L'AO EN 30 SECONDES — le résumé calculé depuis l'analyse (aucun appel IA) ── */}
      <CarteAO30s project={project} onOpenSource={openFieldSource} />

      {/* ── Lot details (expanded inline) ───────────────────────── */}
      {showLotDetails && lotFilterInfo && (
        <div
          className="rounded-lg px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs -mt-2"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)' }}
        >
          {lotFilterInfo.included.map(doc => (
            <span key={doc.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-1)' }} />
              <span style={{ color: 'var(--text-2)' }}>{doc.file_name}</span>
            </span>
          ))}
          {lotFilterInfo.excluded.map(doc => (
            <span key={doc.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-3)' }} />
              <span style={{ color: 'var(--text-3)' }}>{doc.file_name}</span>
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
              <span className="edge-data flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
                {lotFilterInfo ? (
                  <>
                    <span>
                      <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{lotFilterInfo.included.length}</span>
                      /{lotTotal} docs analysés
                    </span>
                    <button
                      onClick={() => setShowLotDetails(v => !v)}
                      className="cible-libre cible-etendue font-medium hover:underline"
                      style={{ color: 'var(--text-1)' }}
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
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>exigences identifiées</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                  <span className="font-semibold" style={{ color: 'var(--warn)' }}>{obligatoireCount} obligatoires</span>
                  {' · '}{items.length - obligatoireCount} souhaitées
                </p>
              </div>
            </div>
            {infos?.objet && (
              <p className="mt-3.5 max-w-2xl text-sm font-medium leading-snug" style={{ color: 'var(--text-2)' }}>
                {infos.objet}
              </p>
            )}
            {(infos?.maitre_ouvrage || infos?.maitre_oeuvre) && (
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                {infos?.maitre_ouvrage && <>Client&nbsp;: <span style={{ color: 'var(--text-3)' }}>{infos.maitre_ouvrage}</span></>}
                {infos?.maitre_ouvrage && infos?.maitre_oeuvre && ' · '}
                {infos?.maitre_oeuvre && <>Maîtrise d&apos;œuvre&nbsp;: <span style={{ color: 'var(--text-3)' }}>{infos.maitre_oeuvre}</span></>}
              </p>
            )}
          </div>

          {/* Les critères de jugement — la boussole de la réponse */}
          {(prixPct > 0 || techPct > 0) && (
            <div className="min-w-0">
              <p className="microlabel mb-2">Critères de jugement</p>
              <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                {prixPct > 0 && <div title={`Prix ${prixPct} %`} style={{ width: `${prixPct}%`, background: 'var(--text-1)' }} />}
                {techPct > 0 && <div title={`Technique ${techPct} %`} style={{ width: `${techPct}%`, background: 'var(--text-3)' }} />}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-3)' }}>
                  Prix <span className="num-mono font-bold" style={{ color: 'var(--text-1)' }}>{prixPct}&nbsp;%</span>
                </span>
                <span style={{ color: 'var(--text-3)' }}>
                  Technique <span className="num-mono font-bold" style={{ color: 'var(--text-1)' }}>{techPct}&nbsp;%</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

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

      {/* ── FICHE DE DÉCISION (1.7) — conditions vérifiées, puis « On y va » / « On passe » ── */}
      <SynorixScoreCard project={project} onOpenSource={openFieldSource} onYAller={handleValidate} enCours={isValidating} />

      {/* ── TRÉSORERIE (C19) + RÉTRO-PLANNING (C20) ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr,320px] items-start">
        <TresorerieCard projectId={project.id} onOpenSource={openFieldSource} />
        <RetroPlanning projectId={project.id} />
      </div>

      {/* ── LISTE | PANNEAU « Voir dans le DCE » (ordinateur : côte à côte ; téléphone : feuille) ── */}
      <div
        className={selection ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : undefined}
      >
      <div className={selection ? 'min-w-0 space-y-3 lg:pb-24' : 'min-w-0 space-y-3'}>
      {/* ── SEARCH BAR ──────────────────────────────────────────── */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une clause ou une exigence..."
          className="glass-input w-full pl-10 pr-10 py-2.5 text-sm"
          style={{ fontFamily: F }}
        />
        <Sparkles size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-1)' }} />
      </div>

      {/* ── ONGLETS ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 pb-px" style={{ borderBottom: '1px solid var(--border-1)' }}>
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
        <p className="text-center text-sm py-12" style={{ color: 'var(--text-3)', fontFamily: F }}>
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
              selectionId={selection?.type === 'exigence' ? selection.id : null}
              defaultOpen={sectionIdx === 0 || activeFilter !== 'all' || search.trim().length > 0}
            />
          ))}
        </div>
      )}

      </div>
      {selection && (
        <PanneauSource
          key={selection.type === 'exigence' ? selection.id : `champ-${selection.reponse.doc_id}-${selection.reponse.page}`}
          selection={selection}
          onFermer={fermerSelection}
          rendreTableur={(reponse) => selection.type === 'exigence'
            ? <div className="source-vue"><VueTableau exigenceId={selection.id} ancre={enAncreTableur(reponse)} /></div>
            : null}
        />
      )}
      </div>

      {/* ── Sticky bottom bar ───────────────────────────────────── */}
      {bottomBar}
      {avis && createPortal(
        <div className="fixed bottom-20 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4">
          <EchecAction
            message={avis.message}
            onReessayer={avis.relancer ? () => { const relancer = avis.relancer!; setAvis(null); relancer() } : undefined}
            onFermer={() => setAvis(null)}
          />
        </div>,
        document.body,
      )}
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
      style={{ color: active ? 'var(--text-1)' : 'var(--text-3)', fontFamily: F }}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--text-1)' }} />
      )}
    </button>
  )
}

// ─── Exigence Column ─────────────────────────────────────────────────────────

function ExigenceSection({
  category,
  items,
  onOpenSource,
  selectionId,
  defaultOpen = false,
}: {
  category: ComplianceCategory
  items: ComplianceItem[]
  onOpenSource: (item: ComplianceItem) => void
  selectionId: string | null
  defaultOpen?: boolean
}) {
  // Section REPLIABLE : avec 400+ exigences, tout-ouvert rend la page
  // interminable. Lignes denses : texte pleine largeur, source + badge
  // sur la même ligne (wrap en mobile), extrait tronqué retiré (le
  // passage complet vit dans le panneau « Voir dans le DCE » au clic).
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-ds-bg-2"
      >
        <h3 className="text-base font-bold" style={{ color: 'var(--text-1)', fontFamily: F }}>
          {CATEGORY_LABELS[category]}{' '}
          <span className="font-medium text-sm" style={{ color: 'var(--text-3)' }}>({items.length})</span>
        </h3>
        <span
          className="text-xs font-medium transition-transform"
          style={{ color: 'var(--text-1)', transform: open ? 'rotate(180deg)' : undefined }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-5 pb-3">
          {items.map((item, idx) => (
            <ExigenceLigne
              key={item.id}
              item={item}
              numero={idx + 1}
              derniere={idx === items.length - 1}
              active={item.id === selectionId}
              onOpenSource={onOpenSource}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Une ligne d'exigence ────────────────────────────────────────────────────

function ExigenceLigne({
  item, numero, derniere, active, onOpenSource,
}: {
  item: ComplianceItem
  numero: number
  derniere: boolean
  active: boolean
  onOpenSource: (item: ComplianceItem) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const aUneSource = Boolean(item.source_document && (item.source_excerpt || item.source_page))
  const page = pageCitee(item)
  // Visible à l'écran : l'ancre et la loupe se chargent avant le clic (file bornée, voir services/sources.ts)
  const entree = useCallback(() => precharger(item.id), [item.id])
  const sortie = useCallback(() => abandonner(item.id), [item.id])
  useVisible(ref, aUneSource, entree, sortie)

  return (
    <div
      ref={ref}
      className="exigence-ligne flex items-start gap-x-2.5 gap-y-1 py-2 flex-wrap"
      aria-current={active ? 'true' : undefined}
      style={derniere ? undefined : { borderBottom: '1px solid var(--border-1)' }}
    >
      <span
        className="shrink-0 mt-0.5 text-xs tabular-nums w-7 text-right"
        style={{ color: 'var(--text-3)', fontFamily: '"Geist Mono", monospace' }}
      >
        {numero}
      </span>

      <p className="flex-1 min-w-[240px] text-sm leading-snug" style={{ color: 'var(--text-2)' }}>
        {item.exigence_text}
        {item.suggestion_ia && (
          <span className="block text-xs mt-0.5 italic" style={{ color: 'var(--text-2)' }}>
            💡 {item.suggestion_ia}
          </span>
        )}
      </p>

      <div className="flex min-w-0 max-w-full items-center gap-2 ml-auto flex-wrap justify-end">
        {aUneSource && (
          <>
            <span className="basis-full text-xs sm:basis-auto" style={{ color: 'var(--text-3)' }}>
              {item.source_document}{page ? ` · page ${page}` : ''}
            </span>
            <button
              type="button"
              onClick={() => onOpenSource(item)}
              className="source-voir"
              aria-label={`Voir dans le DCE : ${item.source_document}${page ? `, page ${page}` : ''}`}
            >
              <Eye size={16} aria-hidden="true" />
              Voir dans le DCE
            </button>
          </>
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
            style={{ background: 'color-mix(in srgb, var(--text-3) 8%, transparent)', color: 'var(--text-3)' }}
          >
            Souhaitée
          </span>
        )}
      </div>
    </div>
  )
}
