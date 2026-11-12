import { useState, useEffect, useRef, type ReactNode } from 'react'
import { choixParDefaut, basculerLot, lotAOuvrir, peutLancer } from '@/lib/choixLots'
import { etiquettesSourceLot, lotsAAfficher, phraseLotsEcartes, type LotsEcartes } from '@/lib/lotsSource'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check as CheckIcon, CircleHelp, Pencil, Plus, X } from 'lucide-react'
import { GabaritEtape, SectionEtape, BarreEtape, ActionsBarre, ActionsBarreTel, BilanBarre } from '@/components/etape'
import { EtapeSansAnalyse } from '@/components/project/EtapeSansAnalyse'
import { SqueletteListe } from '@/components/project/SqueletteListe'
import { METIERS } from '@/lib/entreprise/metiers'
import { metiersDuLot } from '@/lib/lotsMetiers'
import { repartirDocuments } from '@/lib/analyseLibelles'
import { doitConfirmerLecture, libelleBoutonLire, phraseCoutLots } from '@/lib/coutLecture'
import ConfirmationLecture from '@/components/project/LectureLots'
import { repartirLotsParMetiers, libelleUnites } from '@/lib/lotsMetiers'
import type { MemoireConfig } from '@/types'
import { api } from '@/services/api'
import EcransLecture from '@/components/project/EcransLecture'
import { useLancerLecture } from '@/hooks/useLancerLecture'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { Sigle } from '@/components/common/Sigle'
import { useProgressStream } from '@/hooks/useProgressStream'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { Champ, ChampNombre, GroupeChamp } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue'
import { EtatErreur } from '@/components/ui/etats'
import { Infobulle } from '@/components/ui/infobulle'
import { MenuElement, MenuPoints } from '@/components/ui/menu'
import { Message } from '@/components/ui/message'
import type { Project, LotOption } from '@/types'
import { cn } from '@/lib/utils'

const LOT_DETECTION_STEPS: StepDescriptor[] = [
  { key: 'detecting_lots', label: 'Détection des lots', estimated_s: 30 },
]

const UTILITE = 'Choisissez le ou les lots sur lesquels votre entreprise répond : Synorix n’analyse que ceux-là.'

interface Props { project: Project }

