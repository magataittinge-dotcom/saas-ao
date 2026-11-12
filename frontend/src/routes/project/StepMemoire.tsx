import { useAvisAttente } from '@/hooks/useAvisAttente'
import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import axios from 'axios'
import { memoireDepuisReponse } from '@/lib/memoireLecture'
import { api } from '@/services/api'
import { libellePassagesACompleter } from '@/lib/passagesACompleter'
import FormulaireMemoire from '@/components/project/FormulaireMemoire'
import BarreEtape, { BoutonSuite } from '@/components/project/BarreEtape'
import { type PreflightSelection } from '@/components/project/MemoirePreflight'
import { VARIABLES_VIDES, corpsGeneration } from '@/lib/memoireGeneration'
import ProgressDisplay, { type StepDescriptor } from '@/components/common/ProgressDisplay'
import { useProgressStream } from '@/hooks/useProgressStream'
import SubscriptionWall from '@/components/common/SubscriptionWall'
import { Sigle } from '@/components/common/Sigle'
import PoidsMemoire from '@/components/project/PoidsMemoire'
import RelectureMemoire from '@/components/memoire/RelectureMemoire'
import {
  ActionsBarreTel, BandeResume, BilanBarre, GabaritEtape, SectionEtape, type CarteResume,
} from '@/components/etape'
import { Bouton } from '@/components/ui/bouton'
import { EtatErreur } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { Squelette, SqueletteLignes } from '@/components/ui/squelette'
import { ETAT_A_VERIFIER, ETAT_PRET, type VuePlan } from '@/lib/planMemoire'
import type { Project, MemoireTechnique, MemoireContent, Reference } from '@/types'
import { referencesRetrouvees, sectionsBreves } from '@/lib/memoireControles'
import { sectionsDuContenu, sommaireMemoire } from '@/lib/memoireSections'
import SommaireMemoire from '@/components/memoire/SommaireMemoire'
import ControlesTexte from '@/components/memoire/ControlesTexte'
import { DocumentView } from '@/components/memoire/DocumentMemoire'
import EditeurMemoire from '@/components/memoire/EditeurMemoire'
import ConfirmationRefaire, { type CibleRefaire } from '@/components/memoire/RefaireSection'
import { etatsDuMemoire, type EtatPartie, type EtatsSections } from '@/lib/memoireEtats'
import { useSourceChamp } from '@/hooks/useSourceChamp'
import { useMedia } from '@/hooks/useMedia'
import type { RattachementCriteres } from '@/lib/memoireCriteres'
import type { CriticalFieldsPayload } from '@/components/project/CriticalBanner'

export { DocumentView }

const MEMOIRE_GEN_STEPS: StepDescriptor[] = [
  { key: 'preparing',  label: 'Synorix relit votre dossier',     estimated_s: 3 },
  { key: 'generating', label: 'Synorix rédige chaque partie',    estimated_s: 120 },
  { key: 'finalizing', label: 'Synorix met le mémoire en forme', estimated_s: 5 },
]

const TITRE = 'Rédiger le mémoire'

