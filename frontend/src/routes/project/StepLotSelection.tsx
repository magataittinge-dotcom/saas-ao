import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Layers, CheckCircle2, AlertCircle, Zap, Plus, X,
  AlertTriangle, Loader2,
  Sparkles, FileArchive, Pencil, Check as CheckIcon,
} from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import type { Project, LotOption } from '@/types'

const LOT_DETECTION_STEPS: StepDescriptor[] = [
  { key: 'detecting_lots', label: 'Détection des lots', estimated_s: 30 },
]

// Used by the modal shown right after the user clicks "Analyser le DCE".
const ANALYSIS_STEPS_FOR_DISPLAY: StepDescriptor[] = [
  { key: 'preparation',     label: 'Lecture des documents',                 estimated_s: 2 },
  { key: 'analyzing_pass1', label: 'Analyse des exigences administratives', estimated_s: 50 },
  { key: 'analyzing_pass2', label: 'Analyse des exigences techniques',      estimated_s: 50 },
  { key: 'finalizing',      label: 'Finalisation',                          estimated_s: 5 },
]
import { cn } from '@/lib/utils'
import { AiTipsBlock, type TipData } from '@/components/common/AiTip'

const F = "'Geist Sans', sans-serif"

interface Props { project: Project }

// ─── Low-confidence indicator ───────────────────────────────────────────────
// We deliberately do NOT display the % score or any 'FIABLE/PROBABLE'
// label. On a paid B2B product, surfacing the AI's self-doubt erodes
// trust; we either trust the detection or we ask the user to verify it
// silently. For confidence >= 80 we show nothing. For < 80 we show a
// tiny grey AlertTriangle with a tooltip suggesting a quick check.

function ConfidenceWarning({ confidence }: { confidence?: number }) {
  if (confidence === undefined || confidence >= 80) return null
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full"
      style={{ color: '#6B7280' }}
      title="Cette détection mérite une vérification"
      aria-label="Cette détection mérite une vérification"
    >
      <AlertTriangle size={13} />
    </span>
  )
}

// ─── Sources indicator ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  excel:       'DPGF',
  rc_text:     'RC',
  filename:    'Fichier',
  ia_fallback: 'Complété par IA',
}

function SourcesIndicator({ sources }: { sources?: string[] }) {
  if (!sources || sources.length === 0) return null
  const regular = sources.filter(s => s !== 'ia_fallback').map(s => SOURCE_LABELS[s] ?? s)
  const fromIA = sources.includes('ia_fallback')
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#6B7280' }}>
      {regular.join('  ')}
      {fromIA && (
        // Badge distinct : lot ajouté/complété par le filet IA (à vérifier
        // d'un coup d'œil, contrairement aux détections déterministes).
        <span
          className="px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.25)' }}
          title="Ce lot a été complété par l'IA à partir du règlement de consultation — vérifiez son intitulé"
        >
          {SOURCE_LABELS.ia_fallback}
        </span>
      )}
    </span>
  )
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

interface LotCardProps {
  lot: LotOption & { _manual?: boolean }
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
  onRename?: (newLabel: string) => void
}

/* A lot label is "generic" when the detector found a number but no
 * description (e.g. "Lot 6" or "Lot 06A"). The UI offers an inline edit
 * for those — for everything else the label is shown as-is. */
function isGenericLotLabel(label: string): boolean {
  const trimmed = label.trim()
  return /^Lot\s+[0-9A-Za-z]+\s*$/i.test(trimmed)
}