interface LotCardProps {
  lot: LotOption & { _manual?: boolean }
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
  onRename?: (newLabel: string) => void
  /** Coût de l’analyse de ce lot, en unités d'abonnement (« 1 unité »). */
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

export function LotCard({ lot, selected, onSelect, onDelete, onRename, cout, pieces }: LotCardProps) {
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

  const startEdit = () => {
    setDraft(lot.user_label ?? '')
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const saveEdit = () => {
    const value = draft.trim()
    if (value && onRename) onRename(value)
    setIsEditing(false)
  }
  const aUnMenu = !isEditing && (onRename || onDelete)

  const tranches = lot.tranches ?? []
  const tout = lot.id === 'all'

  // UNE ligne de la liste (jury, tour 1 : treize cartes identiques, « Prêt » treize fois) : la case, le numéro, l'intitulé,
  // les métiers en texte, les pièces lues à droite. Seule l'exception est marquée (« À vérifier », « Ajouté à la main ») ;
  // d'où vient le lot se lit dans le détail (« Voir »), pas sur chaque ligne.
  return (
    <div data-lot={lot.id} className={cn('relative transition-colors duration-survol ease-survol', selected ? 'bg-accent-tint' : 'hover:bg-surface-1')}>
      {/* Une div à rôle « button » et non un vrai bouton : la ligne contient d'autres boutons (« Voir », le menu). Un bouton
          dans un bouton est du HTML invalide (clavier et lecteurs d'écran peu fiables, R7). */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect() }
        }}
        className={cn('flex w-full cursor-pointer flex-wrap items-start gap-x-2 px-4 py-1.5 text-left max-sm:px-3', aUnMenu && 'pr-14 max-sm:pr-12')}
      >
        {/* Case à cocher dessinée : cible de 44 px, l'état est aussi dit par aria-pressed de la ligne */}
        <span aria-hidden="true" className="-ml-2 grid size-11 shrink-0 place-items-center">
          <span className={cn(
            'grid size-5 place-items-center rounded border transition-colors duration-fast ease-survol',
            selected ? 'border-accent-ui bg-accent-ui text-accent-on' : 'border-bord-champ bg-surface-0',
          )}>
            {selected && <CheckIcon size={14} strokeWidth={3} />}
          </span>
        </span>

        <div className="min-w-0 flex-1 basis-40 py-2.5">
          {isEditing ? (
            <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Champ
                ref={inputRef}
                aria-label={`Intitulé de ${displayedLabel}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                placeholder={`${displayedLabel} : l’intitulé du lot`}
                maxLength={200}
                className="h-11 min-w-0 flex-1 basis-48"
              />
              <Bouton variante="secondaire" onClick={saveEdit}>Enregistrer</Bouton>
              <Bouton variante="discret" onClick={() => setIsEditing(false)}>Annuler</Bouton>
            </div>
          ) : (
            <>
              <p className="flex items-baseline gap-x-2 text-base text-fg max-sm:flex-wrap">
                {lotNum && <span className="chiffres shrink-0 font-medium text-fg-2 sm:w-14">Lot {lotNum}</span>}
                <span className="min-w-0 break-words font-semibold">
                  {isGeneric ? <span className="font-medium text-fg-2">Intitulé à préciser</span> : lotNum ? lotTitle : displayedLabel}
                </span>
              </p>
              {(metiers.length > 0 || tranches.length > 0 || lot._manual || aVerifier) && (
                <p className={cn('mt-0.5 text-sm text-fg-2', lotNum && 'sm:pl-16')}>
                  {metiers.length > 0 && (
                    <span>
                      <span className="sr-only">{metiers.length > 1 ? 'Métiers reconnus' : 'Métier reconnu'} : </span>
                      {metiers.join(' · ')}
                    </span>
                  )}
                  {tranches.length > 0 && (
                    <>
                      {metiers.length > 0 && ' · '}
                      <Infobulle texte={tranches.join(' · ')}>
                        <span tabIndex={0} className="whitespace-nowrap rounded-xs" onClick={(e) => e.stopPropagation()}>
                          {tranches.length} tranche{tranches.length > 1 ? 's' : ''}
                        </span>
                      </Infobulle>
                    </>
                  )}
                  {lot._manual && <span className="whitespace-nowrap">{(metiers.length > 0 || tranches.length > 0) && ' · '}Ajouté à la main</span>}
                  {/* La seule marque d'état de la liste : l'exception. Un lot sans réserve ne porte rien. */}
                  {aVerifier && (
                    <span data-etat="a-verifier" className={cn('inline-flex items-center gap-1.5 whitespace-nowrap align-middle font-medium text-ambre-ink', (metiers.length > 0 || tranches.length > 0 || lot._manual) && 'ml-3')}>
                      <CircleHelp size={14} aria-hidden />
                      {parIA ? 'Intitulé à vérifier' : 'À vérifier'}
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </div>

        {/* À droite : les pièces lues pour ce lot (jamais un chiffre tant qu'elles ne sont pas comptées) et le coût */}
        <div className="flex min-h-11 shrink-0 items-center gap-x-3 whitespace-nowrap text-sm text-fg-2 max-sm:-mt-2 max-sm:min-h-0 max-sm:basis-full max-sm:pl-9" onClick={(e) => e.stopPropagation()}>
          {pieces && pieces.length > 0 && (
            <>
              <span className="chiffres">{pieces.length} {pieces.length > 1 ? 'pièces lues' : 'pièce lue'}{tout ? ' dans le dossier' : ''}</span>
              <Bouton variante="lien" aria-expanded={voirPieces} onClick={() => setVoirPieces((v) => !v)}>
                {voirPieces ? 'Masquer' : 'Voir'}
              </Bouton>
            </>
          )}
          {cout && <span className="font-medium">{cout}</span>}
        </div>

        {voirPieces && pieces && (
          <div className="min-w-0 basis-full pb-3 pl-9 text-sm text-fg-2 sm:pl-[6.25rem]" onClick={(e) => e.stopPropagation()}>
            {!tout && (parIA || sources.length > 0) && (
              <p>{parIA ? 'Intitulé complété par l’IA : vérifiez-le dans le règlement.' : `Repéré dans ${sources.join(', ')}.`}</p>
            )}
            <ul className="mt-1.5 max-h-56 gap-x-6 overflow-y-auto text-xs text-fg-3 sm:columns-2">
              {pieces.map((d) => <li key={d.file_name} className="break-words py-0.5">{d.file_name}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Les gestes rares (renommer, retirer) : dans le menu de la ligne */}
      {aUnMenu && (
        <MenuPoints libelle={`Autres actions pour ${displayedLabel}`} className="absolute right-1.5 top-1.5">
          {onRename && <MenuElement onSelect={startEdit}><Pencil aria-hidden size={16} strokeWidth={1.5} />Renommer</MenuElement>}
          {onDelete && <MenuElement danger onSelect={onDelete}><X aria-hidden size={16} strokeWidth={1.5} />Retirer de la liste</MenuElement>}
        </MenuPoints>
      )}
    </div>
  )
}

/** La surface d'une liste de lots : un trait, des lignes séparées par un filet (une liste, pas une grille de cartes). */
function ListeLots({ children }: { children: ReactNode }) {
  return <div data-liste-lots="" className="divide-y divide-bord overflow-hidden rounded-carte border border-bord bg-surface-0">{children}</div>
}

// ─── Manual lot form ──────────────────────────────────────────────────────────

interface AddLotFormProps {
  onAdd: (lot: LotOption & { _manual: true }) => void
  onCancel: () => void
}

function AddLotForm({ onAdd, onCancel }: AddLotFormProps) {
  const [num, setNum] = useState<number | null>(null)
  const [label, setLabel] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = num === null ? 0 : Math.round(num)
    if (!n || n < 1 || n > 30) return
    const id = `lot${n}`
    const nom = label.trim() ? `Lot ${n} — ${label.trim()}` : `Lot ${n}`
    onAdd({ id, nom, confidence: undefined, sources: [], _manual: true })
    setNum(null)
    setLabel('')
  }

  return (
    <Carte>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3">
        <GroupeChamp libelle="Numéro du lot" aide="De 1 à 30" className="w-32">
          <ChampNombre valeur={num} onChange={setNum} min={1} max={30} placeholder="1" required />
        </GroupeChamp>
        <GroupeChamp libelle="Intitulé" facultatif aide="Par exemple : Gros œuvre" className="min-w-0 flex-1 basis-56">
          <Champ value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className="h-11" />
        </GroupeChamp>
        <div className="flex gap-2 pt-[1.6rem] max-sm:basis-full max-sm:pt-0">
          <Bouton variante="secondaire" type="submit" disabled={num === null}>Ajouter le lot</Bouton>
          <Bouton variante="discret" onClick={onCancel}>Annuler</Bouton>
        </div>
      </form>
    </Carte>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StepLotSelection({ project }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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
  const [detectLabel, setDetectLabel] = useState('Recherche des lots dans le règlement et les pièces du dossier…')
  const detectDoneRef = useRef(false)

  // Les pièces du dossier : le nombre de pièces lues pour chaque lot (communes + propres au lot) et leur liste. Elles disent
  // aussi si un dossier est déposé : sans dépôt, le serveur refuse la lecture des lots (400 « Aucun document déposé »,
  // backend/routers/projects.py), donc on ne la demande pas et l'écran invite à déposer.
  const requeteDocuments = useQuery<{ file_name: string; related_lots?: string[] | null }[]>({
    queryKey: ['project-documents', project.id],
    queryFn: async () => (await api.get(`/projects/${project.id}/documents`)).data,
    staleTime: 30_000,
  })
  const documents = requeteDocuments.data ?? []
  const sansDepot = requeteDocuments.isSuccess && documents.length === 0

  const requeteLots = useQuery({
    enabled: requeteDocuments.isSuccess && documents.length > 0,
    queryKey: ['projects', project.id, 'lots'],
    queryFn: async () => {
      const { data } = await api.get<{ lots?: LotOption[]; count?: number; cached?: boolean; status?: string; progress?: number; detail?: string; ecartes?: LotsEcartes | null }>(`/projects/${project.id}/lots`)
      if (data.status === 'detecting_lots') {
        if (!detectDoneRef.current) {
          setDetectPhase('detecting')
          setDetectLabel(data.detail || 'Recherche des lots dans le règlement et les pièces du dossier…')
        }
        return null
      }
      queryClient.invalidateQueries({ queryKey: ['projects', project.id], exact: true })
      return data as { lots: LotOption[]; count: number; ecartes?: LotsEcartes | null }
    },
  })
  const { data: lotsData, isLoading: lotsLoading } = requeteLots

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
          : 'Ce dossier n’a pas de lots')
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

  // Jamais avant que les pièces du dossier soient lues : la liste s'affichait avec « 0 pièce lue » sur chaque lot (jury, tour 1).
  if (!lotsInitialized && requeteDocuments.isSuccess && !lotsLoading && allDetected.length > 0) {
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

  // G1 — au-delà d'un lot, la lecture se confirme avant l'appel (« Lire N lots = N unités »)
  const [confirmerLecture, setConfirmerLecture] = useState(false)
  const lancerLecture = () => {
    setConfirmerLecture(false)
    void lecture.lancer(selectedLotIds, selectedName)
  }
  // Un seul lot coché, déjà analysé : « Ouvrir ce lot » le rend lot en cours (POST lots/select), sans le relire ni décompter
  // d'unité (rapport E2E-2 : l'Export d'un second lot lu n'était atteignable qu'en le relisant). Le relire reste possible.
  const aOuvrir = lotAOuvrir(selectedIds, project.lots_analyses)
  const ouverture = useMutation({
    mutationFn: (lotId: string) => api.post<Project>(`/projects/${project.id}/lots/select`, {
      lot_id: lotId, lot_name: lots.find((l) => l.id === lotId)?.nom ?? null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
      navigate(`/projects/${project.id}/analysis`)
    },
  })
  const analyser = () => {
    if (doitConfirmerLecture(nbChoisis)) setConfirmerLecture(true)
    else lancerLecture()
  }
  const handleLaunch = () => {
    if (!peutLancer(selectedIds)) return
    if (aOuvrir) { if (!ouverture.isPending) ouverture.mutate(aOuvrir); return }
    analyser()
  }

  // « Dans vos métiers » : les lots rattachés aux métiers déclarés dans Mon entreprise d'abord, les autres repliés
  const { data: profil } = useQuery<MemoireConfig>({
    queryKey: ['memoire-config'],
    queryFn: async () => (await api.get<MemoireConfig>('/memoire-config')).data,
    staleTime: 60_000,
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
      cout={project.lots_analyses?.includes(lot.id) ? 'Analysé' : libelleUnites(1)}
      pieces={piecesDuLot(lot.id)}
    />
  )

  // ── Ce que l'écran montre, dans l'ordre du motif de requête : erreur → rien de déposé → chargement → lots ──
  const chargementEchoue = (requeteLots.isError && lots.length === 0) || (requeteDocuments.isError && requeteDocuments.data === undefined)
  const enDetection = !lotsInitialized && (lotsLoading || requeteDocuments.isLoading || detectPhase === 'detecting' || isBackendBusy)
  const lectureBloquee = isAnalyzing || isSuccess || !peutLancer(selectedIds)
  // Le seul bouton « Lire … » de l'écran : dans l'en-tête à l'ordinateur, dans la barre du bas au téléphone. Un seul lot coché,
  // déjà analysé : il dit « Ouvrir ce lot » (handleLaunch, ci-dessus).
  const actionLire = (
    <Bouton variante="principal" onClick={handleLaunch} disabled={lectureBloquee}>
      {aOuvrir ? 'Ouvrir ce lot' : libelleBoutonLire(nbChoisis, lots.length)}
    </Bouton>
  )
  const peutLire = !sansDepot && !chargementEchoue && !enDetection
  const bilan = selectedLotIds.length > 1 ? `${selectedLotIds.length} lots choisis`
    : selectedId !== 'all' && selectedName ? `Lot choisi : ${selectedName}`
    : aucunChoix ? 'Aucun lot choisi' : 'Tout le dossier'
  const ecartes = phraseLotsEcartes(lotsData?.ecartes)
  // Le compte, en une ligne sous le titre de la liste (plus de cases « Lots détectés 13 / Lots choisis 1 » avec une jauge).
  const compte = `${lots.length} ${lots.length > 1 ? 'lots repérés' : 'lot repéré'} dans le dossier de l’acheteur · ${nbChoisis === 0 ? 'cochez au moins un lot pour lancer l’analyse' : nbChoisis > 1 ? `${nbChoisis} choisis` : '1 choisi'}`

  return (
    <>
      <EcransLecture lecture={lecture} />
      {/* G1 — « Lire N lots = N unités » : confirmée avant l'appel dès que plus d'un lot est choisi */}
      <ConfirmationLecture ouvert={confirmerLecture} onOuvert={setConfirmerLecture} nbLots={nbChoisis} onConfirmer={lancerLecture} />
      <DialogueConfirmation
        ouvert={lotARetirer !== null}
        onOuvert={(o) => { if (!o) setLotARetirer(null) }}
        danger
        titre={lotARetirer ? `Retirer « ${lotARetirer.user_label || lotARetirer.nom} » de la liste ?` : ''}
        description="Vous pourrez l’ajouter de nouveau à la main."
        libelleConfirmer="Retirer"
        onConfirmer={() => { if (lotARetirer) handleDelete(lotARetirer.id); setLotARetirer(null) }}
      />

      {detectPhase !== 'idle' && (
        <ProgressDisplay
          variant="modal"
          title="Synorix repère les lots du dossier"
          steps={LOT_DETECTION_STEPS}
          currentStep="detecting_lots"
          progress={detectPhase === 'done' ? 100 : detectSse.progress}
          detail={detectLabel}
          phase={detectPhase === 'done' ? 'complete' : 'in_progress'}
        />
      )}

      <GabaritEtape
        titre="Lots"
        utilite={enDetection || sansDepot || chargementEchoue ? UTILITE : phraseCoutLots(lots.length)}
        actionPrincipale={peutLire ? actionLire : undefined}
        actionsSecondaires={peutLire && aOuvrir ? (
          <Bouton variante="secondaire" onClick={analyser} disabled={lectureBloquee || ouverture.isPending}>{`Analyser de nouveau (${libelleUnites(1)})`}</Bouton>
        ) : undefined}
        message={ouverture.isError
          ? <Message ton="erreur" titre="Le lot ne s’est pas ouvert">La connexion au serveur a échoué. Rien n’a été décompté : réessayez dans un instant.</Message>
          : analysisError && <Message ton="erreur" titre="L’analyse n’a pas démarré">{analysisError}</Message>}
        // La barre du bas n'existe que lorsqu'il y a des lots à choisir : ni en erreur, ni sans dossier, ni pendant le chargement.
        barre={!peutLire ? undefined : (
          <BarreEtape>
            <BilanBarre bureau={bilan} tel={<span className="truncate">{bilan}</span>} />
            <ActionsBarre>
              {peutLire && <ActionsBarreTel>{actionLire}</ActionsBarreTel>}
            </ActionsBarre>
          </BarreEtape>
        )}
      >
        {isBackendBusy && (
          <Message ton="info" titre="Synorix finit de lire les pièces du dossier">
            {processingDetail || 'Les lots apparaissent dès que la lecture des pièces est terminée.'}
          </Message>
        )}

        {/* Documents illisibles : signalés par fichier, jamais silencieux */}
        {extractionWarnings.length > 0 && (
          // Une phrase, les noms, un geste (jury, tour 1 : cinq lignes répétaient « aucune couche texte lisible — exigences non
          // extraites », sans rien proposer). Le motif du serveur n'est pas recopié : il est dit en mots du métier.
          <Message ton="info"
            titre={extractionWarnings.length > 1
              ? `${extractionWarnings.length} documents n’ont pas pu être lus`
              : 'Un document n’a pas pu être lu'}
            action={<Bouton asChild variante="secondaire"><Link to={`/projects/${project.id}/upload`}>Déposer une version lisible</Link></Bouton>}>
            <p>{extractionWarnings.every((w) => /scann/i.test(w.warning))
              ? (extractionWarnings.length > 1 ? 'Ce sont des documents scannés, sans texte à lire' : 'C’est un document scanné, sans texte à lire')
              : 'Synorix n’a pas pu en lire le texte'}
              {extractionWarnings.length > 1 ? ' : leurs exigences ne sont pas relevées.' : ' : ses exigences ne sont pas relevées.'}</p>
            <ul className="mt-1 space-y-0.5">
              {extractionWarnings.map((w) => (
                <li key={w.file_name} className="break-words text-xs">
                  <span className="font-medium text-fg">{w.file_name}</span>
                </li>
              ))}
            </ul>
          </Message>
        )}

        {/* R9 — les lots cités dans le dossier mais non proposés : le nombre et la raison, sans nom de lot. */}
        {ecartes && <p data-lots-ecartes className="text-sm text-fg-2">{ecartes}</p>}

        {errorLots.length > 0 && (
          <Message ton="attention" titre={errorLots.length > 1 ? 'Des tableurs sont protégés par un mot de passe' : 'Un tableur est protégé par un mot de passe'}>
            <ul className="space-y-0.5">{errorLots.map((l) => <li key={l.id} className="break-words text-xs">{l.nom}</li>)}</ul>
          </Message>
        )}

        {chargementEchoue ? (
          <EtatErreur
            titre="Les lots n’ont pas pu se charger"
            detail="La liste des lots n’a pas pu être lue. Votre dossier reste en place."
            onReessayer={() => { void requeteDocuments.refetch(); void requeteLots.refetch() }}
            enCours={requeteLots.isFetching || requeteDocuments.isFetching}
          />
        ) : sansDepot ? (
          <EtapeSansAnalyse project={project} cas="sans-depot" viendra={['Les lots du dossier']}>
            Les lots du dossier apparaîtront ici. Déposez d’abord le <Sigle code="DCE" />&nbsp;: Synorix y repère les lots, et vous choisissez ceux à analyser.
          </EtapeSansAnalyse>
        ) : lots.length > 0 ? (
          <>
            {separes ? (
              <>
                <SectionEtape titre="Dans vos métiers" description={compte}><ListeLots>{dansVosMetiers.map(carteLot)}</ListeLots></SectionEtape>
                <SectionEtape
                  titre="Autres lots"
                  action={
                    <Bouton variante="lien" aria-expanded={autresVisibles} onClick={() => setAutresOuverts((o) => !o)}>
                      {autresVisibles ? 'Replier' : `Afficher les ${autres.length} autres lots`}
                    </Bouton>
                  }
                >
                  {autresVisibles && <ListeLots>{autres.map(carteLot)}</ListeLots>}
                </SectionEtape>
              </>
            ) : (
              <SectionEtape titre="Lots du dossier" description={compte}><ListeLots>{lots.map(carteLot)}</ListeLots></SectionEtape>
            )}
            <SectionEtape titre="Ou tout le dossier">
              <ListeLots>
                <LotCard
                  lot={{ id: 'all', nom: 'Analyser l’ensemble du dossier (tous les lots)' }}
                  selected={selectedIds.has('all')}
                  onSelect={() => toggleLot('all')}
                  cout={libelleUnites(lots.length)}
                  pieces={documents}
                />
              </ListeLots>
            </SectionEtape>
          </>
        ) : enDetection ? (
          <SqueletteListe phrase="Synorix repère les lots du dossier et compte les pièces de chacun." />
        ) : (
          <Carte>
            <p className="text-base font-semibold text-fg">Ce dossier n’a pas de lots</p>
            <p className="mt-1 text-sm text-fg-2">Synorix lira l’ensemble du dossier, sans tri par lot. Si l’acheteur a prévu des lots, ajoutez-les à la main.</p>
          </Carte>
        )}

        {peutLire && (showAddForm ? (
          <AddLotForm onAdd={handleAddLot} onCancel={() => setShowAddForm(false)} />
        ) : (
          <div>
            <Bouton variante="secondaire" onClick={() => setShowAddForm(true)}>
              <Plus aria-hidden size={16} strokeWidth={1.5} />
              Ajouter un lot à la main
            </Bouton>
          </div>
        ))}
      </GabaritEtape>
    </>
  )
}
