import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  Sparkles, Save, CheckCircle2, ChevronDown,
  Pencil, X, Download, Building2,
  ChevronRight,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import axios from 'axios'
import { api } from '@/services/api'
import MemoirePreflight, { type PreflightSelection } from '@/components/project/MemoirePreflight'
import RewritePassageBar, { type PassageSelection } from '@/components/project/RewritePassageBar'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import PoidsMemoire from '@/components/project/PoidsMemoire'
import EchecAction from '@/components/common/EchecAction'
import { messageErreur } from '@/lib/erreurs'
import { MemoireSkeleton } from '@/components/skeletons'
import type { Project, MemoireTechnique, MemoireContent, Reference } from '@/types'
import {
  SEUIL_SECTION_BREVE, referencesRetrouvees, sectionsBreves,
} from '@/lib/memoireControles'
import { depuisMarkdown, versMarkdown } from '@/lib/memoireMarkdown'
import {
  ANNEXES_MEMOIRE, SECTIONS_MEMOIRE, sommaireMemoire, type EntreeSommaire, type SectionMemoire,
} from '@/lib/memoireSections'

const MEMOIRE_GEN_STEPS: StepDescriptor[] = [
  { key: 'preparing',  label: 'Préparation du contexte',         estimated_s: 3 },
  { key: 'generating', label: 'Rédaction du mémoire technique',  estimated_s: 120 },
  { key: 'finalizing', label: 'Finalisation',                    estimated_s: 5 },
]

const F = "'Inter Variable', 'Geist Sans', sans-serif"

// ─── Fullscreen editor ─────────────────────────────────────────────────────────

type EtatEnregistrement = 'enregistre' | 'en_cours' | 'echec'

const DELAI_ENREGISTREMENT_AUTO_MS = 3000

