import { useState, useEffect, useRef } from 'react'
import { choixParDefaut, basculerLot, peutLancer } from '@/lib/choixLots'
import { etiquettesSourceLot, lotsAAfficher, phraseLotsEcartes, type LotsEcartes } from '@/lib/lotsSource'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Layers, CheckCircle2, AlertCircle, Plus, X, ArrowLeft,
  AlertTriangle, Loader2,
  Sparkles, Pencil, Check as CheckIcon,
} from 'lucide-react'
import { BoutonSecondaire } from '@/components/project/BarreEtape'
import { GabaritEtape, BandeResume, SectionEtape, EtatElement, BarreEtape, ActionsBarre, ActionsBarreTel, BilanBarre } from '@/components/etape'
import { METIERS } from '@/lib/entreprise/metiers'
import { metiersDuLot } from '@/lib/lotsMetiers'
import { repartirDocuments } from '@/lib/analyseLibelles'
import { Button } from '@/components/ui/button'
import { repartirLotsParMetiers, libelleUnites } from '@/lib/lotsMetiers'
import type { MemoireConfig } from '@/types'
import { api } from '@/services/api'
import EcransLecture from '@/components/project/EcransLecture'
import { useLancerLecture } from '@/hooks/useLancerLecture'
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import type { Project, LotOption } from '@/types'

const LOT_DETECTION_STEPS: StepDescriptor[] = [
  { key: 'detecting_lots', label: 'Détection des lots', estimated_s: 30 },
]

import { cn } from '@/lib/utils'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

interface Props { project: Project }

interface LotCardProps {
  lot: LotOption & { _manual?: boolean }
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
  onRename?: (newLabel: string) => void
  /** Coût de la lecture de ce lot, en unités d'abonnement (« 1 unité »). */
  cout?: string
  /** Les pièces lues pour ce lot (communes + propres au lot) : nombre et « Voir ». */
  pieces?: { file_name: string }[]
}

/* A lot label is "generic" when the detector found a number but no
 * description (e.g. "Lot 6" or "Lot 06A"). The UI offers an inline edit
 * for those — for everything else the label is shown as-is. */
function isGenericLotLabel(label: string): boolean {
  const trimmed = label.trim()
  return /^Lot\s+[0-9A-Za-z]+\s*$/i.test(trimmed)
}

/** « Lot 5 — Revêtement de façade » → { num: '05', title: 'Revêtement de façade' } */
function splitLotLabel(label: string): { num: string | null; title: string } {
  const m = label.trim().match(/^lot\s+(\d{1,3}[A-Za-z]?)\s*(?:[—–:-]\s*)?(.*)$/i)
  if (!m) return { num: null, title: label.trim() }
  const title = m[2]?.trim()
  return { num: m[1].padStart(2, '0'), title: title || label.trim() }
}