function LotCard({ lot, selected, onSelect, onDelete, onRename }: LotCardProps) {
  // We deliberately do NOT show a Synorix-internal sequential number
  // (e.g. "LOT 06") next to the real DCE label — it confused users by
  // implying two competing numbering systems. lot.nom already starts
  // with the correct DCE number ("Lot 5 — …") when available.
  const displayedLabel = lot.user_label?.trim() || lot.nom
  const isGeneric = !lot.user_label && isGenericLotLabel(displayedLabel)

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(lot.user_label ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDraft(lot.user_label ?? '')
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const cancelEdit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation?.()
    setIsEditing(false)
  }
  const saveEdit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation?.()
    const value = draft.trim()
    if (!value || !onRename) {
      setIsEditing(false)
      return
    }
    onRename(value)
    setIsEditing(false)
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full flex items-center gap-4 p-5 rounded-xl text-left transition-all duration-200 cursor-pointer',
          selected
            ? 'shadow-sm'
            : 'hover:bg-edge-slate',
        )}
        style={{
          background: selected ? 'rgba(34,211,238,0.06)' : '#1A1D21',
          border: selected ? '2px solid #22D3EE' : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Radio */}
        <div
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
          style={
            selected
              ? { borderColor: '#22D3EE', background: '#22D3EE' }
              : { borderColor: '#4B5563' }
          }
        >
          {selected && <div className="w-2 h-2 rounded-full bg-ds-bg" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(e)
                  if (e.key === 'Escape') cancelEdit(e)
                }}
                placeholder={`${displayedLabel} — décrivez le lot`}
                maxLength={200}
                className="input-dark flex-1"
                style={{ padding: '0.4rem 0.6rem' }}
              />
              <button
                type="button"
                onClick={saveEdit}
                className="edge-cta w-8 h-8 rounded-lg flex items-center justify-center"
                title="Enregistrer"
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: '#232730', color: '#9AA3AE' }}
                title="Annuler"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-base font-semibold"
                  style={{
                    color: isGeneric ? '#6B7280' : '#E7EAEE',
                    fontStyle: isGeneric ? 'italic' : 'normal',
                  }}
                >
                  {displayedLabel}
                  {isGeneric && (
                    <span style={{ color: '#6B7280' }}> — Description à compléter</span>
                  )}
                </span>
                {lot._manual && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ color: '#22D3EE', background: 'rgba(34,211,238,0.08)' }}
                  >
                    Manuel
                  </span>
                )}
                {onRename && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: '#9AA3AE', background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#232730' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    title="Renommer ce lot"
                  >
                    <Pencil size={11} /> Renommer
                  </button>
                )}
              </div>
              {lot.description_long && (
                <p
                  className="text-xs mt-1 line-clamp-2"
                  style={{ color: '#9AA3AE' }}
                  title={lot.description_long}
                >
                  {lot.description_long}
                </p>
              )}
              {lot.tranches && lot.tranches.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium mt-1 px-2 py-0.5 rounded-full"
                  style={{ color: '#22D3EE', background: 'rgba(34,211,238,0.08)' }}
                  title={lot.tranches.join('\n')}
                >
                  {lot.tranches.length} tranche{lot.tranches.length > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right side: discrete warning (only for < 80% confidence) + sources */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <ConfidenceWarning confidence={lot.confidence} />
          <SourcesIndicator sources={lot.sources} />
        </div>
      </button>

      {/* Delete */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
          style={{ color: '#F87171', background: 'rgba(248,113,113,0.06)' }}
          title="Supprimer ce lot"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

// ─── Manual lot form ──────────────────────────────────────────────────────────

interface AddLotFormProps {
  onAdd: (lot: LotOption & { _manual: true }) => void
  onCancel: () => void
}

function AddLotForm({ onAdd, onCancel }: AddLotFormProps) {
  const [num, setNum] = useState('')
  const [label, setLabel] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(num, 10)
    if (!n || n < 1 || n > 30) return
    const id = `lot${n}`
    const nom = label.trim() ? `Lot ${n} — ${label.trim()}` : `Lot ${n}`
    onAdd({ id, nom, confidence: undefined, sources: [], _manual: true })
    setNum('')
    setLabel('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-3 p-4 rounded-xl"
      style={{ background: '#232730', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: '#9AA3AE' }}>N° lot</label>
        <input
          type="number" min={1} max={30} placeholder="1"
          value={num} onChange={(e) => setNum(e.target.value)}
          className="w-16 text-sm rounded-lg px-2.5 py-2 outline-none"
          style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)', color: '#E7EAEE' }}
          required
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs font-medium" style={{ color: '#9AA3AE' }}>Intitulé (optionnel)</label>
        <input
          type="text" placeholder="ex : Gros œuvre"
          value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60}
          className="text-sm rounded-lg px-2.5 py-2 outline-none"
          style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)', color: '#E7EAEE' }}
        />
      </div>
      <button type="submit" disabled={!num}
        className="edge-cta px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 shrink-0">
        Ajouter
      </button>
      <button type="button" onClick={onCancel}
        className="px-3 py-2 text-sm shrink-0 transition-colors"
        style={{ color: '#9AA3AE' }}>
        Annuler
      </button>
    </form>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StepLotSelection({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { organization } = useAuthStore()
  const [showPaywall, setShowPaywall] = useState(false)
  const [processingDetail, setProcessingDetail] = useState('')
  const [waitingForExtraction, setWaitingForExtraction] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: procStatus } = useQuery({
    queryKey: ['processing-status', project.id],
    queryFn: async () => {
      const { data } = await api.get<{ status: string; progress: number; detail: string }>(
        `/projects/${project.id}/processing-status`
      )
      return data
    },
  })

  const isBackendBusy = procStatus?.status === 'extracting_text' || procStatus?.status === 'extracting_zip'

  // Audit écart #3 — documents illisibles (scanné / corrompu / .doc ancien)
  // signalés PAR FICHIER : la phase différée n'est plus jamais silencieuse.
  const { data: extractionInfo } = useQuery({
    queryKey: ['extraction-warnings', project.id, isBackendBusy],
    queryFn: async () => {
      const { data } = await api.get<{ warnings?: { file_name: string; warning: string }[] }>(
        `/projects/${project.id}/extraction-status`,
      )
      return data
    },
    enabled: !isBackendBusy,
  })
  const extractionWarnings = extractionInfo?.warnings ?? []

  useEffect(() => {
    if (!isBackendBusy) {
      if (waitingForExtraction) {
        setWaitingForExtraction(false)
        queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'lots'] })
      }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    setWaitingForExtraction(true)
    setProcessingDetail(procStatus?.detail ?? '')
    if (!pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get<{ status: string; progress: number; detail: string }>(
            `/projects/${project.id}/processing-status`
          )
          setProcessingDetail(data.detail)
          if (data.status === 'ready' || data.status === 'error') {
            queryClient.invalidateQueries({ queryKey: ['processing-status', project.id] })
          }
        } catch { /* ignore */ }
      }, 2000)
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [isBackendBusy, waitingForExtraction, procStatus, project.id, queryClient])

  // ─── Lot detection ──────────────────────────────────────────────────────────
  // The /lots endpoint either returns the cached lots, or kicks off a
  // background detection thread and returns {status: 'detecting_lots'}.
  // We then drive the UI from the SSE bus instead of polling.
  const [detectPhase, setDetectPhase] = useState<'idle' | 'detecting' | 'done'>('idle')
  const [detectLabel, setDetectLabel] = useState('Détection des lots en cours...')
  const detectDoneRef = useRef(false)

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ['projects', project.id, 'lots'],
    queryFn: async () => {
      const { data } = await api.get<{ lots?: LotOption[]; count?: number; cached?: boolean; status?: string; progress?: number; detail?: string }>(`/projects/${project.id}/lots`)
      if (data.status === 'detecting_lots') {
        if (!detectDoneRef.current) {
          setDetectPhase('detecting')
          setDetectLabel(data.detail || 'Détection des lots en cours...')
        }
        return null
      }
      queryClient.invalidateQueries({ queryKey: ['projects', project.id], exact: true })
      return data as { lots: LotOption[]; count: number }
    },
  })

  // SSE stream during detection. Disabled when not detecting so we don't
  // hold an open HTTP connection on every page visit.
  const detectSse = useProgressStream(project.id, {
    enabled: detectPhase === 'detecting' && !detectDoneRef.current,
    onComplete: async () => {
      detectDoneRef.current = true
      try {
        const { data: lotsResult } = await api.get<{ lots: LotOption[]; count: number }>(`/projects/${project.id}/lots`)
        const count = lotsResult?.lots?.filter((l: LotOption) => l.id !== '!!')?.length ?? 0
        setDetectLabel(count > 0
          ? `${count} lot${count > 1 ? 's' : ''} détecté${count > 1 ? 's' : ''} !`
          : 'Marché unique détecté')
      } catch { /* ignore */ }
      setDetectPhase('done')
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'lots'] })
      setTimeout(() => { setDetectPhase('idle') }, 1200)
    },
    onError: () => {
      detectDoneRef.current = true
      setDetectPhase('idle')
    },
  })

  // Mirror the SSE "detail" line into the page label.
  useEffect(() => {
    if (detectPhase === 'detecting' && detectSse.detail) {
      setDetectLabel(detectSse.detail)
    }
  }, [detectSse.detail, detectPhase])

  const allDetected = lotsData?.lots ?? project.lots_detectes ?? []
  const errorLots = allDetected.filter(l => l.sources?.includes('error'))
  const [lots, setLots] = useState<(LotOption & { _manual?: boolean })[]>([])
  const [lotsInitialized, setLotsInitialized] = useState(false)

  if (!lotsInitialized && !lotsLoading && allDetected.length > 0) {
    setLots(allDetected.filter(l => l.id !== '!!'))
    setLotsInitialized(true)
  }

  // Multi-sélection : cliquer une carte AJOUTE/RETIRE le lot ; « tous les
  // lots » est exclusif. 1 POST /analyze = N lots (tronc commun mutualisé).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set([project.selected_lot ?? 'all']))
  const toggleLot = (lotId: string) => {
    setSelectedIds(prev => {
      if (lotId === 'all') return new Set(['all'])
      const next = new Set(prev)
      next.delete('all')
      if (next.has(lotId)) next.delete(lotId)
      else next.add(lotId)
      return next.size === 0 ? new Set(['all']) : next
    })
  }
  const selectedLotIds = [...selectedIds].filter(id => id !== 'all')
  const selectedId = selectedLotIds[0] ?? 'all'
  const [showAddForm, setShowAddForm] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // SSE driving the modal during analysis. Disabled when not analyzing
  // so we don't keep an idle stream open.
  const analysisSse = useProgressStream(project.id, {
    enabled: isAnalyzing,
    onComplete: () => {
      setIsAnalyzing(false)
      setIsSuccess(true)
      navigate(`/projects/${project.id}/analysis`)
    },
    onError: () => {
      setIsAnalyzing(false)
      setIsSuccess(false)
    },
  })

  // Fallback: if the SSE missed the 'complete' event (network blip during
  // the last 100 ms of the pipeline) the project still ends up with
  // status='analyzed' on the next refetch. Navigate to /analysis in that
  // case so the user never gets stuck on this page.
  useEffect(() => {
    if (project.status === 'analyzed' && isAnalyzing) {
      setIsAnalyzing(false)
      setIsSuccess(true)
      navigate(`/projects/${project.id}/analysis`)
    }
  }, [project.status, isAnalyzing, project.id, navigate])
  const [, setPreparation] = useState<{ extracted: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set())

  const hasMultiLots = lots.length >= 2

  const lotTips = useMemo<TipData[]>(() => {
    const tips: TipData[] = []
    const lowConfidence = lots.filter(l => (l.confidence ?? 100) < 50)
    if (lowConfidence.length > 0) {
      tips.push({ id: 'lots-low-conf', variant: 'warning', text: `Certains lots ont une confiance faible — verifiez les noms et numeros.` })
    }
    tips.push({ id: 'lots-info', variant: 'info', text: `Verifiez que tous les lots qui vous interessent sont bien detectes. Vous pouvez en ajouter manuellement.` })
    return tips
  }, [lots])
  const selectedName = lots.find(l => l.id === selectedId)?.nom ?? null

  const handleDelete = (lotId: string) => {
    setLots(prev => prev.filter(l => l.id !== lotId))
    if (selectedIds.has(lotId)) toggleLot(lotId)
  }

  const handleAddLot = (lot: LotOption & { _manual: true }) => {
    setLots(prev => {
      if (prev.some(l => l.id === lot.id)) return prev
      return [...prev, lot]
    })
    toggleLot(lot.id)
    setShowAddForm(false)
  }

  const { mutateAsync: selectLot } = useMutation({
    mutationFn: (payload: { lot_id: string | null; lot_name: string | null }) =>
      api.post(`/projects/${project.id}/lots/select`, payload),
  })

  const { mutate: renameLot } = useMutation({
    mutationFn: ({ lotId, label }: { lotId: string; label: string }) =>
      api.patch<Project>(
        `/projects/${project.id}/lots/${lotId}/rename`,
        { user_label: label },
      ),
    onSuccess: (_resp, vars) => {
      setLots(prev => prev.map(l => (l.id === vars.lotId ? { ...l, user_label: vars.label } : l)))
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
  })

  const handleCancel = () => {
    abortRef.current?.abort()
    setIsAnalyzing(false)
    setIsSuccess(false)
    setPreparation(null)
    setAnalysisError("Analyse annulée.")
  }

  const handleLaunch = async () => {
    const plan = organization?.plan ?? 'free'
    if (plan === 'free') { setShowPaywall(true); return }
    setAnalysisError(null)
    const abort = new AbortController()
    abortRef.current = abort
    try {
      await selectLot({
        lot_id: selectedId === 'all' ? null : selectedId,
        lot_name: selectedId === 'all' ? null : selectedName,
      })
      const lotsPayload = selectedLotIds.length > 1 ? { lots: selectedLotIds } : {}
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      setIsAnalyzing(true)
      let ready = false
      while (!ready) {
        if (abort.signal.aborted) return
        const { data } = await api.get<{ total: number; extracted: number; ready: boolean }>(
          `/projects/${project.id}/extraction-status`,
        )
        setPreparation({ extracted: data.extracted, total: data.total })
        if (data.ready) { ready = true } else { await new Promise((r) => setTimeout(r, 2000)) }
      }
      if (abort.signal.aborted) return
      setPreparation(null)
      // L'analyse est DÉTACHÉE côté serveur (thread) : le POST répond
      // « started » immédiatement et le run survit à tout — navigation,
      // reload, connexion coupée. On rejoint l'écran d'analyse qui suit
      // la progression via SSE (et la retrouve après un reload).
      await api.post(`/projects/${project.id}/analyze`, lotsPayload, { timeout: 60_000 })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      navigate(`/projects/${project.id}/analysis`)
      return
    } catch (err) {
      if (abort.signal.aborted) return
      setIsAnalyzing(false)
      setIsSuccess(false)
      setPreparation(null)
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? "Erreur lors de l'analyse")
        : "Erreur lors de l'analyse"
      setAnalysisError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  /* ════════════════════════════════════════════════════════════════
     JSX
     ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="analysis" />

      {isAnalyzing && (
        <ProgressDisplay
          variant="modal"
          title="Analyse IA en cours"
          steps={ANALYSIS_STEPS_FOR_DISPLAY}
          currentStep={analysisSse.step}
          progress={analysisSse.progress}
          detail={analysisSse.detail}
          phase={analysisSse.phase}
          onCancel={handleCancel}
        />
      )}

      {/* Lot detection overlay (inline circle wrapped in our own portal) */}
      {detectPhase !== 'idle' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.60)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-8 max-w-sm w-full mx-4" style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <ProgressDisplay
              variant="inline"
              steps={LOT_DETECTION_STEPS}
              currentStep="detecting_lots"
              progress={detectPhase === 'done' ? 100 : detectSse.progress}
              detail={detectLabel}
              phase={detectPhase === 'done' ? 'complete' : 'in_progress'}
            />
          </div>
        </div>,
        document.body,
      )}

      <div style={{ fontFamily: F }}>

        {/* Backend busy */}
        {isBackendBusy && (
          <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#22D3EE' }} />
            <div>
              <span className="text-sm font-medium block" style={{ color: '#22D3EE' }}>Extraction des documents en cours...</span>
              {processingDetail && <span className="text-xs block mt-0.5" style={{ color: '#6B7280' }}>{processingDetail}</span>}
            </div>
          </div>
        )}

        {/* Documents illisibles — signalés par fichier, jamais silencieux */}
        {extractionWarnings.length > 0 && (
          <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.20)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle size={16} style={{ color: '#FBBF24' }} />
              <span className="text-sm font-semibold" style={{ color: '#FBBF24' }}>
                {extractionWarnings.length} document{extractionWarnings.length > 1 ? 's' : ''} illisible{extractionWarnings.length > 1 ? 's' : ''} — exigences non extraites de ce{extractionWarnings.length > 1 ? 's' : ''} fichier{extractionWarnings.length > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-0.5 pl-6">
              {extractionWarnings.map((w) => (
                <li key={w.file_name} className="text-xs" style={{ color: '#FBBF24' }}>
                  <span className="font-medium">{w.file_name}</span> — {w.warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── TITLE + BADGE ───────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold" style={{ color: '#E7EAEE' }}>
              Sélection du lot à analyser
            </h2>
            {lots.length > 0 && (
              <span className="pill-cyan text-xs font-bold px-3 py-1 rounded-full">
                {lots.length} lot{lots.length > 1 ? 's' : ''} détecté{lots.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm" style={{ color: '#6B7280' }}>
            <FileArchive size={14} />
            Source : {project.name}
          </div>
        </div>

        {/* ── ACTION REQUISE ──────────────────────────────── */}
        <div className="flex items-start gap-3 p-4 rounded-xl mb-5" style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.12)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(34,211,238,0.10)' }}>
            <Zap size={16} style={{ color: '#22D3EE' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#67E8F9' }}>Action requise</p>
            <p className="text-sm mt-0.5" style={{ color: '#9AA3AE' }}>
              {hasMultiLots
                ? "L'intelligence artificielle a segmenté les documents du marché. Sélectionnez le lot sur lequel votre entreprise va répondre pour lancer l'analyse de conformité technique."
                : lots.length === 1
                  ? 'Un seul lot a été détecté. Confirmez ou ajoutez des lots manuellement.'
                  : "Cet appel d'offres semble être mono-lot. Vous pouvez lancer l'analyse ou ajouter les lots manuellement."}
            </p>
          </div>
        </div>

        {/* AiTips */}
        <div className="mb-5">
          <AiTipsBlock tips={lotTips} dismissed={dismissedTips} onDismiss={(id) => setDismissedTips((s) => new Set(s).add(id))} />
        </div>

        {/* Excel error */}
        {errorLots.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl mb-5" style={{ background: 'rgba(154,163,174,0.06)', border: '1px solid rgba(154,163,174,0.15)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: '#9AA3AE' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#9AA3AE' }}>Fichier(s) Excel protégé(s) par mot de passe</p>
              {errorLots.map(l => <p key={l.id} className="text-xs mt-0.5" style={{ color: '#9AA3AE' }}>{l.nom}</p>)}
            </div>
          </div>
        )}

        {/* ── LOT LIST ────────────────────────────────────── */}
        {lots.length > 0 ? (
          <div className="space-y-3">
            {/* All lots option */}
            <LotCard
              lot={{ id: 'all', nom: "Analyser l'ensemble du DCE (tous les lots)" }}
              selected={selectedIds.has('all')}
              onSelect={() => toggleLot('all')}
            />
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                selected={selectedIds.has(lot.id)}
                onSelect={() => toggleLot(lot.id)}
                onDelete={() => handleDelete(lot.id)}
                onRename={(label) => renameLot({ lotId: lot.id, label })}
              />
            ))}
          </div>
        ) : !lotsInitialized && (lotsLoading || detectPhase === 'detecting' || isBackendBusy) ? (
          <div className="flex items-center gap-3 p-5 rounded-xl" style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.12)' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#22D3EE' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#E7EAEE' }}>Détection des lots en cours...</p>
              <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Analyse des documents du DCE.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-5 rounded-xl" style={{ background: '#232730', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Layers size={20} style={{ color: '#22D3EE' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#E7EAEE' }}>Marché unique (pas de lots)</p>
              <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>L&apos;IA analysera l&apos;intégralité du DCE sans filtre par lot.</p>
            </div>
          </div>
        )}

        {/* Add lot */}
        {showAddForm ? (
          <div className="mt-4">
            <AddLotForm onAdd={handleAddLot} onCancel={() => setShowAddForm(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed text-sm font-medium mt-4 transition-colors"
            style={{ borderColor: '#232730', color: '#6B7280' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4B5563'; e.currentTarget.style.color = '#9AA3AE'; e.currentTarget.style.background = '#232730' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#232730'; e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.background = 'transparent' }}
          >
            <Plus size={16} />
            Ajouter un lot manuellement
          </button>
        )}

        {/* Error */}
        {analysisError && (
          <div className="flex items-start gap-2 p-4 rounded-xl text-sm mt-4" style={{ color: '#F87171', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{analysisError}</span>
          </div>
        )}

        {/* ── BOTTOM BAR ──────────────────────────────────── */}
        <div
          className="sticky bottom-0 mt-6 -mx-3 sm:-mx-4 px-5 py-3.5 flex items-center justify-between"
          style={{
            background: 'rgba(255,255,255,0.90)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: selectedId !== 'all' && selectedName ? '#22D3EE' : '#4B5563' }} />
            <span className="text-sm" style={{ color: '#9AA3AE' }}>
              {selectedId !== 'all' && selectedName
                ? <>Lot sélectionné : <strong style={{ color: '#E7EAEE' }}>{selectedName}</strong></>
                : 'Tous les lots sélectionnés'
              }
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/projects/${project.id}/upload`)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: '#9AA3AE', border: '1px solid rgba(255,255,255,0.06)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4B5563'; e.currentTarget.style.color = '#E7EAEE' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#232730'; e.currentTarget.style.color = '#9AA3AE' }}
            >
              Annuler
            </button>
            <button
              onClick={handleLaunch}
              disabled={isAnalyzing || isSuccess}
              className="edge-cta flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={16} />
              {selectedLotIds.length > 1
                ? `LANCER L'ANALYSE IA (${selectedLotIds.length} LOTS) >`
                : "LANCER L'ANALYSE IA >"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