function FullscreenEditor({
  content, projectId, onSave, onClose,
}: {
  content: MemoireContent
  projectId: string
  /** Enregistre le texte de l'éditeur ; échoue (promesse rejetée) si le serveur refuse. */
  onSave: (raw: string) => Promise<void>
  onClose: () => void
}) {
  const [raw, setRaw] = useState(() => versMarkdown(content))
  // 1.8 — dernier texte confirmé par le serveur : sert à savoir s'il reste des modifications
  const [enregistre, setEnregistre] = useState(raw)
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre')
  const [heure, setHeure] = useState<Date | null>(null)
  const [confirmerFermeture, setConfirmerFermeture] = useState(false)
  // C9b — sélection courante dans le textarea (pour la réécriture ciblée)
  const [selection, setSelection] = useState<PassageSelection | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const enCoursRef = useRef(false)
  const modifie = raw !== enregistre

  const enregistrer = useCallback(async (texte: string): Promise<boolean> => {
    if (enCoursRef.current) return false
    enCoursRef.current = true
    setEtat('en_cours')
    try {
      await onSaveRef.current(texte)
      setEnregistre(texte)
      setHeure(new Date())
      setEtat('enregistre')
      return true
    } catch {
      setEtat('echec')
      return false
    } finally {
      enCoursRef.current = false
    }
  }, [])

  // Enregistrement automatique quelques secondes après la dernière frappe.
  useEffect(() => {
    if (raw === enregistre) return
    const minuteur = setTimeout(() => { void enregistrer(raw) }, DELAI_ENREGISTREMENT_AUTO_MS)
    return () => clearTimeout(minuteur)
  }, [raw, enregistre, enregistrer])

  // Fermeture de l'onglet avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!modifie) return
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avertir)
    return () => window.removeEventListener('beforeunload', avertir)
  }, [modifie])

  const fermer = () => {
    if (modifie || etat === 'en_cours') setConfirmerFermeture(true)
    else onClose()
  }

  const captureSelection = () => {
    const el = editorRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    if (selectionEnd > selectionStart) {
      setSelection({ text: raw.slice(selectionStart, selectionEnd), start: selectionStart, end: selectionEnd })
    } else {
      setSelection(null)
    }
  }

  const applyRewrite = (start: number, end: number, rewritten: string) => {
    setRaw((prev) => prev.slice(0, start) + rewritten + prev.slice(end))
    setSelection(null)
  }

  const statut = etat === 'en_cours'
    ? 'Enregistrement…'
    : etat === 'echec'
      ? "L'enregistrement n'a pas abouti. Vos modifications restent ici."
      : modifie
        ? 'Modifications en cours'
        : heure
          ? `Enregistré à ${heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
          : ''

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#18181A', fontFamily: F }}>
      <div
        className="flex items-center justify-between gap-4 px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,.07)', background: '#18181A' }}
      >
        <p className="text-sm font-medium" style={{ color: '#F7F8F8' }}>
          Édition du mémoire — format Markdown
        </p>
        <div className="flex items-center gap-3">
          <p
            role="status"
            aria-live="polite"
            className="text-xs"
            style={{ color: etat === 'echec' ? '#F5C26B' : '#959597' }}
          >
            {statut}
          </p>
          {etat === 'echec' && (
            <button
              onClick={() => { void enregistrer(raw) }}
              className="text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors hover:bg-ds-bg-2"
              style={{ color: '#F7F8F8', border: '1px solid rgba(255,255,255,.12)' }}
            >
              Réessayer
            </button>
          )}
          <button
            onClick={() => { void enregistrer(raw) }}
            disabled={!modifie || etat === 'en_cours'}
            className="glass-btn text-ds-text flex items-center gap-2 py-2 px-4 text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {!modifie && etat === 'enregistre' && heure
              ? <><CheckCircle2 size={14} style={{ color: '#6EE7A8' }} />Enregistré</>
              : <><Save size={14} />Enregistrer</>}
          </button>
          <button
            onClick={fermer}
            className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-lg transition-colors hover:bg-ds-bg-2"
            style={{ color: '#959597', border: '1px solid rgba(255,255,255,.07)' }}
          >
            <X size={14} /> Fermer
          </button>
        </div>
      </div>
      {confirmerFermeture && (
        <div
          role="alertdialog"
          aria-label="Modifications non enregistrées"
          className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 shrink-0"
          style={{ background: 'rgba(217,164,65,0.08)', borderBottom: '1px solid rgba(217,164,65,0.25)' }}
        >
          <p className="text-sm" style={{ color: '#F7F8F8' }}>
            Des modifications ne sont pas encore enregistrées.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { if (await enregistrer(raw)) onClose() }}
              className="glass-btn text-ds-text py-1.5 px-3 text-sm font-semibold rounded-lg"
            >
              Enregistrer et fermer
            </button>
            <button
              onClick={onClose}
              className="py-1.5 px-3 text-sm rounded-lg transition-colors hover:bg-ds-bg-2"
              style={{ color: '#D8D9DB', border: '1px solid rgba(255,255,255,.12)' }}
            >
              Fermer sans enregistrer
            </button>
            <button
              onClick={() => setConfirmerFermeture(false)}
              className="py-1.5 px-3 text-sm rounded-lg transition-colors hover:bg-ds-bg-2"
              style={{ color: '#959597' }}
            >
              Continuer la rédaction
            </button>
          </div>
        </div>
      )}
      {/* C9b — barre de réécriture IA ciblée (agit sur la sélection seule) */}
      <RewritePassageBar projectId={projectId} selection={selection} onApply={applyRewrite} />
      <textarea
        ref={editorRef}
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setSelection(null) }}
        onSelect={captureSelection}
        className="flex-1 px-8 py-6 text-sm leading-relaxed resize-none focus:outline-none font-mono"
        style={{ background: '#18181A', color: '#F7F8F8', caretColor: '#E8E9EB' }}
        spellCheck
        lang="fr"
      />
    </div>
  )
}

// ─── Word export ──────────────────────────────────────────────────────────────

async function exportToWord(projectId: string, projectName: string) {
  const response = await api.get(`/projects/${projectId}/memoire/export-docx`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `Memoire_Technique_${projectName.replace(/\s+/g, '_')}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Profile summary card ────────────────────────────────────────────────────

