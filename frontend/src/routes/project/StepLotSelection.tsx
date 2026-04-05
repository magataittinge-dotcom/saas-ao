import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, CheckCircle2, AlertCircle, Zap, Plus, X, ShieldCheck, AlertTriangle, HelpCircle, Users, Loader2 } from 'lucide-react'
import axios from 'axios'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { AnalysisProgress } from '@/components/project/AnalysisProgress'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import LoadingProgress from '@/components/common/LoadingProgress'
import type { Project, LotOption } from '@/types'
import { cn } from '@/lib/utils'

interface Props { project: Project }

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null
  if (confidence >= 80) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200"
        style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)', boxShadow: '0 0 8px rgba(16,185,129,0.20)' }}>
        <ShieldCheck size={10} />
        Détection fiable
      </span>
    )
  }
  if (confidence >= 50) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200"
        style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)', boxShadow: '0 0 8px rgba(245,158,11,0.18)' }}>
        <AlertTriangle size={10} />
        À vérifier
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200"
      style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 0 8px rgba(239,68,68,0.18)' }}>
      <HelpCircle size={10} />
      Incertain
    </span>
  )
}

// ─── Sources indicator ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  excel:    'DPGF',
  rc_text:  'RC',
  filename: 'Fichier',
}

function SourcesIndicator({ sources }: { sources?: string[] }) {
  if (!sources || sources.length <= 1) return null
  const labels = sources.map(s => SOURCE_LABELS[s] ?? s)
  return (
    <span className="inline-flex items-center gap-1 text-xs"
      style={{ color: '#64748B' }}>
      <Users size={10} />
      Confirmé par {sources.length} sources ({labels.join(', ')})
    </span>
  )
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

interface LotCardProps {
  lot: LotOption & { _manual?: boolean }
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
  icon?: React.ReactNode
}

function LotCard({ lot, selected, onSelect, onDelete, icon }: LotCardProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200',
          selected
            ? 'border-ds-cyan'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]',
        )}
        style={selected ? { borderColor: '#3B82F6', background: 'rgba(59,130,246,0.08)' } : undefined}
      >
        {/* Radio indicator */}
        <div
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
          style={
            selected
              ? { borderColor: '#3B82F6', background: '#3B82F6' }
              : { borderColor: 'rgba(255,255,255,0.25)' }
          }
        >
          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>

        {icon && <span className="shrink-0 mt-0.5" style={{ color: selected ? '#3B82F6' : '#64748B' }}>{icon}</span>}

        <div className="flex-1 min-w-0 space-y-1.5">
          <span className={cn('text-sm font-medium block', selected ? 'text-ds-text' : 'text-ds-text-2')}>
            {lot.nom}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={lot.confidence} />
            <SourcesIndicator sources={lot.sources} />
            {/* AMÉLIORATION 7: tranches badge */}
            {lot.tranches && lot.tranches.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                title={lot.tranches.join('\n')}
                style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.25)', cursor: 'help' }}>
                {lot.tranches.length} tranche{lot.tranches.length > 1 ? 's' : ''}
              </span>
            )}
            {lot._manual && (
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.25)' }}>
                Ajouté manuellement
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Delete button — visible on hover */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
          style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
          title="Supprimer ce lot"
        >
          <X size={12} />
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
      className="flex items-end gap-2 p-3 rounded-xl border"
      style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.20)' }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-ds-text-2">N° lot</label>
        <input
          type="number"
          min={1}
          max={30}
          placeholder="1"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          className="w-16 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 text-ds-text"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
          required
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs text-ds-text-2">Intitulé (optionnel)</label>
        <input
          type="text"
          placeholder="ex : Gros œuvre"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          className="text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 text-ds-text"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
        />
      </div>
      <button
        type="submit"
        disabled={!num}
        className="btn-primary px-3 py-1.5 text-sm shrink-0"
      >
        Ajouter
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 text-sm shrink-0 text-ds-text-2 hover:text-ds-text transition-colors"
      >
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

  // Check if backend is still extracting text before attempting lot detection
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

  // Poll while backend is still processing
  useEffect(() => {
    if (!isBackendBusy) {
      if (waitingForExtraction) {
        setWaitingForExtraction(false)
        // Refetch lots now that extraction is done
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

  // ─── Lot detection with real progress ────────────────────────────────────────
  const [detectPhase, setDetectPhase] = useState<'idle' | 'detecting' | 'done'>('idle')
  const [detectPct, setDetectPct] = useState(0)
  const [detectLabel, setDetectLabel] = useState('Détection des lots en cours...')
  const detectPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detectCrawlRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detectDisplayRef = useRef(0) // tracks displayed value for crawl logic
  const detectDoneRef = useRef(false) // permanent guard — once done, never re-trigger

  // Fetch lots — fires immediately on mount, triggers detection on backend cache miss
  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ['projects', project.id, 'lots'],
    queryFn: async () => {
      const { data } = await api.get<{ lots?: LotOption[]; count?: number; cached?: boolean; status?: string; progress?: number; detail?: string }>(`/projects/${project.id}/lots`)
      // Backend returned "detecting_lots" → start polling
      if (data.status === 'detecting_lots') {
        // Use ref (not state) to avoid stale closure re-triggering after done
        if (!detectDoneRef.current && !detectPollRef.current) {
          setDetectPhase('detecting')
          setDetectPct(0)
          detectDisplayRef.current = 0
          setDetectLabel(data.detail || 'Détection des lots en cours...')
          startDetectCrawl()
          startDetectPoll()
        }
        return null // no lots yet
      }
      // Got cached or freshly computed lots
      // Refresh project data for stepper — use exact:true to avoid invalidating THIS query
      queryClient.invalidateQueries({ queryKey: ['projects', project.id], exact: true })
      return data as { lots: LotOption[]; count: number }
    },
    // No enabled gate — fire immediately. Backend handles "still extracting" gracefully.
  })

  // Slow crawl: +0.3%/200ms while waiting for first real backend value
  function startDetectCrawl() {
    if (detectCrawlRef.current) return
    detectCrawlRef.current = setInterval(() => {
      detectDisplayRef.current = Math.min(detectDisplayRef.current + 0.3, 20) // cap at 20% before real data
      setDetectPct(detectDisplayRef.current)
    }, 200)
  }

  function stopDetectCrawl() {
    if (detectCrawlRef.current) { clearInterval(detectCrawlRef.current); detectCrawlRef.current = null }
  }

  function startDetectPoll() {
    if (detectPollRef.current) return
    detectPollRef.current = setInterval(async () => {
      // Permanent guard — once done, never process another tick
      if (detectDoneRef.current) return

      try {
        const { data } = await api.get<{ status: string; progress: number; detail: string }>(
          `/projects/${project.id}/processing-status`
        )

        if (detectDoneRef.current) return // re-check after await

        if (data.status === 'detecting_lots') {
          if (data.progress > detectDisplayRef.current) {
            stopDetectCrawl()
            detectDisplayRef.current = data.progress
            setDetectPct(data.progress)
          }
          if (data.detail) setDetectLabel(data.detail)
        } else if (data.status === 'ready' || data.status === 'error') {
          // Mark done FIRST — prevents any re-trigger
          detectDoneRef.current = true

          // Stop ALL intervals BEFORE changing any state
          stopDetectCrawl()
          if (detectPollRef.current) { clearInterval(detectPollRef.current); detectPollRef.current = null }

          if (data.status === 'error') {
            setDetectPhase('idle')
            setDetectPct(0)
            return
          }

          // Show 100% briefly, then fetch lots
          setDetectPct(100)
          const { data: lotsResult } = await api.get<{ lots: LotOption[]; count: number }>(`/projects/${project.id}/lots`)
          const count = lotsResult?.lots?.filter((l: LotOption) => l.id !== '!!')?.length ?? 0
          setDetectLabel(count > 0 ? `${count} lot${count > 1 ? 's' : ''} détecté${count > 1 ? 's' : ''} !` : 'Marché unique détecté')
          setDetectPhase('done')
          queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'lots'] })

          // Dismiss after 1.2s — doneRef stays true, overlay never comes back
          setTimeout(() => { setDetectPhase('idle'); setDetectPct(0) }, 1200)
        }
      } catch { /* ignore */ }
    }, 1000)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectPollRef.current) { clearInterval(detectPollRef.current); detectPollRef.current = null }
      if (detectCrawlRef.current) { clearInterval(detectCrawlRef.current); detectCrawlRef.current = null }
    }
  }, [])

  const allDetected = lotsData?.lots ?? project.lots_detectes ?? []
  const errorLots = allDetected.filter(l => l.sources?.includes('error'))
  const [lots, setLots] = useState<(LotOption & { _manual?: boolean })[]>([])
  const [lotsInitialized, setLotsInitialized] = useState(false)

  // Sync lots state once detection completes
  if (!lotsInitialized && !lotsLoading && allDetected.length > 0) {
    setLots(allDetected.filter(l => l.id !== '!!'))
    setLotsInitialized(true)
  }

  const [selectedId, setSelectedId] = useState<string>(
    project.selected_lot ?? 'all'
  )
  const [showAddForm, setShowAddForm] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [preparation, setPreparation] = useState<{ extracted: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const hasMultiLots = lots.length >= 2
  const highConfidenceCount = lots.filter(l => (l.confidence ?? 0) >= 80).length
  const selectedName = lots.find(l => l.id === selectedId)?.nom ?? null

  const handleDelete = (lotId: string) => {
    setLots(prev => prev.filter(l => l.id !== lotId))
    if (selectedId === lotId) setSelectedId('all')
  }

  const handleAddLot = (lot: LotOption & { _manual: true }) => {
    setLots(prev => {
      if (prev.some(l => l.id === lot.id)) return prev
      return [...prev, lot]
    })
    setSelectedId(lot.id)
    setShowAddForm(false)
  }

  const { mutateAsync: selectLot } = useMutation({
    mutationFn: (payload: { lot_id: string | null; lot_name: string | null }) =>
      api.post(`/projects/${project.id}/lots/select`, payload),
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
    if (plan === 'free') {
      setShowPaywall(true)
      return
    }
    setAnalysisError(null)

    // Create abort controller for this analysis run
    const abort = new AbortController()
    abortRef.current = abort

    try {
      await selectLot({
        lot_id: selectedId === 'all' ? null : selectedId,
        lot_name: selectedId === 'all' ? null : selectedName,
      })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })

      // Show overlay immediately
      setIsAnalyzing(true)

      // ── Wait for ALL documents to have extracted_text (phase 2) ──────
      let ready = false
      while (!ready) {
        if (abort.signal.aborted) return
        const { data } = await api.get<{ total: number; extracted: number; ready: boolean }>(
          `/projects/${project.id}/extraction-status`,
        )
        setPreparation({ extracted: data.extracted, total: data.total })
        if (data.ready) {
          ready = true
        } else {
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
      if (abort.signal.aborted) return
      // Clear preparation state — switch overlay to analysis animation
      setPreparation(null)

      await api.post(`/projects/${project.id}/analyze`, {}, {
        timeout: 420_000,
        signal: abort.signal,
      })

      if (abort.signal.aborted) return
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      setIsSuccess(true)
    } catch (err) {
      if (abort.signal.aborted) return  // cancelled — already handled
      setIsAnalyzing(false)
      setIsSuccess(false)
      setPreparation(null)
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? "Erreur lors de l'analyse")
        : "Erreur lors de l'analyse"
      setAnalysisError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  return (
    <>
      <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="analysis" />

      <AnalysisProgress
        isAnalyzing={isAnalyzing}
        isSuccess={isSuccess}
        onComplete={() => navigate(`/projects/${project.id}/analysis`)}
        onCancel={handleCancel}
        preparation={preparation}
      />

      {/* Lot detection progress overlay */}
      {detectPhase !== 'idle' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(6,9,15,0.95)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card p-8 max-w-sm">
            <LoadingProgress
              progress={Math.round(detectPct)}
              label={detectLabel}
              variant="upload"
            />
          </div>
        </div>,
        document.body,
      )}

      <div className="glass-card p-6 space-y-6">
        {isBackendBusy && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.20)' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#3B82F6' }} />
            <div>
              <span className="text-sm block" style={{ color: '#60A5FA' }}>
                Extraction des documents en cours...
              </span>
              {processingDetail && (
                <span className="text-xs block mt-0.5" style={{ color: '#8B95A9', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                  {processingDetail}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ds-text">Étape 2 — Sélection du lot</h2>
            <p className="text-sm text-ds-text-2 mt-1">
              {hasMultiLots
                ? 'Plusieurs lots ont été détectés. Sélectionnez le lot pour lequel vous répondez.'
                : lots.length === 1
                  ? 'Un seul lot a été détecté. Confirmez ou ajoutez des lots manuellement.'
                  : "Cet appel d'offres semble être mono-lot. Vous pouvez passer cette étape ou ajouter les lots manuellement."}
            </p>
          </div>

          {/* High-confidence counter */}
          {lots.length > 0 && (
            <div
              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(59,130,246,0.10)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.20)' }}
            >
              {highConfidenceCount}/{lots.length} fiable{highConfidenceCount > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* AMÉLIORATION 3: password-protected Excel warning */}
        {errorLots.length > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#F59E0B' }}>Fichier(s) Excel protégé(s) par mot de passe</p>
              {errorLots.map(l => (
                <p key={l.id} className="text-xs mt-0.5" style={{ color: '#FCD34D' }}>{l.nom}</p>
              ))}
            </div>
          </div>
        )}

        {/* Lot list */}
        {lots.length > 0 ? (
          <div className="space-y-2">
            {/* All lots option */}
            <LotCard
              lot={{ id: 'all', nom: "Tous les lots — Analyser l'ensemble du DCE" }}
              selected={selectedId === 'all'}
              onSelect={() => setSelectedId('all')}
              icon={<Layers size={18} />}
            />
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                selected={selectedId === lot.id}
                onSelect={() => setSelectedId(lot.id)}
                onDelete={() => handleDelete(lot.id)}
              />
            ))}
          </div>
        ) : !lotsInitialized && (lotsLoading || detectPhase === 'detecting' || isBackendBusy) ? (
          /* Still loading / detecting — don't show "Marché unique" yet */
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.20)' }}
          >
            <Loader2 size={20} className="animate-spin" style={{ color: '#3B82F6' }} />
            <div>
              <p className="text-sm font-medium text-ds-text">Détection des lots en cours...</p>
              <p className="text-xs text-ds-text-2 mt-0.5">
                Analyse des documents du DCE.
              </p>
            </div>
          </div>
        ) : (
          /* Detection done, genuinely no lots found */
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.20)' }}
          >
            <Layers size={20} style={{ color: '#3B82F6' }} />
            <div>
              <p className="text-sm font-medium text-ds-text">Marché unique (pas de lots)</p>
              <p className="text-xs text-ds-text-2 mt-0.5">
                L'IA analysera l'intégralité du DCE sans filtre par lot.
              </p>
            </div>
          </div>
        )}

        {/* Add lot manually */}
        {showAddForm ? (
          <AddLotForm onAdd={handleAddLot} onCancel={() => setShowAddForm(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed text-sm transition-all duration-200 hover:bg-white/[0.02]"
            style={{ borderColor: 'rgba(96,165,250,0.30)', color: '#60A5FA' }}
          >
            <Plus size={16} />
            Ajouter un lot manuellement
          </button>
        )}

        {/* Selected lot recap */}
        {selectedId !== 'all' && selectedName && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.20)' }}
          >
            <CheckCircle2 size={15} style={{ color: '#60A5FA' }} />
            <span style={{ color: '#60A5FA' }}>
              Lot sélectionné : <strong>{selectedName}</strong>
            </span>
          </div>
        )}

        {/* Error */}
        {analysisError && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{analysisError}</span>
          </div>
        )}

        {/* CTA */}
        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={() => navigate(`/projects/${project.id}/upload`)}
            className="text-sm text-ds-text-2 hover:text-ds-text transition-colors"
          >
            ← Retour
          </button>
          <button
            onClick={handleLaunch}
            disabled={isAnalyzing || isSuccess}
            className="btn-primary flex items-center gap-2 px-6 py-2.5"
          >
            <Zap size={16} />
            Lancer l&apos;analyse IA →
          </button>
        </div>
      </div>
    </>
  )
}
