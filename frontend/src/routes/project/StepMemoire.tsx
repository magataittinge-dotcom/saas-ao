import { useAvisAttente } from '@/hooks/useAvisAttente'
import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Save, CheckCircle2, Pencil, X } from 'lucide-react'
import axios from 'axios'
import { memoireDepuisReponse } from '@/lib/memoireLecture'
import { api } from '@/services/api'
import FormulaireMemoire from '@/components/project/FormulaireMemoire'
import BarreEtape, { BoutonSuite } from '@/components/project/BarreEtape'
import { type PreflightSelection } from '@/components/project/MemoirePreflight'
import { VARIABLES_VIDES, corpsGeneration } from '@/lib/memoireGeneration'
import RewritePassageBar, { type PassageSelection } from '@/components/project/RewritePassageBar'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import PoidsMemoire from '@/components/project/PoidsMemoire'
import RelectureMemoire from '@/components/memoire/RelectureMemoire'
import {
  ActionsBarreTel, BandeResume, BilanBarre, GabaritEtape, SectionEtape, type CarteResume,
} from '@/components/etape'
import { ETAT_A_VERIFIER, ETAT_PRET, type VuePlan } from '@/lib/planMemoire'
import { MemoireSkeleton } from '@/components/skeletons'
import type { Project, MemoireTechnique, MemoireContent, Reference } from '@/types'
import {
  SEUIL_SECTION_BREVE, referencesRetrouvees, sectionsBreves,
} from '@/lib/memoireControles'
import { depuisMarkdown, versMarkdown } from '@/lib/memoireMarkdown'
import {
  ANNEXES_MEMOIRE, sectionsDuContenu, sommaireMemoire, type SectionMemoire,
} from '@/lib/memoireSections'
import LecteurMarkdown from '@/components/memoire/LecteurMarkdown'
import SommaireMemoire from '@/components/memoire/SommaireMemoire'
import ConfirmationRefaire, { BoutonRefaire, type CibleRefaire } from '@/components/memoire/RefaireSection'
import EtatPartieChoix from '@/components/memoire/EtatPartie'
import { etatDe, etatsDuMemoire, type EtatPartie, type EtatsSections } from '@/lib/memoireEtats'
import { useSourceChamp } from '@/hooks/useSourceChamp'
import type { RattachementCriteres } from '@/lib/memoireCriteres'
import type { CriticalFieldsPayload } from '@/components/project/CriticalBanner'

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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface-1)', fontFamily: F }}>
      <div
        className="flex items-center justify-between gap-4 px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-1)', background: 'var(--surface-1)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Édition du mémoire — format Markdown
        </p>
        <div className="flex items-center gap-3">
          <p
            role="status"
            aria-live="polite"
            className="text-xs"
            style={{ color: etat === 'echec' ? 'var(--warning-fg)' : 'var(--text-3)' }}
          >
            {statut}
          </p>
          {etat === 'echec' && (
            <button
              onClick={() => { void enregistrer(raw) }}
              className="text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors hover:bg-ds-bg-2"
              style={{ color: 'var(--text-1)', border: '1px solid var(--border-2)' }}
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
              ? <><CheckCircle2 size={14} style={{ color: 'var(--success-fg)' }} />Enregistré</>
              : <><Save size={14} />Enregistrer</>}
          </button>
          <button
            onClick={fermer}
            className="flex items-center gap-1.5 text-sm py-2 px-3 rounded-lg transition-colors hover:bg-ds-bg-2"
            style={{ color: 'var(--text-3)', border: '1px solid var(--border-1)' }}
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
          style={{ background: 'color-mix(in srgb, var(--warning-fg) 8%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--warning-fg) 25%, transparent)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-1)' }}>
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
              style={{ color: 'var(--text-2)', border: '1px solid var(--border-2)' }}
            >
              Fermer sans enregistrer
            </button>
            <button
              onClick={() => setConfirmerFermeture(false)}
              className="py-1.5 px-3 text-sm rounded-lg transition-colors hover:bg-ds-bg-2"
              style={{ color: 'var(--text-3)' }}
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
        style={{ background: 'var(--surface-1)', color: 'var(--text-1)', caretColor: 'var(--text-1)' }}
        spellCheck
        lang="fr"
      />
    </div>
  )
}