/** Les cartes de l'écran de préparation : le plan suivi, le poids dans la note, ce que la rédaction décompte. */
export function cartesPreparation(plan: VuePlan | null, techPct: number): CarteResume[] {
  return [
    plan
      ? {
        libelle: 'Plan', valeur: `${plan.resume.parties} parties`, etat: plan.valide ? ETAT_PRET : ETAT_A_VERIFIER,
        detail: plan.valide ? 'Plan validé : la rédaction le suit.' : 'Plan non validé : le plan du modèle sera suivi.',
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

/**
 * Les cartes du mémoire rédigé : avancement, critères traités, parties à refaire, longueur. `passages` : le compte du
 * serveur (celui de l'Export) ; la carte « Rédaction » dit alors la même phrase que l'Export, mot pour mot.
 */
export function cartesRedaction({ version, completionPct, rattachement, nbARefaire, pages, limite, passages }: {
  version: number
  completionPct: number
  passages?: number | null
  rattachement: RattachementCriteres | undefined
  nbARefaire: number
  pages: number
  limite: number | null
}): CarteResume[] {
  const total = rattachement?.sous_criteres.length ?? 0
  const traites = rattachement?.sous_criteres.filter((s) => s.traite).length ?? 0
  const aCompleter = libellePassagesACompleter(passages)
  return [
    {
      libelle: 'Rédaction', valeur: `${completionPct} %`, jauge: { rempli: completionPct, total: 100 },
      etat: aCompleter ? ETAT_A_VERIFIER : undefined, detail: aCompleter ?? `Version ${version}`,
    },
    total > 0
      ? {
        libelle: 'Critères du règlement', valeur: `${traites} sur ${total}`, etat: traites === total ? ETAT_PRET : ETAT_A_VERIFIER,
        jauge: traites === total ? undefined : { rempli: traites, total }, detail: traites === total ? 'Chaque sous-critère est traité.' : `${total - traites} à couvrir`,
      }
      : { libelle: 'Critères du règlement', valeur: 'Non détaillés', detail: 'Le règlement ne détaille pas de sous-critères.' },
    nbARefaire > 0
      ? { libelle: 'Parties à refaire', valeur: String(nbARefaire), etat: ETAT_A_VERIFIER, detail: 'Marquées « À refaire » dans le sommaire.' }
      : { libelle: 'Parties à refaire', valeur: 'Aucune', rien: 'Aucune', etat: ETAT_PRET, detail: 'Toutes les parties sont rédigées.' },
    limite
      ? { libelle: 'Longueur', valeur: `environ ${pages} pages`, etat: pages <= limite ? ETAT_PRET : ETAT_A_VERIFIER, detail: `Limite du dossier : ${limite} pages.` }
      : { libelle: 'Longueur', valeur: `environ ${pages} pages`, detail: 'Le dossier ne fixe pas de limite.' },
  ]
}

interface Props { project: Project }

export default function StepMemoire({ project }: Props) {
  const navigate = useNavigate()
  const avisAttente = useAvisAttente('mémoire')
  // Au téléphone, l'action principale est portée par la barre du bas (« Suivant : Export ») : l'en-tête ne la monte pas, pour
  // que le bouton de suite garde l'aplat (il le cède dès qu'un autre bouton principal est monté, même caché).
  const tel = useMedia('(max-width: 768px)')
  const queryClient = useQueryClient()
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null)
  const [variables, setVariables] = useState(VARIABLES_VIDES)
  const [showForm, setShowForm] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editedContent, setEditedContent] = useState<MemoireContent | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  // Run DÉTACHÉ : `running` couvre le lancement local ; après un reload,
  // project.processing_status === 'generating' reprend le relais (même
  // architecture que l'analyse).
  const [running, setRunning] = useState(false)
  const [activeSection, setActiveSection] = useState('preambule')
  const docRef = useRef<HTMLDivElement | null>(null)

  // Le mémoire. 204 = pas encore de mémoire (R31) : un état normal. Toute autre panne est une ERREUR, jamais « pas de
  // mémoire » : l'écran ne propose pas de rédiger par-dessus un mémoire qu'il n'a pas su lire (audit F-03).
  const requeteMemoire = useQuery({
    queryKey: ['memoire', project.id],
    queryFn: async () => {
      const res = await api.get<MemoireTechnique | ''>(`/projects/${project.id}/memoire`)
      return memoireDepuisReponse<MemoireTechnique>(res.status, res.data)
    },
    retry: false,
  })
  const { data: memoire, isLoading } = requeteMemoire

  // « N passages à compléter avant le dépôt » et le nombre de pages : une seule source, les comptes du serveur que lit
  // aussi l'Export (même clé de cache, même lecture). Sans réponse : pas de phrase des passages, et l'estimation locale
  // des pages en attendant.
  const { data: comptesExport } = useQuery({
    queryKey: ['export-detail', project.id],
    queryFn: async () => (await api.get<{ memoire_info: { passages_a_completer: number; estimated_pages: number } | null }>(`/projects/${project.id}/export/detail`)).data,
    enabled: !!memoire,
    select: (d) => ({ passages: d.memoire_info?.passages_a_completer ?? 0, pages: d.memoire_info?.estimated_pages ?? null }),
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
  const criteres = useMemo(() => project.criteres_jugement ?? [], [project.criteres_jugement])

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

  // Part des sections qui portent un texte
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

  // Contrôles du texte (1.3) : deux contrôles calculés sur le texte, rien d'inventé
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
      setRunning(true)
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
    onError: (err) => {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
      const texte = typeof detail === 'string' ? detail : 'La rédaction n’a pas pu démarrer. Rien n’est décompté ; réessayez dans un instant.'
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

  // E2 — « Refaire cette partie » : confirmation, puis même suivi que la génération.
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

  const finRedaction = () => {
    setRunning(false)
    setEditedContent(null)
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: ['memoire', project.id] })
    queryClient.invalidateQueries({ queryKey: ['export-detail', project.id] })
    queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
  }
  const memoireSse = useProgressStream(project.id, {
    // Abonné une fois la demande acceptée : l'état rattrapé est alors celui de CETTE rédaction, jamais d'une précédente.
    enabled: isRunning && !isGenerating,
    onComplete: finRedaction,
    // Rédaction finie (ou en échec) avant l'abonnement : l'écran relit l'état final au lieu d'attendre une fin déjà passée.
    onRienEnCours: (fin) => {
      if (fin === 'completed') { finRedaction(); return }
      setRunning(false)
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    },
  })

  // Échec du run détaché → statut error explicite + relance possible,
  // jamais d'attente infinie ni de régression d'étape.
  useEffect(() => {
    if (memoireSse.phase === 'error') {
      setRunning(false)
      setGenError(memoireSse.detail || 'La rédaction du mémoire n’a pas abouti. Relancez-la quand vous voulez.')
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoireSse.phase])
  // Pendant l'envoi de la demande, le flux n'est pas encore suivi : l'attente part de zéro, jamais de l'état d'une rédaction
  // précédente (relancée sur le même écran, elle affichait « Terminé » jusqu'à la réponse).
  const flux = isGenerating ? { step: null, progress: 0, detail: '', phase: 'pending' as const } : memoireSse

  const { mutateAsync: saveEdits } = useMutation({
    mutationFn: (content: MemoireContent) =>
      api.patch(`/projects/${project.id}/memoire`, { content_json: content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoire', project.id] })
      queryClient.invalidateQueries({ queryKey: ['export-detail', project.id] })
    },
  })

  // 1.8 — la vue document n'adopte le texte qu'une fois l'enregistrement
  // confirmé : si le serveur refuse, elle reste à l'état précédent et le
  // texte reste dans l'éditeur (message + « Réessayer »).
  const handleEditorSave = async (contenu: MemoireContent) => {
    await saveEdits(contenu)
    setEditedContent(contenu)
  }

  const handleTocNavigate = useCallback((sectionId: string) => {
    setActiveSection(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // ── Chargement, puis erreur : le titre de l'étape reste, le formulaire de rédaction ne revient jamais par défaut ──

  if (isLoading) {
    return (
      <GabaritEtape titre={TITRE} utilite="Votre mémoire, partie par partie.">
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Chargement du mémoire</span>
          {/* la bande de cases, à sa forme : une surface, des filets, aucune valeur écrite */}
          <div aria-hidden="true" className="grid grid-cols-2 divide-bord rounded-carte border border-bord bg-surface-0 md:grid-cols-4 md:divide-x">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid content-start gap-3 p-5 max-md:p-4">
                <Squelette className="h-4 w-24 max-w-full" />
                <Squelette className="h-6 w-16" />
              </div>
            ))}
          </div>
          <div className="rounded-carte border border-bord bg-surface-0 px-5 py-8 sm:px-10 sm:py-12">
            <div className="mx-auto max-w-[38rem] space-y-8">
              <Squelette className="h-6 w-2/5" />
              <SqueletteLignes lignes={5} />
              <SqueletteLignes lignes={4} />
            </div>
          </div>
        </div>
      </GabaritEtape>
    )
  }

  if (requeteMemoire.isError) {
    return (
      <GabaritEtape titre={TITRE} utilite="Votre mémoire, partie par partie.">
        <EtatErreur
          titre="Le mémoire n’a pas pu s’ouvrir"
          detail="La connexion au serveur a échoué. Votre mémoire n’est pas touché : il reviendra tel que vous l’avez laissé."
          onReessayer={() => { void requeteMemoire.refetch() }} enCours={requeteMemoire.isFetching}
        />
      </GabaritEtape>
    )
  }

  const hasMemoire = !!memoire
  const lotName = project.selected_lot_name || 'Lot unique'
  const echecRedaction = !isRunning && project.processing_status === 'error'

  // ── Generation form (no mémoire yet or regenerate) ─────────────

  if (!hasMemoire || showForm) {
    return (
      <>
        <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" message={paywallMessage} />
        {isRunning && (
          <ProgressDisplay
            variant="modal"
            title="Synorix rédige votre mémoire"
            steps={MEMOIRE_GEN_STEPS}
            currentStep={flux.step ?? 'preparing'}
            progress={flux.progress}
            detail={flux.detail || 'Vous retrouverez le mémoire ici, partie par partie.'}
            phase={flux.phase}
            avis={avisAttente}
            onArrierePlan={() => navigate('/dashboard')}
          />
        )}

        <GabaritEtape
          titre={TITRE}
          utilite="Synorix rédige chaque partie du plan, à partir de votre dossier et de Mon entreprise."
          actionsSecondaires={hasMemoire ? (
            <Bouton variante="secondaire" onClick={() => setShowForm(false)}>Retour</Bouton>
          ) : (
            <Bouton variante="secondaire" onClick={() => navigate(`/projects/${project.id}/plan`)}>Voir le plan</Bouton>
          )}
          message={hasMemoire ? <Message ton="attention">Une nouvelle rédaction remplacera la version actuelle du mémoire.</Message> : undefined}
          resume={<BandeResume libelle="Résumé de la rédaction" cartes={cartesPreparation(plan ?? null, techPct)} />}
        >
          <SectionEtape titre="Ce que le règlement note" description={<>La pondération relevée dans le <Sigle code="RC" />, hors prix.</>}>
            <PoidsMemoire techPct={techPct} />
            {criteres.length > 0 && (
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-2" aria-label="Pondération relevée dans le règlement">
                {criteres.map((c) => (
                  <li key={c.nom}>{c.nom} · <span className="chiffres font-medium text-fg">{c.poids}&nbsp;%</span></li>
                ))}
              </ul>
            )}
          </SectionEtape>
          <SectionEtape titre="Vos informations pour ce mémoire">
            <FormulaireMemoire
              projectId={project.id}
              variables={variables}
              onVariables={setVariables}
              onPreflight={handlePreflightChange}
              stats={profileStats ?? null}
              hasMemoire={hasMemoire}
              enCours={isRunning}
              erreur={genError || echecRedaction
                ? (genError ?? (project.processing_detail || 'La rédaction du mémoire s’est arrêtée avant la fin. Rien n’a été décompté de votre abonnement.'))
                : null}
              echec={echecRedaction && !genError}
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

  // ── Le mémoire : la feuille au centre, le sommaire et les contrôles autour ─────────────────────

  const sommaireProps = {
    entrees: sommaire, activeSection, onNavigate: handleTocNavigate,
    criteres: rattachement, sourceCriteres, onOpenSource: source.ouvrir, etats,
  }
  const controlesProps = { references: controleRefs, breves, onAller: handleTocNavigate }

  return (
    <>
      <SubscriptionWall open={showPaywall} onClose={() => setShowPaywall(false)} feature="memoire" message={paywallMessage} />
      {isRunning && (
        <ProgressDisplay
          variant="modal"
          title={refaitUnePartie ? 'Synorix refait cette partie' : 'Synorix rédige votre mémoire'}
          steps={MEMOIRE_GEN_STEPS}
          currentStep={flux.step ?? 'preparing'}
          progress={flux.progress}
          detail={flux.detail || 'Vous retrouverez le mémoire ici, partie par partie.'}
          phase={flux.phase}
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

      {showEditor && displayContent && (
        <EditeurMemoire content={displayContent} projectId={project.id} onSave={handleEditorSave} onClose={() => setShowEditor(false)} />
      )}

      <GabaritEtape
        titre={TITRE}
        utilite={`${lotName} : relisez, retouchez, refaites une partie, puis passez à l’export.`}
        actionPrincipale={tel ? undefined : (
          <Bouton variante="principal" large onClick={() => navigate(`/projects/${project.id}/export`)}>Passer à l’export</Bouton>
        )}
        actionsSecondaires={
          <>
            <RelectureMemoire projectId={project.id} />
            <Bouton variante="secondaire" onClick={() => setShowEditor(true)}>
              <Pencil aria-hidden /> Modifier le texte
            </Bouton>
            <Bouton variante="lien" onClick={() => navigate(`/projects/${project.id}/plan`)}>Voir le plan</Bouton>
          </>
        }
        message={genError
          ? <Message ton="erreur" onFermer={() => setGenError(null)}>{genError}</Message>
          : echecRedaction
            ? <Message ton="erreur">La dernière rédaction n’a pas abouti. Le texte ci-dessous est celui d’avant ; refaites la partie voulue quand vous voulez.</Message>
            : undefined}
        resume={
          <BandeResume
            libelle="Résumé du mémoire"
            cartes={cartesRedaction({
              version: memoire!.version, completionPct, rattachement, nbARefaire: Object.keys(etats ?? {}).length,
              pages: comptesExport?.pages ?? pagesEstimees(displayContent), limite: plan?.limite_pages?.pages ?? null,
              passages: comptesExport?.passages,
            })}
          />
        }
        barre={
          <BarreEtape className="justify-between gap-3">
            <BilanBarre
              bureau={<span className="text-sm text-fg-2">Version {memoire!.version} · {completionPct}&nbsp;% rédigé</span>}
              tel={<span className="truncate text-sm text-fg-2">Version {memoire!.version}</span>}
            />
            <ActionsBarreTel>
              <BoutonSuite etape="Export" onClick={() => navigate(`/projects/${project.id}/export`)} />
            </ActionsBarreTel>
          </BarreEtape>
        }
      >
        {displayContent && (
          <div className="flex min-w-0 items-start gap-8">
            <div className="hidden shrink-0 self-stretch xl:block">
              <SommaireMemoire {...sommaireProps} />
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="xl:hidden">
                <SommaireMemoire repliable {...sommaireProps} />
              </div>
              <DocumentView content={displayContent} project={project} docRef={docRef} onRefaire={setARefaire} refaireDesactive={isRunning} etats={etats} onEtat={(c, e) => definirEtat({ ...c, etat: e })} />
              {/* A14 — sous 1 024 px, les contrôles du texte passent sous le document, repliés */}
              <ControlesTexte repliable className="lg:hidden" {...controlesProps} />
            </div>

            {/* Les contrôles cèdent la place au dossier quand « Voir dans le dossier » est ouvert */}
            {!source.ouvert && <ControlesTexte className="hidden shrink-0 lg:block" {...controlesProps} />}
            {source.panneau}
          </div>
        )}
      </GabaritEtape>
    </>
  )
}