function LotCard({ lot, selected, onSelect, onDelete, onRename, cout, pieces }: LotCardProps) {
  // We deliberately do NOT show a Synorix-internal sequential number
  // (e.g. "LOT 06") next to the real DCE label — it confused users by
  // implying two competing numbering systems. lot.nom already starts
  // with the correct DCE number ("Lot 5 — …") when available.
  const displayedLabel = lot.user_label?.trim() || lot.nom
  const isGeneric = !lot.user_label && isGenericLotLabel(displayedLabel)
  const { num: lotNum, title: lotTitle } = splitLotLabel(displayedLabel)

  const [voirPieces, setVoirPieces] = useState(false)
  const metiers = lot.id === 'all' ? [] : metiersDuLot(displayedLabel).map((c) => METIERS.find((m) => m.code === c)?.libelle ?? c)
  const sources = etiquettesSourceLot(lot.sources).map((l) => l.replace(/^Vu dans /, ''))
  const parIA = (lot.sources ?? []).includes('ia_fallback')
  const aVerifier = (lot.confidence !== undefined && lot.confidence < 80) || parIA
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
      {/* Une div à rôle « button » et non un vrai bouton : la carte contient « Renommer ». Un bouton dans un bouton
          est du HTML invalide (clavier et lecteurs d'écran peu fiables, R7). */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect() }
        }}
        className={cn(
          'w-full flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer',
          selected ? '' : 'bg-ds-bg-3 hover:bg-ds-bg-elevated',
        )}
        style={{
          background: selected ? 'var(--accent-tint)' : undefined,
          border: '1px solid',
          borderColor: selected ? 'var(--accent-ring)' : 'var(--line)',
          boxShadow: selected
            ? '0 0 0 1px var(--accent-ring)'
            : 'var(--edge-light)',
        }}
      >
        {/* Case à cocher visible : cible de 44 px, l'état est aussi dit par aria-pressed de la carte */}
        <span aria-hidden="true" className="-my-1 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
          <span
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-2 transition-colors"
            style={selected ? { borderColor: 'var(--accent-ring)', background: 'var(--accent-fill-solid)', color: 'var(--on-accent)' } : { borderColor: 'var(--text-3)', background: 'var(--surface-0)' }}
          >
            {selected && <CheckIcon size={14} strokeWidth={3} />}
          </span>
        </span>
        {lotNum && (
          <span
            className="num-mono shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-bold tracking-wide"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}
          >
            LOT {lotNum}
          </span>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1 basis-40">
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
                className="glass-btn text-ds-text w-8 h-8 rounded-lg flex items-center justify-center"
                title="Enregistrer"
              >
                <CheckIcon size={14} />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--surface-1)', color: 'var(--text-3)' }}
                title="Annuler"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[15px] font-semibold"
                  style={{
                    color: isGeneric ? 'var(--text-3)' : 'var(--text-1)',
                    fontStyle: isGeneric ? 'italic' : 'normal',
                  }}
                >
                  {isGeneric ? (
                    <>
                      {displayedLabel}
                      <span style={{ color: 'var(--text-3)' }}> — Description à compléter</span>
                    </>
                  ) : lotNum ? lotTitle : displayedLabel}
                </span>
                {lot._manual && (
                  <span
                    className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--text-1)', background: 'color-mix(in srgb, var(--text-1) 8%, transparent)' }}
                  >
                    Manuel
                  </span>
                )}
                {onRename && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded transition-colors"
                    style={{ color: 'var(--text-3)', background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    title="Renommer ce lot"
                  >
                    <Pencil size={11} /> Renommer
                  </button>
                )}
              </div>
              {lot.tranches && lot.tranches.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium mt-1 px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--text-1)', background: 'color-mix(in srgb, var(--text-1) 8%, transparent)' }}
                  title={lot.tranches.join('\n')}
                >
                  {lot.tranches.length} tranche{lot.tranches.length > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>

        {cout && <span className="shrink-0 whitespace-nowrap text-sm font-medium text-fg-2 max-sm:basis-full">{cout}</span>}

        {/* Sous le titre : métiers reconnus, pièces du lot, état en petit */}
        <div className="basis-full space-y-2 pl-1 sm:pl-[3.25rem]" onClick={(e) => e.stopPropagation()}>
          {metiers.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-fg-2">
              <span>{metiers.length > 1 ? 'Métiers reconnus' : 'Métier reconnu'} :</span>
              {metiers.map((m) => <span key={m} className="pill pill-muted">{m}</span>)}
            </p>
          )}
          {pieces && (
            <div className="text-sm text-fg-2">
              <p className="flex flex-wrap items-center gap-x-2">
                <span>{pieces.length} {pieces.length > 1 ? 'pièces lues' : 'pièce lue'} pour ce lot</span>
                {pieces.length > 0 && (
                  <button type="button" aria-expanded={voirPieces} onClick={() => setVoirPieces((v) => !v)}
                    className="inline-flex min-h-9 items-center rounded-xs font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11">
                    {voirPieces ? 'Masquer' : 'Voir'}
                  </button>
                )}
              </p>
              {voirPieces && <ul className="mt-1 space-y-0.5 text-xs text-fg-3">{pieces.map((d) => <li key={d.file_name} className="break-words">{d.file_name}</li>)}</ul>}
            </div>
          )}
          {lot.id !== 'all' && (
            <EtatElement
              etat={aVerifier ? 'a-verifier' : 'pret'}
              source={parIA ? { libelle: 'complété par l’IA : vérifiez l’intitulé' } : sources.length > 0 ? { libelle: sources.join(' · ') } : undefined}
            />
          )}
        </div>
      </div>

      {/* Delete */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
          style={{ color: 'var(--danger-fg)', background: 'color-mix(in srgb, var(--danger-fg) 6%, transparent)' }}
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
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)' }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>N° lot</label>
        <input
          type="number" min={1} max={30} placeholder="1"
          value={num} onChange={(e) => setNum(e.target.value)}
          className="w-16 text-sm rounded-lg px-2.5 py-2 outline-none"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--text-1)' }}
          required
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Intitulé (optionnel)</label>
        <input
          type="text" placeholder="ex : Gros œuvre"
          value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60}
          className="text-sm rounded-lg px-2.5 py-2 outline-none"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--text-1)' }}
        />
      </div>
      <button type="submit" disabled={!num}
        className="glass-btn text-ds-text px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 shrink-0">
        Ajouter
      </button>
      <button type="button" onClick={onCancel}
        className="px-3 py-2 text-sm shrink-0 transition-colors"
        style={{ color: 'var(--text-3)' }}>
        Annuler
      </button>
    </form>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StepLotSelection({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // 1.13 — un lot ne disparaît pas de la liste en un clic
  const [lotARetirer, setLotARetirer] = useState<LotOption | null>(null)
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
      const { data } = await api.get<{ lots?: LotOption[]; count?: number; cached?: boolean; status?: string; progress?: number; detail?: string; ecartes?: LotsEcartes | null }>(`/projects/${project.id}/lots`)
      if (data.status === 'detecting_lots') {
        if (!detectDoneRef.current) {
          setDetectPhase('detecting')
          setDetectLabel(data.detail || 'Détection des lots en cours...')
        }
        return null
      }
      queryClient.invalidateQueries({ queryKey: ['projects', project.id], exact: true })
      return data as { lots: LotOption[]; count: number; ecartes?: LotsEcartes | null }
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
          ? `${count} lot${count > 1 ? 's' : ''} détecté${count > 1 ? 's' : ''}`
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

  const allDetected = lotsAAfficher(lotsData, project.lots_detectes)
  const errorLots = allDetected.filter(l => l.sources?.includes('error'))
  const [lots, setLots] = useState<(LotOption & { _manual?: boolean })[]>([])
  const [lotsInitialized, setLotsInitialized] = useState(false)

  if (!lotsInitialized && !lotsLoading && allDetected.length > 0) {
    setLots(allDetected.filter(l => l.id !== '!!'))
    setLotsInitialized(true)
  }

  // Multi-sélection : cliquer une carte AJOUTE/RETIRE le lot ; « tous les
  // lots » est exclusif. 1 POST /analyze = N lots (tronc commun mutualisé).
  // R6 : plusieurs lots → aucun choix tant que le patron n'a pas cliqué.
  const [choix, setChoix] = useState<Set<string> | null>(null)
  const selectedIds = choix ?? choixParDefaut(project.selected_lot, lots.length)
  const toggleLot = (lotId: string) => {
    setChoix(basculerLot(selectedIds, lotId, lots.length))
  }
  const selectedLotIds = [...selectedIds].filter(id => id !== 'all')
  const selectedId = selectedLotIds[0] ?? 'all'
  const aucunChoix = !peutLancer(selectedIds)
  const [showAddForm, setShowAddForm] = useState(false)
  const lecture = useLancerLecture(project)
  const { isAnalyzing, isSuccess, analysisError } = lecture

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

  const handleLaunch = () => {
    if (!peutLancer(selectedIds)) return
    void lecture.lancer(selectedLotIds, selectedName)
  }

  // « Dans vos métiers » : les lots rattachés aux métiers déclarés dans Mon entreprise d'abord, les autres repliés
  const { data: profil } = useQuery<MemoireConfig>({
    queryKey: ['memoire-config'],
    queryFn: async () => (await api.get<MemoireConfig>('/memoire-config')).data,
    staleTime: 60_000,
  })
  // Les pièces du dossier : le nombre de pièces lues pour chaque lot (communes + propres au lot) et leur liste
  const { data: documents = [] } = useQuery<{ file_name: string; related_lots?: string[] | null }[]>({
    queryKey: ['project-documents', project.id],
    queryFn: async () => (await api.get(`/projects/${project.id}/documents`)).data,
    staleTime: 30_000,
  })
  const piecesDuLot = (lotId: string) => repartirDocuments(documents, lotId, lots.map((l) => l.id)).analyses
  const { dansVosMetiers, autres, separes } = repartirLotsParMetiers(lots, profil?.metiers)
  const [autresOuverts, setAutresOuverts] = useState(false)
  // Un lot déjà choisi parmi les autres ne reste jamais caché
  const autresVisibles = autresOuverts || autres.some((l) => selectedIds.has(l.id))
  const nbChoisis = selectedIds.has('all') ? lots.length : selectedLotIds.length
  const carteLot = (lot: LotOption & { _manual?: boolean }) => (
    <LotCard
      key={lot.id}
      lot={lot}
      selected={selectedIds.has(lot.id)}
      onSelect={() => toggleLot(lot.id)}
      onDelete={() => setLotARetirer(lot)}
      onRename={(label) => renameLot({ lotId: lot.id, label })}
      cout={libelleUnites(1)}
      pieces={piecesDuLot(lot.id)}
    />
  )

  /* ════════════════════════════════════════════════════════════════
     JSX
     ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <EcransLecture lecture={lecture} />
      {lotARetirer && (
        <DeleteConfirmModal
          title={`Retirer « ${lotARetirer.user_label || lotARetirer.nom} » de la liste ?`}
          detail="Vous pourrez l'ajouter de nouveau à la main."
          libelleConfirmer="Retirer"
          onConfirm={() => { handleDelete(lotARetirer.id); setLotARetirer(null) }}
          onCancel={() => setLotARetirer(null)}
        />
      )}

      {/* Lot detection overlay (inline circle wrapped in our own portal) */}
      {detectPhase !== 'idle' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-8 max-w-sm w-full mx-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', boxShadow: '0 20px 60px color-mix(in srgb, var(--surface-dark) 15%, transparent)' }}>
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
        <GabaritEtape
          titre="Lots"
          utilite={lots.length > 1
            ? 'Choisissez le ou les lots sur lesquels votre entreprise répond : Synorix ne lit que ceux-là. Chaque lot lu décompte 1 unité de votre abonnement.'
            : lots.length === 1
              ? 'Un seul lot a été détecté. Confirmez-le ou ajoutez des lots à la main ; la lecture décompte 1 unité de votre abonnement.'
              : 'Cet appel d’offres semble être mono-lot : lancez la lecture du dossier, ou ajoutez les lots à la main. Chaque lot lu décompte 1 unité.'}
          actionPrincipale={
            <Button type="button" variant="signature" onClick={handleLaunch} disabled={isAnalyzing || isSuccess || !peutLancer(selectedIds)}>
              <Sparkles size={16} aria-hidden />
              Lire ce dossier{selectedLotIds.length > 1 ? ` (${selectedLotIds.length} lots)` : ''}
            </Button>
          }
          resume={lots.length > 0 ? <BandeResume libelle="Les lots du dossier" cartes={[
            { libelle: 'Lots détectés', valeur: String(lots.length), etat: 'neutre', detail: 'Dans le dossier de l’acheteur.' },
            { libelle: 'Lots choisis', valeur: String(nbChoisis), etat: nbChoisis > 0 ? 'pret' : 'a-verifier', jauge: { rempli: nbChoisis, total: lots.length }, detail: nbChoisis > 0 ? undefined : 'Cochez au moins un lot pour lancer la lecture.' },
            { libelle: 'Coût de la lecture', valeur: libelleUnites(nbChoisis), etat: 'neutre', detail: '1 lot lu = 1 unité de votre abonnement.' },
            ...(separes ? [{ libelle: 'Dans vos métiers', valeur: String(dansVosMetiers.length), etat: 'neutre' as const, detail: 'Selon les métiers de Mon entreprise.' }] : []),
          ]} /> : undefined}
          barre={
        <BarreEtape>
          <BilanBarre
            className="gap-2"
            bureau={<>
              <CheckCircle2 size={16} style={{ color: selectedId !== 'all' && selectedName ? 'var(--text-1)' : 'var(--text-3)' }} />
              <span className="text-sm" style={{ color: 'var(--text-3)' }}>
                {selectedId !== 'all' && selectedName
                  ? <>Lot sélectionné : <strong style={{ color: 'var(--text-1)' }}>{selectedName}</strong></>
                  : aucunChoix ? 'Aucun lot choisi' : 'Tous les lots sélectionnés'
                }
              </span>
            </>}
            tel={<>
              <CheckCircle2 size={16} className="shrink-0" style={{ color: selectedId !== 'all' && selectedName ? 'var(--text-1)' : 'var(--text-3)' }} />
              <span className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                {selectedLotIds.length > 1 ? `${selectedLotIds.length} lots` : selectedId !== 'all' && selectedName ? selectedName : aucunChoix ? 'Aucun lot choisi' : 'Tous les lots'}
              </span>
            </>}
          />
          <ActionsBarre>
            <BoutonSecondaire libelle="Retour" icone={ArrowLeft} onClick={() => navigate(`/projects/${project.id}/upload`)} />
            <ActionsBarreTel>
              <button
                onClick={handleLaunch}
                disabled={isAnalyzing || isSuccess || !peutLancer(selectedIds)}
                className="signature-btn whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed [@media(pointer:coarse)]:min-h-11"
              >
                <Sparkles size={16} aria-hidden />
                <span>Lire ce dossier</span>
              </button>
            </ActionsBarreTel>
          </ActionsBarre>
        </BarreEtape>
          }
        >
        {/* Backend busy */}
        {isBackendBusy && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--text-1) 5%, transparent)', border: '1px solid var(--border-2)' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-1)' }} />
            <div>
              <span className="text-sm font-medium block" style={{ color: 'var(--text-1)' }}>Extraction des documents en cours...</span>
              {processingDetail && <span className="text-xs block mt-0.5" style={{ color: 'var(--text-3)' }}>{processingDetail}</span>}
            </div>
          </div>
        )}

        {/* Documents illisibles — signalés par fichier, jamais silencieux */}
        {extractionWarnings.length > 0 && (
          <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--warning-fg) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--warning-fg) 22%, transparent)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle size={16} style={{ color: 'var(--warning-fg)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--warning-fg)' }}>
                {extractionWarnings.length} document{extractionWarnings.length > 1 ? 's' : ''} illisible{extractionWarnings.length > 1 ? 's' : ''} — exigences non extraites de ce{extractionWarnings.length > 1 ? 's' : ''} fichier{extractionWarnings.length > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-0.5 pl-6">
              {extractionWarnings.map((w) => (
                <li key={w.file_name} className="break-words text-xs" style={{ color: 'var(--warning-fg)' }}>
                  <span className="font-medium">{w.file_name}</span> — {w.warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* R9 — les lots cités dans le dossier mais non proposés : le nombre et la raison, sans nom de lot. */}
        {phraseLotsEcartes(lotsData?.ecartes) && (
          <p data-lots-ecartes className="text-sm" style={{ color: 'var(--text-3)' }}>{phraseLotsEcartes(lotsData?.ecartes)}</p>
        )}

        {/* Excel error */}
        {errorLots.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--text-3) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text-3) 15%, transparent)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Fichier(s) Excel protégé(s) par mot de passe</p>
              {errorLots.map(l => <p key={l.id} className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{l.nom}</p>)}
            </div>
          </div>
        )}

        {/* ── LOT LIST ────────────────────────────────────── */}
        {lots.length > 0 ? (
          <>
            {separes ? (
              <>
                <SectionEtape titre="Dans vos métiers" colonnes={2}>{dansVosMetiers.map(carteLot)}</SectionEtape>
                <SectionEtape
                  titre="Autres lots"
                  colonnes={2}
                  action={
                    <button type="button" aria-expanded={autresVisibles} onClick={() => setAutresOuverts((o) => !o)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-xs text-sm font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11">
                      {autresVisibles ? 'Replier' : `Afficher les ${autres.length} autres lots`}
                    </button>
                  }
                >
                  {autresVisibles && autres.map(carteLot)}
                </SectionEtape>
              </>
            ) : (
              <SectionEtape titre="Lots du dossier" colonnes={2}>{lots.map(carteLot)}</SectionEtape>
            )}
            <SectionEtape titre="Ou tout le dossier">
              <LotCard
                lot={{ id: 'all', nom: "Analyser l'ensemble du dossier (tous les lots)" }}
                selected={selectedIds.has('all')}
                onSelect={() => toggleLot('all')}
                cout={libelleUnites(lots.length)}
                pieces={documents}
              />
            </SectionEtape>
          </>
        ) : !lotsInitialized && (lotsLoading || detectPhase === 'detecting' || isBackendBusy) ? (
          <div className="flex items-center gap-3 p-5 rounded-xl" style={{ background: 'color-mix(in srgb, var(--text-1) 4%, transparent)', border: '1px solid var(--border-2)' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-1)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Détection des lots en cours...</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Analyse des documents du dossier.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-5 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)' }}>
            <Layers size={20} style={{ color: 'var(--text-1)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Marché unique (pas de lots)</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>L&apos;IA analysera l&apos;intégralité du dossier sans filtre par lot.</p>
            </div>
          </div>
        )}

        {/* Add lot */}
        {showAddForm ? (
          <AddLotForm onAdd={handleAddLot} onCancel={() => setShowAddForm(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--surface-1)', color: 'var(--text-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-3)'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'var(--surface-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--surface-1)'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent' }}
          >
            <Plus size={16} />
            Un lot du dossier manque à la liste ? Ajoutez-le à la main
          </button>
        )}

        {/* Error */}
        {analysisError && (
          <div className="flex items-start gap-2 p-4 rounded-xl text-sm" style={{ color: 'var(--danger-fg)', background: 'color-mix(in srgb, var(--danger-fg) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--danger-fg) 15%, transparent)' }}>
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{analysisError}</span>
          </div>
        )}
        </GabaritEtape>
      </div>
    </>
  )
}