// ─── Document View (center column — "Word page" style) ───────────────────────


export function DocumentView({
  content, project, docRef, onRefaire, refaireDesactive = false, etats, onEtat,
}: {
  content: MemoireContent
  project: Project
  docRef: React.MutableRefObject<HTMLDivElement | null>
  /** E2 — « Refaire cette partie » : absent, aucun bouton (aperçus, tests). */
  onRefaire?: (cible: CibleRefaire) => void
  refaireDesactive?: boolean
  /** E3 — états « À refaire » choisis par le patron (absent = tout « Rédigée ») et le moyen de les changer. */
  etats?: EtatsSections
  onEtat?: (cible: { part: string; cle: string }, etat: EtatPartie) => void
}) {
  const entete = (part: string, cle: string, label: string) => (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <SectionHeading>{label}</SectionHeading>
      <div className="flex flex-wrap items-center gap-2">
        {onEtat && (
          <EtatPartieChoix titre={label} etat={etatDe(etats, part, cle)} desactive={refaireDesactive}
            onChange={(e) => onEtat({ part, cle }, e)} />
        )}
        {onRefaire && (
          <BoutonRefaire titre={label} desactive={refaireDesactive} onClick={() => onRefaire({ part, cle, titre: label })} />
        )}
      </div>
    </div>
  )
  const a = content.partie_a as Record<string, string>
  const b = content.partie_b as Record<string, string>
  const c = content.partie_c as Record<string, string>

  const items = (part: SectionMemoire['part']): [string, string][] =>
    sectionsDuContenu(content).filter((s) => s.part === part).map((s) => [s.cle, s.titre])
  const partAItems = items('partie_a')
  const partBItems = items('partie_b')
  const partCItems = items('partie_c')

  return (
    <div
      ref={docRef}
      className="rounded-lg overflow-y-auto"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        boxShadow: 'var(--shadow-pop)',
        maxHeight: 'calc(100vh - 200px)',
      }}
    >
      <div className="max-w-3xl mx-auto py-10 px-10 space-y-8" style={{ fontFamily: F }}>

        {/* Document header */}
        <div className="flex items-start justify-end pb-6" style={{ borderBottom: '1px solid var(--border-2)' }}>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>
              MÉMOIRE JUSTIFICATIF
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>{project.name}</p>
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
                {entete('partie_a', key, label)}
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
                {entete('partie_b', key, label)}
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
                {entete('partie_c', key, label)}
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
              <div className="mb-2"><SectionHeading>{titre}</SectionHeading></div>
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
        color: 'var(--text-1)',
        borderLeft: '3px solid var(--text-1)',
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
    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-1)', fontFamily: F }}>
      {children}
    </h3>
  )
}

function MdContent({ text }: { text: string }) {
  return <LecteurMarkdown text={text} />
}

// ─── Main component ──────────────────────────────────────────────────────────

const BOUTON_SECONDAIRE = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-bord-2 px-3.5 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-0 max-[768px]:flex-1 [@media(pointer:coarse)]:min-h-11'

/** Les cartes de l'écran de préparation : le plan suivi, le poids dans la note, ce que la rédaction décompte. */
export function cartesPreparation(plan: VuePlan | null, techPct: number): CarteResume[] {
  return [
    plan
      ? {
        libelle: 'Plan', valeur: `${plan.resume.parties} parties`, etat: plan.valide ? ETAT_PRET : ETAT_A_VERIFIER,
        detail: plan.valide ? 'Plan validé : la rédaction le suit.' : 'Plan non validé : le plan du modèle sera suivi.',
      }
      : { libelle: 'Plan', valeur: 'Plan du modèle', detail: 'Le plan du modèle sera suivi.' },
    techPct > 0
      ? { libelle: 'Poids dans la note', valeur: `${techPct} %`, detail: 'Pondération hors prix relevée dans le règlement.' }
      : { libelle: 'Poids dans la note', valeur: 'Non précisé', detail: 'Le règlement ne donne pas de pondération.' },
    { libelle: 'Abonnement', valeur: '1 unité', detail: 'Un mémoire décompte 1 unité, au succès de la rédaction.' },
  ]
}