function ProfileSummary({ stats }: { stats: { filled: number; total: number; nom_entreprise: string | null } | null }) {
  if (!stats) return null
  const pct = stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0
  const isComplete = stats.filled >= 14

  return (
    <div
      className="glass-card rounded-lg p-4"
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: isComplete ? 'rgba(255,255,255,0.10)' : 'rgba(149,149,151,0.08)' }}
        >
          <Building2 size={18} style={{ color: isComplete ? '#E8E9EB' : '#959597' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold" style={{ color: '#F7F8F8', fontFamily: F }}>
              Profil de votre entreprise
            </h3>
            {isComplete && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.10)', color: '#E8E9EB', border: '1px solid rgba(255,255,255,0.20)' }}
              >
                Complet
              </span>
            )}
          </div>

          {isComplete ? (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm" style={{ color: '#959597' }}>{stats.nom_entreprise || 'Entreprise'}</span>
              <Link to="/company" className="text-xs hover:underline" style={{ color: '#E8E9EB' }}>
                Modifier →
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1E1E21' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: pct < 30 ? '#959597' : pct < 70 ? '#E8E9EB' : '#E8E9EB' }}
                  />
                </div>
                <span className="text-xs font-medium shrink-0" style={{ color: '#959597' }}>
                  {stats.filled}/{stats.total}
                </span>
              </div>
              <p className="text-xs mt-2.5" style={{ color: '#959597' }}>
                Complétez votre profil pour un mémoire personnalisé avec vos vraies informations.
              </p>
              <Link
                to="/company"
                className="glass-btn inline-flex items-center gap-1.5 text-xs font-semibold mt-3 px-3.5 py-1.5 rounded-lg"
                style={{ color: '#D8D9DB' }}
              >
                Compléter le profil →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TOC Sidebar ─────────────────────────────────────────────────────────────

function TocSidebar({
  entrees, activeSection, onNavigate,
}: {
  entrees: EntreeSommaire[]
  activeSection: string
  onNavigate: (id: string) => void
}) {
  const [fermees, setFermees] = useState<Set<string>>(new Set())

  const basculer = (id: string) => {
    setFermees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div
      className="glass-card rounded-lg p-4 sticky top-4"
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', width: 220 }}
    >
      <p className="microlabel mb-3">Sommaire</p>

      <nav aria-label="Sommaire du mémoire" className="space-y-1">
        {entrees.map((section) => {
          const ouverte = !fermees.has(section.id)
          const active = activeSection === section.id
          return (
            <div key={section.id}>
              <button
                onClick={() => {
                  if (section.enfants.length > 0) basculer(section.id)
                  onNavigate(section.id)
                }}
                aria-expanded={section.enfants.length > 0 ? ouverte : undefined}
                className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-left transition-colors hover:bg-ds-bg-2"
                style={{ borderLeft: active ? '2px solid #E8E9EB' : '2px solid transparent' }}
              >
                {section.enfants.length > 0 ? (
                  ouverte
                    ? <ChevronDown size={12} style={{ color: '#6B6C6F' }} />
                    : <ChevronRight size={12} style={{ color: '#6B6C6F' }} />
                ) : <span style={{ width: 12 }} />}
                <span className="text-sm font-semibold" style={{ color: active ? '#E8E9EB' : '#F7F8F8', fontFamily: F }}>
                  {section.titre}
                </span>
              </button>
              {section.enfants.length > 0 && ouverte && (
                <div className="ml-2 space-y-0.5">
                  {section.enfants.map((enfant) => {
                    const enfantActif = activeSection === enfant.id
                    return (
                      <button
                        key={enfant.id}
                        onClick={() => onNavigate(enfant.id)}
                        className="w-full text-left py-1 px-4 text-xs transition-colors hover:text-[#E8E9EB]"
                        style={{
                          color: enfantActif ? '#E8E9EB' : '#959597',
                          fontWeight: enfantActif ? 600 : 400,
                          borderLeft: enfantActif ? '2px solid #E8E9EB' : '2px solid transparent',
                          fontFamily: F,
                        }}
                      >
                        {enfant.titre}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

// ─── Document View (center column — "Word page" style) ───────────────────────


export function DocumentView({
  content, project, docRef,
}: {
  content: MemoireContent
  project: Project
  docRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const a = content.partie_a as Record<string, string>
  const b = content.partie_b as Record<string, string>
  const c = content.partie_c as Record<string, string>

  const items = (part: SectionMemoire['part']): [string, string][] =>
    SECTIONS_MEMOIRE.filter((s) => s.part === part).map((s) => [s.cle, s.titre])
  const partAItems = items('partie_a')
  const partBItems = items('partie_b')
  const partCItems = items('partie_c')

  return (
    <div
      ref={docRef}
      className="rounded-lg overflow-y-auto"
      style={{
        background: '#18181A',
        border: '1px solid rgba(255,255,255,.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.30)',
        maxHeight: 'calc(100vh - 200px)',
      }}
    >
      <div className="max-w-3xl mx-auto py-10 px-10 space-y-8" style={{ fontFamily: F }}>

        {/* Document header */}
        <div className="flex items-start justify-end pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,.12)' }}>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: '#E8E9EB' }}>
              MÉMOIRE JUSTIFICATIF
            </p>
            <p className="text-sm mt-1" style={{ color: '#D8D9DB' }}>{project.name}</p>
          </div>
        </div>

        {/* PRÉAMBULE */}
        <div id="preambule">
          <PartHeading>PRÉAMBULE</PartHeading>
          <div id="preambule-intro" />
          <div id="preambule-contexte" />
          <MdContent text={content.preambule ?? ''} />
        </div>

        {/* PARTIE A */}
        <div id="partie-a">
          <PartHeading>PARTIE A — PRÉSENTATION GÉNÉRALE</PartHeading>
          {partAItems.map(([key, label]) =>
            a?.[key] ? (
              <div key={key} id={`sec-${key}`} className="mt-6">
                <SectionHeading>{label}</SectionHeading>
                <MdContent text={a[key]} />
              </div>
            ) : null,
          )}
        </div>

        {/* PARTIE B */}
        <div id="partie-b">
          <PartHeading>PARTIE B — PRÉSENTATION DE LA PRESTATION</PartHeading>
          {partBItems.map(([key, label]) =>
            b?.[key] ? (
              <div key={key} id={`sec-${key}`} className="mt-6">
                <SectionHeading>{label}</SectionHeading>
                <MdContent text={b[key]} />
              </div>
            ) : null,
          )}
        </div>

        {/* PARTIE C */}
        <div id="partie-c">
          <PartHeading>PARTIE C — MÉTHODOLOGIE MISE EN ŒUVRE</PartHeading>
          {partCItems.map(([key, label]) =>
            c?.[key] ? (
              <div key={key} id={`sec-${key}`} className="mt-6">
                <SectionHeading>{label}</SectionHeading>
                <MdContent text={c[key]} />
              </div>
            ) : null,
          )}
        </div>

        {/* Annexes */}
        <div id="annexes">
          <PartHeading>ANNEXES</PartHeading>
          {ANNEXES_MEMOIRE.map(({ cle, titre }) => a?.[cle] ? (
            <div key={cle} id={`annexe-${cle}`} className="mt-6">
              <SectionHeading>{titre}</SectionHeading>
              <MdContent text={a[cle]} />
            </div>
          ) : null)}
        </div>

      </div>
    </div>
  )
}

function PartHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xl font-bold pb-2 mb-4"
      style={{
        color: '#F7F8F8',
        borderLeft: '3px solid #E8E9EB',
        paddingLeft: 12,
        fontFamily: F,
      }}
    >
      {children}
    </h2>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold mb-2" style={{ color: '#E8E9EB', fontFamily: F }}>
      {children}
    </h3>
  )
}

function MdContent({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed"
      style={{ color: '#D8D9DB', fontFamily: F }}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props { project: Project }

export default function StepMemoire({ project }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null)
  const [variables, setVariables] = useState({
    nb_ouvriers: '',
    delai: '',
    chef_chantier_nom: '',
    chef_chantier_qualification: '',
    conducteur_travaux_nom: '',
    conducteur_travaux_qualification: '',
    materiel_specifique: '',
    particularites: '',
  })
  const [showForm, setShowForm] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editedContent, setEditedContent] = useState<MemoireContent | null>(null)
  const [, setGenSuccess] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  // Run DÉTACHÉ : `running` couvre le lancement local ; après un reload,
  // project.processing_status === 'generating' reprend le relais (même
  // architecture que l'analyse).
  const [running, setRunning] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [echecExport, setEchecExport] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState('preambule')
  const docRef = useRef<HTMLDivElement | null>(null)

  // Fetch existing mémoire
  const { data: memoire, isLoading } = useQuery({
    queryKey: ['memoire', project.id],
    queryFn: async () => {
      try {
        const { data } = await api.get<MemoireTechnique>(`/projects/${project.id}/memoire`)
        return data
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null
        throw err
      }
    },
    retry: false,
  })

  // Fetch profile stats
  const { data: profileStats } = useQuery({
    queryKey: ['memoire-config-stats'],
    queryFn: async () => {
      const { data } = await api.get<{ filled: number; total: number; nom_entreprise: string | null }>('/memoire-config/stats')
      return data
    },
  })

  const displayContent: MemoireContent | null = editedContent ?? memoire?.content_json ?? null
  // 1.9 — sommaire tiré des vrais titres (chaque entrée mène à la section de même nom)
  const sommaire = useMemo(() => (displayContent ? sommaireMemoire(displayContent) : []), [displayContent])
  const criteres = project.criteres_jugement ?? []

  // Poids total hors prix : la part de la note que le mémoire peut capter
  const techPct = useMemo(
    () => Math.round(criteres.filter((c) => !c.nom.toLowerCase().includes('prix')).reduce((s, c) => s + c.poids, 0)),
    [criteres],
  )

  // Compute completion % for the TOC badge
  const completionPct = useMemo(() => {
    if (!displayContent) return 0
    const allSections: string[] = []
    const a = displayContent.partie_a as Record<string, string>
    const b = displayContent.partie_b as Record<string, string>
    const c = displayContent.partie_c as Record<string, string>
    const parts = [a, b, c]
    for (const part of parts) {
      if (!part) continue
      for (const val of Object.values(part)) allSections.push(val)
    }
    if (displayContent.preambule) allSections.push(displayContent.preambule)
    const filled = allSections.filter((v) => v && v.trim().length > 10).length
    return allSections.length > 0 ? Math.round((filled / allSections.length) * 100) : 0
  }, [displayContent])

  // Compagnon (1.3) : deux contrôles calculés sur le texte, rien d'inventé
  const { data: references = [] } = useQuery({
    queryKey: ['references'],
    queryFn: async () => (await api.get<Reference[]>('/references')).data,
  })
  const breves = useMemo(
    () => (displayContent ? sectionsBreves(displayContent, SECTIONS_MEMOIRE) : []),
    [displayContent],
  )
  const controleRefs = useMemo(
    () => (displayContent
      ? referencesRetrouvees(displayContent, references.filter((r) => r.is_reference))
      : null),
    [displayContent, references],
  )

  // C9a — dernière sélection du pre-flight (overrides locaux, refs, propagation)
  const preflightRef = useRef<PreflightSelection>({
    profile_overrides: null, reference_ids: null, update_profile: false,
    include_organigramme: false, gantt_phases: null, annexe_document_ids: null,
  })
  const handlePreflightChange = useCallback((sel: PreflightSelection) => {
    preflightRef.current = sel
  }, [])

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      api.post<{ status: string }>(`/projects/${project.id}/memoire/generate`, {
        nb_ouvriers: variables.nb_ouvriers ? parseInt(variables.nb_ouvriers) : undefined,
        delai: variables.delai || undefined,
        chef_chantier_nom: variables.chef_chantier_nom || undefined,
        chef_chantier_qualification: variables.chef_chantier_qualification || undefined,
        conducteur_travaux_nom: variables.conducteur_travaux_nom || undefined,
        conducteur_travaux_qualification: variables.conducteur_travaux_qualification || undefined,
        materiel_specifique: variables.materiel_specifique || undefined,
        particularites: variables.particularites || undefined,
        profile_overrides: preflightRef.current.profile_overrides || undefined,
        reference_ids: preflightRef.current.reference_ids || undefined,
        update_profile: preflightRef.current.update_profile || undefined,
        include_organigramme: preflightRef.current.include_organigramme || undefined,
        gantt_phases: preflightRef.current.gantt_phases || undefined,
        annexe_document_ids: preflightRef.current.annexe_document_ids || undefined,
      }, { timeout: 60_000 }),
    onSuccess: () => {
      // Contrat détaché : le POST rend "started" immédiatement, le run
      // continue côté serveur (survit navigation/reload/proxy).
      setGenError(null)
      setGenSuccess(false)
      setRunning(true)
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
    onError: (err) => {
      setGenSuccess(false)
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? 'Erreur lors de la génération')
        : 'Erreur lors de la génération'
      const texte = typeof msg === 'string' ? msg : JSON.stringify(msg)
      // 1.2 — quota appliqué par le serveur : son refus ouvre le choix d'une offre
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        setPaywallMessage(texte)
        setShowPaywall(true)
        return
      }
      setGenError(texte)
    },
  })

  // Le run est détaché : l'état vivant est porté par processing_status
  // (reprise après reload) + le flux SSE (progression temps réel).
  const isRunning = isGenerating || running || project.processing_status === 'generating'

  const memoireSse = useProgressStream(project.id, {
    enabled: isRunning,
    onComplete: () => {
      setRunning(false)
      setEditedContent(null)
      setGenSuccess(true)
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['memoire', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
  })

  // Échec du run détaché → statut error explicite + relance possible,
  // jamais d'attente infinie ni de régression d'étape.
  useEffect(() => {
    if (memoireSse.phase === 'error') {
      setRunning(false)
      setGenError(memoireSse.detail || 'La génération du mémoire a échoué. Relancez la génération.')
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoireSse.phase])

  const { mutateAsync: saveEdits } = useMutation({
    mutationFn: (content: MemoireContent) =>
      api.patch(`/projects/${project.id}/memoire`, { content_json: content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoire', project.id] })
    },
  })

  // 1.8 — la vue document n'adopte le texte qu'une fois l'enregistrement
  // confirmé : si le serveur refuse, elle reste à l'état précédent et le
  // texte reste dans l'éditeur (message + « Réessayer »).
  const handleEditorSave = async (raw: string) => {
    const parsed = depuisMarkdown(raw, displayContent!)
    await saveEdits(parsed)
    setEditedContent(parsed)
  }

  // 1.16 — un export Word qui échoue est dit, avec « Réessayer »
  const lancerExportWord = () => {
    setIsExporting(true)
    setEchecExport(null)
    exportToWord(project.id, project.name)
      .catch(async (err) => setEchecExport(await messageErreur(err, "Le téléchargement du mémoire Word n'a pas abouti.")))
      .finally(() => setIsExporting(false))
  }

  const handleTocNavigate = useCallback((sectionId: string) => {
    setActiveSection(sectionId)
    const el = document.getElementById(sectionId)
    if (el && docRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // ── Loading ─────────────────────────────────────────────────────

  if (isLoading) {
    return <MemoireSkeleton />
  }

  const hasMemoire = !!memoire
  const lotName = project.selected_lot_name || 'Lot unique'
  const isDocView = hasMemoire && !showForm

  // ── Bottom bar ── un seul CTA lumineux par écran : signature en vue
  // document (c'est la prochaine étape), verre en vue formulaire (Générer prime).

  const bottomBar = (
    <div
      className="sticky -bottom-5 z-30 -mx-3 sm:-mx-4 mt-6 rounded-t-lg flex items-center justify-end px-6 py-3 gap-3"
      style={{
        background: 'rgba(9,9,10,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,.07)',
      }}
    >
      <button
        onClick={() => navigate(`/projects/${project.id}/export`)}
        disabled={!hasMemoire}
        className={isDocView
          ? 'signature-btn disabled:opacity-40'
          : 'glass-btn flex items-center gap-2 py-2.5 px-5 text-sm font-semibold rounded-lg disabled:opacity-40'}
        style={{ fontFamily: F, ...(isDocView ? {} : { color: '#C2C3C6' }) }}
      >
        Étape suivante : Export
      </button>
    </div>
  )

  // ── Generation form (no mémoire yet or regenerate) ─────────────

  if (!hasMemoire || showForm) {
    return (
      <>
        <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" message={paywallMessage} />
        {isRunning && (
          <ProgressDisplay
            variant="modal"
            title="Synorix IA rédige votre mémoire"
            steps={MEMOIRE_GEN_STEPS}
            currentStep={memoireSse.step}
            progress={memoireSse.progress}
            detail={memoireSse.detail || 'Préparation du contexte…'}
            phase={memoireSse.phase}
            avis="Vous pouvez fermer cette page : Synorix vous prévient par e-mail."
            onArrierePlan={() => navigate('/dashboard')}
          />
        )}

        <div className="space-y-4" style={{ fontFamily: F }}>
          {/* ── HÉROS — le fait qui motive l'effort : le poids du mémoire dans la note ── */}
          <div className="glass-card top-lit blueprint-grid sheen relative overflow-hidden px-5 py-4">
            <div className="relative grid items-start gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="microlabel">Mémoire technique — {lotName}</p>
                  {hasMemoire && (
                    <span className="flex items-center gap-3">
                      <span className="edge-data text-xs" style={{ color: '#959597' }}>
                        v{memoire.version} — {new Date(memoire.generated_at).toLocaleDateString('fr-FR')}
                      </span>
                      <button
                        onClick={() => setShowForm(false)}
                        className="text-xs font-medium px-3 py-1 rounded-lg transition-colors hover:bg-ds-bg-2"
                        style={{ color: '#959597', border: '1px solid rgba(255,255,255,.07)' }}
                      >
                        Annuler
                      </button>
                    </span>
                  )}
                </div>
                <PoidsMemoire techPct={techPct} />
                {hasMemoire && (
                  <p className="mt-3 text-xs font-medium leading-relaxed" style={{ color: 'var(--warn)' }}>
                    La régénération remplacera la version actuelle du mémoire.
                  </p>
                )}
              </div>

              {criteres.length > 0 && (
                <div className="min-w-0">
                  <p className="microlabel mb-2">Le mémoire sera optimisé pour</p>
                  <div className="flex flex-wrap gap-1.5">
                    {criteres.map((c) => (
                      <span
                        key={c.nom}
                        className="num-mono text-[11px] px-2 py-1 rounded-md"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,.07)', color: '#C2C3C6' }}
                      >
                        {c.nom} {c.poids}&nbsp;%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Profile summary */}
          <ProfileSummary stats={profileStats ?? null} />

          {/* C9a — pre-flight : profil condensé éditable + références + quota */}
          <MemoirePreflight projectId={project.id} onChange={handlePreflightChange} />

          {/* Chantier-specific form */}
          <div
            className="glass-card rounded-lg p-5 space-y-4"
            style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
          >
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#F7F8F8', fontFamily: F }}>
                Informations spécifiques à ce chantier
              </h3>
              <p className="text-[11px] mt-1" style={{ color: '#959597' }}>
                Ces informations seront intégrées dans le mémoire pour ce projet
              </p>
            </div>

            {/* Row 1: Ouvriers + Délai */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>
                  Nombre d&apos;ouvriers dédiés <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <input
                  type="number"
                  value={variables.nb_ouvriers}
                  onChange={(e) => setVariables((v) => ({ ...v, nb_ouvriers: e.target.value }))}
                  className="w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                  style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                  placeholder="Ex : 4"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>
                  Délai estimé <span style={{ color: 'var(--warn)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={variables.delai}
                  onChange={(e) => setVariables((v) => ({ ...v, delai: e.target.value }))}
                  className="w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                  style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                  placeholder="Ex : 3 mois"
                />
              </div>
            </div>

            {/* Row 2: Chef de chantier */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>Chef de chantier — nom</label>
                <input
                  type="text"
                  value={variables.chef_chantier_nom}
                  onChange={(e) => setVariables((v) => ({ ...v, chef_chantier_nom: e.target.value }))}
                  className="w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                  style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                  placeholder="Ex : Jean Dupont"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>Qualification</label>
                <input
                  type="text"
                  value={variables.chef_chantier_qualification}
                  onChange={(e) => setVariables((v) => ({ ...v, chef_chantier_qualification: e.target.value }))}
                  className="w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                  style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                  placeholder="Ex : 15 ans d'expérience, CACES R482"
                />
              </div>
            </div>

            {/* Row 3: Conducteur de travaux */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>Conducteur de travaux — nom</label>
                <input
                  type="text"
                  value={variables.conducteur_travaux_nom}
                  onChange={(e) => setVariables((v) => ({ ...v, conducteur_travaux_nom: e.target.value }))}
                  className="w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                  style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                  placeholder="Ex : Marie Martin"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>Qualification</label>
                <input
                  type="text"
                  value={variables.conducteur_travaux_qualification}
                  onChange={(e) => setVariables((v) => ({ ...v, conducteur_travaux_qualification: e.target.value }))}
                  className="w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                  style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                  placeholder="Ex : ingénieur BTP, 10 ans ITE/ravalement"
                />
              </div>
            </div>

            {/* Row 4: Matériel spécifique */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>
                Matériel spécifique au chantier
              </label>
              <textarea
                value={variables.materiel_specifique}
                onChange={(e) => setVariables((v) => ({ ...v, materiel_specifique: e.target.value }))}
                rows={2}
                className="w-full py-2 px-3 text-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                placeholder="Ex : échafaudage tubulaire R200, nacelle articulée 20 m…"
              />
            </div>

            {/* Row 5: Contraintes */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#F7F8F8' }}>
                Contraintes particulières
                <span className="font-normal ml-1" style={{ color: '#6B6C6F' }}>(optionnel)</span>
              </label>
              <textarea
                value={variables.particularites}
                onChange={(e) => setVariables((v) => ({ ...v, particularites: e.target.value }))}
                rows={2}
                className="w-full py-2 px-3 text-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.30)]"
                style={{ background: '#121213', border: '1px solid rgba(255,255,255,.07)', color: '#F7F8F8', fontFamily: F }}
                placeholder="Ex : site occupé, horaires restreints 8 h-17 h…"
              />
            </div>
          </div>

          {/* Error */}
          {(genError || (!isRunning && project.processing_status === 'error')) && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: 'rgba(245,142,134,0.08)', border: '1px solid rgba(245,142,134,0.20)', color: '#F58E86' }}
            >
              {genError
                ?? project.processing_detail
                ?? 'La génération du mémoire a échoué. Relancez la génération.'}
            </p>
          )}

          {/* Generate button */}
          <button
            onClick={() => {
              setGenError(null)
              generate()
            }}
            disabled={isRunning || !variables.nb_ouvriers || !variables.delai}
            className="signature-btn disabled:opacity-40"
            style={{ fontFamily: F, padding: '12px 24px' }}
          >
            <Sparkles size={18} />
            {hasMemoire ? 'Régénérer le mémoire' : 'Générer le mémoire technique'}
          </button>
        </div>

        {bottomBar}
      </>
    )
  }

  // ── 3-column document view ─────────────────────────────────────

  return (
    <>
      <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" message={paywallMessage} />
      {isRunning && (
        <ProgressDisplay
          variant="modal"
          title="Synorix IA rédige votre mémoire"
          steps={MEMOIRE_GEN_STEPS}
          currentStep={memoireSse.step}
          progress={memoireSse.progress}
          detail={memoireSse.detail || 'Préparation du contexte…'}
          phase={memoireSse.phase}
          avis="Vous pouvez fermer cette page : Synorix vous prévient par e-mail."
          onArrierePlan={() => navigate('/dashboard')}
        />
      )}

      {/* Portail : un ancêtre animé (transform) piégeait le « fixed » dans la colonne de contenu */}
      {showEditor && displayContent && createPortal(
        <FullscreenEditor
          content={displayContent}
          projectId={project.id}
          onSave={handleEditorSave}
          onClose={() => setShowEditor(false)}
        />,
        document.body,
      )}

      <div className="space-y-4" style={{ fontFamily: F }}>

        {/* Échec d'une régénération détachée : signalé sans quitter le doc */}
        {genError && (
          <p
            className="text-sm rounded-lg px-3 py-2"
            style={{ background: 'rgba(245,142,134,0.08)', border: '1px solid rgba(245,142,134,0.20)', color: '#F58E86' }}
          >
            {genError}
          </p>
        )}

        {/* ── Barre de titre : un seul rang, tout l'état du document ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: '#F7F8F8' }}>
              Mémoire technique — {lotName}
            </h1>
            <span
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,.07)', color: '#C2C3C6' }}
              title={`Générée le ${new Date(memoire!.generated_at).toLocaleDateString('fr-FR')} par Synorix IA`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#6EE7A8' }} />
              v{memoire!.version}
              <span style={{ color: '#55565A' }}>·</span>
              <span className="num-mono">{completionPct}&nbsp;% rédigé</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditor(true)}
              className="flex items-center gap-1.5 text-sm font-medium py-1.5 px-3.5 rounded-lg transition-colors hover:bg-ds-bg-2"
              style={{ border: '1px solid rgba(255,255,255,.07)', color: '#C2C3C6' }}
            >
              <Pencil size={13} /> Modifier
            </button>
            <button
              onClick={() => lancerExportWord()}
              disabled={isExporting}
              className="glass-btn flex items-center gap-1.5 text-sm font-semibold py-1.5 px-3.5 rounded-lg disabled:opacity-60"
              style={{ color: '#D8D9DB' }}
            >
              <Download size={13} />
              {isExporting ? 'Export...' : 'Export .docx'}
            </button>
          </div>
        </div>

        {echecExport && (
          <EchecAction message={echecExport} onReessayer={lancerExportWord} onFermer={() => setEchecExport(null)} />
        )}

        {/* ── 3-column layout ────────────────────────────────────── */}
        {displayContent && (
          <div className="flex gap-6 items-start">

            {/* LEFT — Table of Contents */}
            <div className="shrink-0 hidden xl:block">
              <TocSidebar entrees={sommaire} activeSection={activeSection} onNavigate={handleTocNavigate} />
            </div>

            {/* CENTER — Document */}
            <div className="flex-1 min-w-0">
              <DocumentView content={displayContent} project={project} docRef={docRef} />
            </div>

            {/* RIGHT — Assistant Synorix */}
            <div className="shrink-0 hidden lg:block" style={{ width: 280 }}>
              <div className="sticky top-4 space-y-3">

                {/* Header */}
                <div>
                  <p className="microlabel">Compagnon Synorix</p>
                  <p className="text-xs mt-1" style={{ color: '#959597' }}>
                    Deux contrôles faits sur le texte de ce mémoire
                  </p>
                </div>

                {/* Contrôle 1 — références chantier retrouvées dans le texte */}
                <div
                  className="glass-card rounded-lg p-3.5"
                  style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: '#F7F8F8', fontFamily: F }}>
                    Références chantier
                  </p>
                  {controleRefs && controleRefs.retrouvees.length + controleRefs.nonRetrouvees.length > 0 ? (
                    <>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#C2C3C6' }}>
                        {controleRefs.retrouvees.length} de vos {controleRefs.retrouvees.length + controleRefs.nonRetrouvees.length}{' '}
                        références retrouvées dans le texte.
                      </p>
                      {controleRefs.nonRetrouvees.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {controleRefs.nonRetrouvees.map((r) => (
                            <li key={r.id} className="text-xs leading-relaxed" style={{ color: '#959597' }}>
                              « {r.intitule} » n'y figure pas telle quelle.
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: '#959597' }}>
                      Aucune référence marquée dans{' '}
                      <Link to="/references" className="underline underline-offset-2" style={{ color: '#E8E9EB' }}>Mes références</Link>.
                    </p>
                  )}
                </div>

                {/* Contrôle 2 — sections brèves */}
                <div
                  className="glass-card rounded-lg p-3.5"
                  style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: '#F7F8F8', fontFamily: F }}>
                    Sections brèves
                  </p>
                  {breves.length === 0 ? (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: '#C2C3C6' }}>
                      Toutes les sections font au moins {SEUIL_SECTION_BREVE} mots.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#C2C3C6' }}>
                        {breves.length} section{breves.length > 1 ? 's font' : ' fait'} moins de {SEUIL_SECTION_BREVE} mots, à étoffer si besoin :
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {breves.map((sb) => (
                          <li key={`${sb.part}-${sb.cle}`}>
                            <button
                              onClick={() => handleTocNavigate(`sec-${sb.cle}`)}
                              className="text-left text-xs leading-relaxed hover:underline underline-offset-2"
                              style={{ color: '#E8E9EB' }}
                            >
                              {sb.titre} — <span className="num-mono">{sb.mots}</span> mots
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {bottomBar}
    </>
  )
}