/** ~500 mots par page (même ordre de grandeur que la relecture et l'export). */
export function pagesEstimees(contenu: MemoireContent | null): number {
  if (!contenu) return 0
  const textes = [contenu.preambule, ...Object.values(contenu.partie_a ?? {}), ...Object.values(contenu.partie_b ?? {}), ...Object.values(contenu.partie_c ?? {})]
  const mots = textes.reduce((n, t) => n + (typeof t === 'string' ? t.split(/\s+/).filter(Boolean).length : 0), 0)
  return Math.max(1, Math.round(mots / 500))
}

/** Les cartes du mémoire rédigé : avancement, critères traités, parties à refaire, longueur. */
export function cartesRedaction({ version, completionPct, rattachement, nbARefaire, pages, limite }: {
  version: number
  completionPct: number
  rattachement: RattachementCriteres | undefined
  nbARefaire: number
  pages: number
  limite: number | null
}): CarteResume[] {
  const total = rattachement?.sous_criteres.length ?? 0
  const traites = rattachement?.sous_criteres.filter((s) => s.traite).length ?? 0
  return [
    { libelle: 'Rédaction', valeur: `${completionPct} %`, jauge: { rempli: completionPct, total: 100 }, detail: `Version ${version}` },
    total > 0
      ? {
        libelle: 'Critères du règlement', valeur: `${traites} sur ${total}`, etat: traites === total ? ETAT_PRET : ETAT_A_VERIFIER,
        jauge: { rempli: traites, total }, detail: traites === total ? 'Chaque sous-critère est traité.' : `${total - traites} à couvrir`,
      }
      : { libelle: 'Critères du règlement', valeur: 'Non détaillés', detail: 'Le règlement ne détaille pas de sous-critères.' },
    nbARefaire > 0
      ? { libelle: 'Parties à refaire', valeur: String(nbARefaire), etat: ETAT_A_VERIFIER, detail: 'Marquées « À refaire » dans le sommaire.' }
      : { libelle: 'Parties à refaire', valeur: 'Aucune', etat: ETAT_PRET, detail: 'Toutes les parties sont rédigées.' },
    limite
      ? { libelle: 'Longueur', valeur: `environ ${pages} pages`, etat: pages <= limite ? ETAT_PRET : ETAT_A_VERIFIER, detail: `Limite du dossier : ${limite} pages.` }
      : { libelle: 'Longueur', valeur: `environ ${pages} pages`, detail: 'Le dossier ne fixe pas de limite.' },
  ]
}

interface Props { project: Project }

export default function StepMemoire({ project }: Props) {
  const navigate = useNavigate()
  const avisAttente = useAvisAttente('mémoire')
  const queryClient = useQueryClient()
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null)
  const [variables, setVariables] = useState(VARIABLES_VIDES)
  const [showForm, setShowForm] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editedContent, setEditedContent] = useState<MemoireContent | null>(null)
  const [, setGenSuccess] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  // Run DÉTACHÉ : `running` couvre le lancement local ; après un reload,
  // project.processing_status === 'generating' reprend le relais (même
  // architecture que l'analyse).
  const [running, setRunning] = useState(false)
  const [activeSection, setActiveSection] = useState('preambule')
  const docRef = useRef<HTMLDivElement | null>(null)

  // Fetch existing mémoire
  const { data: memoire, isLoading } = useQuery({
    queryKey: ['memoire', project.id],
    // 204 = pas encore de mémoire (R31) : un état normal, sans erreur ni ligne rouge dans la console.
    queryFn: async () => {
      const res = await api.get<MemoireTechnique | ''>(`/projects/${project.id}/memoire`)
      return memoireDepuisReponse<MemoireTechnique>(res.status, res.data)
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

  // E1 — sous-critères du RC rattachés aux parties (calcul serveur, sans IA) ; la clé commence par celle du
  // mémoire : toute modification enregistrée la relit.
  const { data: rattachement } = useQuery({
    queryKey: ['memoire', project.id, 'criteres'],
    queryFn: async () => (await api.get<RattachementCriteres>(`/projects/${project.id}/memoire/criteres`)).data,
    enabled: !!memoire,
    retry: false,
  })
  // Source des critères dans le règlement (même requête que le bandeau de l'analyse) : « Voir dans le dossier ».
  const { data: champsCritiques } = useQuery({
    queryKey: ['critical-fields', project.id],
    queryFn: async () => (await api.get<CriticalFieldsPayload>(`/projects/${project.id}/critical-fields`)).data,
    enabled: !!memoire,
    retry: false,
  })
  const sourceCriteres = champsCritiques?.fields.criteres?.source ?? null
  const source = useSourceChamp(project.id)

  const displayContent: MemoireContent | null = editedContent ?? memoire?.content_json ?? null
  // 1.9 — sommaire tiré des vrais titres (chaque entrée mène à la section de même nom)
  const sommaire = useMemo(() => (displayContent ? sommaireMemoire(displayContent) : []), [displayContent])
  const criteres = project.criteres_jugement ?? []

  // B4 — l'état du plan (validé ou non) : lu seulement, pour le dire en tête de l'écran. Sans plan, le modèle standard est suivi.
  const { data: plan } = useQuery({
    queryKey: ['plan-memoire', project.id],
    queryFn: async () => (await api.get<VuePlan>(`/projects/${project.id}/plan-memoire`)).data,
    retry: false,
  })

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
    () => (displayContent ? sectionsBreves(displayContent, sectionsDuContenu(displayContent)) : []),
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
      api.post<{ status: string }>(`/projects/${project.id}/memoire/generate`, corpsGeneration(variables, preflightRef.current), { timeout: 60_000 }),
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

  // E3 — « Rédigée » / « À refaire » : le choix du patron, tenu par le serveur (clé à part du JSON du mémoire).
  const etats = etatsDuMemoire(memoire?.content_json)
  const { mutate: definirEtat } = useMutation({
    mutationFn: async (c: { part: string; cle: string; etat: EtatPartie }) =>
      (await api.put<{ etats: EtatsSections }>(`/projects/${project.id}/memoire/sections/${c.part}/${c.cle}/etat`, { etat: c.etat })).data,
    onSuccess: (data) => {
      queryClient.setQueryData<MemoireTechnique | null | undefined>(['memoire', project.id], (ancien) =>
        ancien ? { ...ancien, content_json: { ...ancien.content_json, _etat_sections: data.etats } } : ancien)
    },
    onError: () => setGenError('Ce choix n’a pas pu être enregistré. Réessayez dans un instant.'),
  })

  // E2 — « Refaire cette partie » : confirmation (avec le coût estimé), puis même suivi que la génération.
  const [aRefaire, setARefaire] = useState<CibleRefaire | null>(null)
  const { mutate: refaire, isPending: envoiRefaire } = useMutation({
    mutationFn: (c: CibleRefaire) =>
      api.post<{ status: string }>(`/projects/${project.id}/memoire/sections/${c.part}/${c.cle}/refaire`, {}, { timeout: 60_000 }),
    onSuccess: () => {
      setGenError(null)
      setARefaire(null)
      setRunning(true)
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
    onError: (err) => {
      setARefaire(null)
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail : null
      setGenError(typeof msg === 'string' ? msg : 'Cette partie n’a pas pu être lancée. Réessayez dans un instant.')
    },
  })

  // Le run est détaché : l'état vivant est porté par processing_status
  // (reprise après reload) + le flux SSE (progression temps réel).
  const isRunning = isGenerating || running || project.processing_status === 'generating'
  const refaitUnePartie = envoiRefaire || (project.processing_detail ?? '').startsWith('refaire:')

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
            avis={avisAttente}
            onArrierePlan={() => navigate('/dashboard')}
          />
        )}

        <GabaritEtape
          titre="Rédiger le mémoire"
          utilite="Synorix rédige chaque partie du plan, à partir de votre dossier et de Mon entreprise."
          actionsSecondaires={hasMemoire ? (
            <button type="button" onClick={() => setShowForm(false)} className={BOUTON_SECONDAIRE}>Retour</button>
          ) : (
            <button type="button" onClick={() => navigate(`/projects/${project.id}/plan`)} className={BOUTON_SECONDAIRE}>Voir le plan</button>
          )}
          resume={<BandeResume libelle="Résumé de la rédaction" cartes={cartesPreparation(plan ?? null, techPct)} />}
        >
          {hasMemoire && (
            <p className="text-sm font-medium text-warning">La régénération remplacera la version actuelle du mémoire.</p>
          )}
          <SectionEtape titre="CE QUE LE RÈGLEMENT NOTE" description="La pondération relevée dans le règlement de consultation, hors prix.">
            <PoidsMemoire techPct={techPct} />
            {criteres.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Pondération relevée dans le règlement">
                {criteres.map((c) => (
                  <li key={c.nom} className="pill pill-muted num-mono">{c.nom} {c.poids}&nbsp;%</li>
                ))}
              </ul>
            )}
          </SectionEtape>
          <SectionEtape titre="VOS INFORMATIONS POUR CE MÉMOIRE">
            <FormulaireMemoire
              projectId={project.id}
              variables={variables}
              onVariables={setVariables}
              onPreflight={handlePreflightChange}
              stats={profileStats ?? null}
              hasMemoire={hasMemoire}
              enCours={isRunning}
              erreur={genError || (!isRunning && project.processing_status === 'error')
                ? (genError ?? project.processing_detail ?? 'La génération du mémoire a échoué. Relancez la génération.')
                : null}
              onGenerer={() => {
                setGenError(null)
                generate()
              }}
            />
          </SectionEtape>
        </GabaritEtape>

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
          title={refaitUnePartie ? 'Synorix IA refait cette partie' : 'Synorix IA rédige votre mémoire'}
          steps={MEMOIRE_GEN_STEPS}
          currentStep={memoireSse.step}
          progress={memoireSse.progress}
          detail={memoireSse.detail || 'Préparation du contexte…'}
          phase={memoireSse.phase}
          avis={avisAttente}
          onArrierePlan={() => navigate('/dashboard')}
        />
      )}

      {aRefaire && (
        <ConfirmationRefaire
          cible={aRefaire} enCours={envoiRefaire}
          onConfirmer={() => refaire(aRefaire)} onAnnuler={() => setARefaire(null)}
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

      <GabaritEtape
        titre="Rédiger le mémoire"
        utilite={`${lotName} : relisez, retouchez, refaites une partie, puis passez à l’export.`}
        actionPrincipale={
          <button type="button" className="signature-btn w-full [@media(pointer:coarse)]:min-h-11" onClick={() => navigate(`/projects/${project.id}/export`)}>
            Passer à l’export
          </button>
        }
        actionsSecondaires={
          <>
            <RelectureMemoire projectId={project.id} />
            <button type="button" onClick={() => setShowEditor(true)} className={BOUTON_SECONDAIRE}>
              <Pencil size={13} aria-hidden /> Modifier
            </button>
            <button type="button" onClick={() => navigate(`/projects/${project.id}/plan`)} className={BOUTON_SECONDAIRE}>Voir le plan</button>
          </>
        }
        resume={
          <BandeResume
            libelle="Résumé du mémoire"
            cartes={cartesRedaction({
              version: memoire!.version, completionPct, rattachement, nbARefaire: Object.keys(etats ?? {}).length,
              pages: pagesEstimees(displayContent), limite: plan?.limite_pages?.pages ?? null,
            })}
          />
        }
        barre={
          <BarreEtape className="justify-between gap-3">
            <BilanBarre bureau={<span className="text-sm text-fg-2">Version {memoire!.version} · {completionPct}&nbsp;% rédigé</span>} />
            <ActionsBarreTel>
              <BoutonSuite etape="Export" onClick={() => navigate(`/projects/${project.id}/export`)} />
            </ActionsBarreTel>
          </BarreEtape>
        }
      >
      <div className="space-y-4" style={{ fontFamily: F }}>

        {/* Échec d'une régénération détachée : signalé sans quitter le doc */}
        {genError && (
          <p
            role="alert"
            className="text-sm rounded-lg px-3 py-2"
            style={{ background: 'color-mix(in srgb, var(--danger-fg) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--danger-fg) 20%, transparent)', color: 'var(--danger-fg)' }}
          >
            {genError}
          </p>
        )}

        {/* ── 3-column layout ────────────────────────────────────── */}
        {displayContent && (
          <div className="flex gap-6 items-start">

            {/* LEFT — Table of Contents */}
            <div className="shrink-0 hidden xl:block">
              <SommaireMemoire
                entrees={sommaire} activeSection={activeSection} onNavigate={handleTocNavigate}
                criteres={rattachement} sourceCriteres={sourceCriteres} onOpenSource={source.ouvrir} etats={etats}
              />
            </div>

            {/* CENTER — Document (sous 1280 px le sommaire se replie au-dessus) */}
            <div className="flex-1 min-w-0">
              <div className="xl:hidden mb-3">
                <SommaireMemoire
                  repliable entrees={sommaire} activeSection={activeSection} onNavigate={handleTocNavigate}
                  criteres={rattachement} sourceCriteres={sourceCriteres} onOpenSource={source.ouvrir} etats={etats}
                />
              </div>
              <DocumentView content={displayContent} project={project} docRef={docRef} onRefaire={setARefaire} refaireDesactive={isRunning} etats={etats} onEtat={(c, e) => definirEtat({ ...c, etat: e })} />
            </div>

            {/* RIGHT — Assistant Synorix (cède la place au dossier quand « Voir dans le dossier » est ouvert) */}
            <div className={`shrink-0 hidden${source.ouvert ? '' : ' lg:block'}`} style={{ width: 280 }}>
              <div className="sticky top-4 space-y-3">

                {/* Header */}
                <div>
                  <p className="microlabel">Compagnon Synorix</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                    Deux contrôles faits sur le texte de ce mémoire
                  </p>
                </div>

                {/* Contrôle 1 — références chantier retrouvées dans le texte */}
                <div
                  className="glass-card rounded-lg p-3.5"
                  style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)', fontFamily: F }}>
                    Références chantier
                  </p>
                  {controleRefs && controleRefs.retrouvees.length + controleRefs.nonRetrouvees.length > 0 ? (
                    <>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                        {controleRefs.retrouvees.length} de vos {controleRefs.retrouvees.length + controleRefs.nonRetrouvees.length}{' '}
                        références retrouvées dans le texte.
                      </p>
                      {controleRefs.nonRetrouvees.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {controleRefs.nonRetrouvees.map((r) => (
                            <li key={r.id} className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                              « {r.intitule} » n'y figure pas telle quelle.
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                      Aucune référence marquée dans{' '}
                      <Link to="/references" className="underline underline-offset-2" style={{ color: 'var(--text-1)' }}>Mes références</Link>.
                    </p>
                  )}
                </div>

                {/* Contrôle 2 — sections brèves */}
                <div
                  className="glass-card rounded-lg p-3.5"
                  style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)', fontFamily: F }}>
                    Sections brèves
                  </p>
                  {breves.length === 0 ? (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                      Toutes les sections font au moins {SEUIL_SECTION_BREVE} mots.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                        {breves.length} section{breves.length > 1 ? 's font' : ' fait'} moins de {SEUIL_SECTION_BREVE} mots, à étoffer si besoin :
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {breves.map((sb) => (
                          <li key={`${sb.part}-${sb.cle}`}>
                            <button
                              onClick={() => handleTocNavigate(`sec-${sb.cle}`)}
                              className="text-left text-xs leading-relaxed hover:underline underline-offset-2"
                              style={{ color: 'var(--text-1)' }}
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
            {source.panneau}
          </div>
        )}
      </div>
      </GabaritEtape>
    </>
  )
}
